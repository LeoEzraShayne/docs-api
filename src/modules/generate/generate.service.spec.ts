import { DocumentType, ProjectStatus } from '@prisma/client';
import { DOCUMENT_CONFIG } from '../documents/document-config';
import { GenerateService } from './generate.service';

describe('GenerateService requirements-v2 preview', () => {
  it('stores the full 12-sheet result and returns a redacted v2 preview', async () => {
    const tabs = Object.fromEntries(
      DOCUMENT_CONFIG[DocumentType.REQUIREMENTS].sheets.map((sheet) => [
        sheet.name,
        [Object.fromEntries(sheet.columns.map((column) => [column, column]))],
      ]),
    );
    const tx = {
      projectVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ versionNo: 1 }),
      },
      project: { update: jest.fn().mockResolvedValue({}) },
      previewUsage: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn(),
      },
    };
    const prisma = {
      previewUsage: { findFirst: jest.fn().mockResolvedValue(null) },
      project: { count: jest.fn().mockResolvedValue(1) },
      entitlement: {
        findUnique: jest.fn().mockResolvedValue({ planType: 'FREE' }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (client: typeof tx) => unknown) =>
          callback(tx),
        ),
    };
    const projects = {
      getOwnedProject: jest.fn().mockResolvedValue({
        id: 'project-1',
        docTitle: '受注管理',
        formFields: {},
        minutesText: '',
        lastGenerateAt: null,
      }),
    };
    const generator = { generate: jest.fn().mockResolvedValue(tabs) };
    const entitlements = {
      getBillingSummary: jest.fn().mockResolvedValue({ remaining: 2 }),
    };
    const alert = {
      resetFailures: jest.fn(),
      recordConsecutiveFailure: jest.fn(),
    };
    const service = new GenerateService(
      prisma as never,
      projects as never,
      generator as never,
      {} as never,
      entitlements as never,
      alert as never,
    );

    const response = await service.generate('user-1', 'project-1', {
      mode: 'preview',
      quality: 'high',
      ip: '203.0.113.10',
    });

    expect(response.schema).toBe('requirements-v2');
    expect(Object.keys(response.tabs)).toHaveLength(12);
    expect(response.tabs['機能要件一覧'][0]['概要']).toBe(
      '（正式生成後に表示）',
    );
    expect(generator.generate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'project-1' }),
      'standard',
    );
    const createCalls = tx.projectVersion.create.mock.calls as unknown as Array<
      [{ data: { extractedJson: unknown; quality: string } }]
    >;
    expect(createCalls[0][0].data.extractedJson).toEqual(tabs);
    expect(createCalls[0][0].data.quality).toBe('standard');
    const updateCalls = tx.project.update.mock.calls as unknown as Array<
      [{ data: { status: ProjectStatus } }]
    >;
    expect(updateCalls[0][0].data.status).toBe(ProjectStatus.READY);
  });
});
