import {
  DocumentSourceType,
  DocumentType,
  ProjectStatus,
} from '@prisma/client';
import { DocumentsService } from './documents.service';

const future = () => new Date(Date.now() + 60_000);

function baseDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    projectId: 'project-1',
    type: DocumentType.REQUIREMENTS,
    title: '要件定義書',
    currentVersion: 0,
    lastGenerateAt: null,
    project: {
      id: 'project-1',
      userId: 'user-1',
      docTitle: '案件',
      formFields: {},
    },
    versions: [],
    grants: [],
    ...overrides,
  };
}

function createService(documentOverrides: Record<string, unknown> = {}) {
  const document = baseDocument(documentOverrides);
  const prisma = {
    project: {
      findUnique: jest.fn().mockResolvedValue(document.project),
      update: jest.fn(),
    },
    document: {
      upsert: jest.fn().mockResolvedValue(document),
      findUnique: jest
        .fn()
        .mockResolvedValue({ ...document, currentVersion: 1 }),
      update: jest.fn(),
    },
    documentVersion: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'version-1',
        versionNo: 1,
        createdAt: new Date('2026-05-30T00:00:00.000Z'),
        extractedJson: {},
      }),
      findUnique: jest.fn(),
    },
    documentGrant: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    documentCredit: {
      findFirst: jest.fn().mockResolvedValue({ id: 'credit-1' }),
    },
    $transaction: jest.fn(async (callback: any) =>
      callback({
        documentGrant: prisma.documentGrant,
        documentVersion: prisma.documentVersion,
        document: prisma.document,
        project: prisma.project,
      }),
    ),
  } as any;
  const grants = {
    ensureGrant: jest.fn().mockResolvedValue({
      id: 'grant-1',
      remainingGenerations: 3,
      expiresAt: future(),
    }),
    consumeGeneration: jest.fn().mockResolvedValue({
      id: 'grant-1',
      remainingGenerations: 2,
      expiresAt: future(),
    }),
  };
  const prompts = {
    generate: jest.fn(),
  };
  const excel = {
    generateWorkbook: jest.fn(),
  };
  return {
    service: new DocumentsService(
      prisma,
      grants as any,
      prompts as any,
      excel as any,
    ),
    prisma,
    grants,
    prompts,
  };
}

describe('DocumentsService', () => {
  it('does not activate grant or consume generation when LLM generation fails', async () => {
    const { service, grants, prompts } = createService();
    prompts.generate.mockRejectedValue(new Error('model failed'));

    await expect(
      service.generate('user-1', 'project-1', DocumentType.REQUIREMENTS, {
        sourceType: DocumentSourceType.PROJECT,
        inputJson: { overview: 'test' },
      }),
    ).rejects.toThrow('model failed');

    expect(grants.ensureGrant).not.toHaveBeenCalled();
    expect(grants.consumeGeneration).not.toHaveBeenCalled();
  });

  it('returns an idempotent version before applying cooldown or entitlement checks', async () => {
    const { service, prisma, grants, prompts } = createService({
      lastGenerateAt: new Date(),
    });
    prisma.documentVersion.findFirst.mockResolvedValue({
      id: 'version-1',
      versionNo: 1,
      createdAt: new Date('2026-05-30T00:00:00.000Z'),
      extractedJson: { 項目概要: [] },
    });

    const result = await service.generate(
      'user-1',
      'project-1',
      DocumentType.REQUIREMENTS,
      {
        sourceType: DocumentSourceType.PROJECT,
        idempotencyKey: 'same-request',
      },
    );

    expect(result.versionNo).toBe(1);
    expect(prisma.documentGrant.findUnique).not.toHaveBeenCalled();
    expect(grants.ensureGrant).not.toHaveBeenCalled();
    expect(prompts.generate).not.toHaveBeenCalled();
  });

  it('activates grant and consumes one generation only after a valid output is ready', async () => {
    const { service, prisma, grants, prompts } = createService();
    prompts.generate.mockResolvedValue({
      sheets: Object.fromEntries(
        [
          '項目概要',
          'スコープ定義',
          '業務要件',
          '機能要件一覧',
          '画面一覧',
          '画面概要',
          '権限一覧',
          'データ項目定義',
          '外部連携/API一覧',
          '非機能要件',
          '業務フロー',
          '課題・リスク一覧',
        ].map((name) => [name, [{ 項目: name, 内容: '内容' }]]),
      ),
    });

    await service.generate('user-1', 'project-1', DocumentType.REQUIREMENTS, {
      sourceType: DocumentSourceType.PROJECT,
      inputJson: { overview: 'test' },
    });

    expect(grants.ensureGrant).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'doc-1',
      DocumentType.REQUIREMENTS,
    );
    expect(grants.consumeGeneration).toHaveBeenCalledWith(
      expect.anything(),
      'doc-1',
    );
    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: { status: ProjectStatus.READY, lastActivityAt: expect.any(Date) },
    });
  });
});
