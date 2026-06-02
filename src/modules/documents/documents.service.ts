import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType, Prisma } from '@prisma/client';
import { assertGenerationAccess, getOwnedProject } from './document-access';
import { DOCUMENT_CONFIG } from './document-config';
import { GenerateInput } from './document-generate.types';
import { DocumentGrantsService } from './document-grants.service';
import { normalizeDocumentOutput, selectSheets } from './document-output';
import { DocumentPromptService } from './document-prompt.service';
import {
  emptyDocumentNode,
  toDocumentDto,
  toVersionDto,
} from './document-response';
import { defaultSource, resolveSourceVersion } from './document-source';
import {
  requireDocumentType,
  validateDocumentCooldown,
  validateGenerateInput,
} from './document-validation';
import { saveDocumentVersion } from './document-version-writer';
import { ExcelService } from '../generate/excel.service';
import { PrismaService } from '../prisma/prisma.service';

const DOCUMENT_WITH_RELATIONS = {
  project: true,
  versions: { orderBy: { versionNo: 'desc' as const } },
  grants: true,
} satisfies Prisma.DocumentInclude;

type DocumentWithRelations = Prisma.DocumentGetPayload<{
  include: typeof DOCUMENT_WITH_RELATIONS;
}>;

type BusinessPackPool = {
  remainingGenerations: number;
  expiresAt: Date | null;
  singleDocumentGrantCaps: Partial<Record<DocumentType, number>>;
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly grants: DocumentGrantsService,
    private readonly prompts: DocumentPromptService,
    private readonly excel: ExcelService,
  ) {}

  async list(userId: string, projectId: string) {
    await getOwnedProject(this.prisma, userId, projectId);
    const [documents, businessPackPool] = await Promise.all([
      this.prisma.document.findMany({
        where: { projectId },
        include: {
          project: true,
          versions: { orderBy: { versionNo: 'desc' }, take: 20 },
          grants: true,
        },
        orderBy: { type: 'asc' },
      }),
      this.getBusinessPackPool(userId),
    ]);
    return documents.map((document) =>
      toDocumentDto(
        this.withEffectiveGrant(userId, document, businessPackPool),
      ),
    );
  }

  async tree(userId: string, projectId: string) {
    const existing = await this.list(userId, projectId);
    return Object.values(DocumentType).map(
      (type) =>
        existing.find((doc) => doc.type === type) ?? emptyDocumentNode(type),
    );
  }

  async get(userId: string, projectId: string, typeParam: string) {
    const type = requireDocumentType(typeParam);
    const document = await this.ensureDocument(userId, projectId, type);
    const activated = await this.activateTypedSingleDocumentCredit(
      userId,
      document,
      type,
    );
    return toDocumentDto(
      this.withEffectiveGrant(
        userId,
        activated,
        await this.getBusinessPackPool(userId),
      ),
    );
  }

  async generate(
    userId: string,
    projectId: string,
    typeParam: string,
    input: GenerateInput,
  ) {
    const type = requireDocumentType(typeParam);
    const document = await this.ensureDocument(userId, projectId, type);
    if (input.idempotencyKey) {
      const existing = await this.findIdempotent(
        document.id,
        input.idempotencyKey,
      );
      if (existing)
        return toVersionDto(
          this.withEffectiveGrant(
            userId,
            document,
            await this.getBusinessPackPool(userId),
          ),
          existing,
        );
    }
    validateDocumentCooldown(document.lastGenerateAt);
    const sourceType = input.sourceType ?? defaultSource(type);
    validateGenerateInput(type, sourceType, input);
    await assertGenerationAccess(this.prisma, userId, document.id);

    const selectedSheets = selectSheets(
      type,
      input.generationMode,
      input.selectedSheets,
    );
    const source = await resolveSourceVersion(
      this.prisma,
      userId,
      projectId,
      sourceType,
      input.sourceDocumentVersionId,
    );
    const raw = await this.prompts.generate(
      type,
      {
        project: {
          id: document.project.id,
          docTitle: document.project.docTitle,
          formFields: document.project.formFields,
        },
        inputJson: input.inputJson ?? {},
        source,
        selectedSheets,
        testViewpoints: input.testViewpoints,
      },
      input.quality ?? 'standard',
    );
    const output = normalizeDocumentOutput(type, selectedSheets, raw);
    const version = await saveDocumentVersion(this.prisma, this.grants, {
      userId,
      documentId: document.id,
      projectId,
      type,
      sourceType,
      input,
      selectedSheets,
      extractedJson: output.sheets,
    });
    const updated = await this.getDocumentById(document.id);
    return toVersionDto(
      this.withEffectiveGrant(
        userId,
        updated,
        await this.getBusinessPackPool(userId),
      ),
      version,
    );
  }

  async download(
    userId: string,
    projectId: string,
    typeParam: string,
    versionNo: number,
    requestId?: string,
  ) {
    const document = await this.ensureDocument(
      userId,
      projectId,
      requireDocumentType(typeParam),
    );
    const version = await this.prisma.documentVersion.findUnique({
      where: { documentId_versionNo: { documentId: document.id, versionNo } },
    });
    if (!version)
      throw new NotFoundException('文書バージョンが見つかりません。');
    const buffer = await this.excel.generateWorkbook({
      docTitle: document.title,
      documentType: document.type,
      extractedJson: version.extractedJson as Record<
        string,
        Record<string, unknown>[]
      >,
      requestId,
    });
    return { filename: `${document.title}-v${versionNo}.xlsx`, buffer };
  }

  private async ensureDocument(
    userId: string,
    projectId: string,
    type: DocumentType,
  ) {
    await getOwnedProject(this.prisma, userId, projectId);
    return this.prisma.document.upsert({
      where: { projectId_type: { projectId, type } },
      create: { projectId, type, title: DOCUMENT_CONFIG[type].title },
      update: {},
      include: DOCUMENT_WITH_RELATIONS,
    });
  }

  private async activateTypedSingleDocumentCredit(
    userId: string,
    document: DocumentWithRelations,
    type: DocumentType,
  ) {
    const now = new Date();
    const activeGrant = document.grants.find(
      (grant) =>
        grant.userId === userId &&
        grant.expiresAt > now &&
        grant.remainingGenerations > 0,
    );
    if (activeGrant) return document;

    const credit = await this.prisma.documentCredit.findFirst({
      where: {
        userId,
        quantity: { gt: 0 },
        expiresAt: { gt: now },
        source: `single_document:${type}`,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!credit) return document;

    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction([
      this.prisma.documentCredit.update({
        where: { id: credit.id },
        data: { quantity: { decrement: 1 } },
      }),
      this.prisma.entitlement.update({
        where: { userId },
        data: { oneshotCredits: { decrement: 1 } },
      }),
      this.prisma.documentGrant.upsert({
        where: { documentId: document.id },
        create: {
          userId,
          documentId: document.id,
          documentType: type,
          remainingGenerations: 3,
          expiresAt,
        },
        update: {
          remainingGenerations: { increment: 3 },
          expiresAt,
        },
      }),
    ]);

    return this.getDocumentById(document.id);
  }

  private async getBusinessPackPool(userId: string): Promise<BusinessPackPool> {
    const now = new Date();
    const [credits, payments] = await Promise.all([
      this.prisma.documentCredit.findMany({
        where: {
          userId,
          source: 'business_pack',
          quantity: { gt: 0 },
          expiresAt: { gt: now },
        },
        orderBy: { expiresAt: 'asc' },
      }),
      this.prisma.payment.findMany({
        where: {
          userId,
          status: 'paid',
        },
        select: { metadata: true },
      }),
    ]);

    return {
      remainingGenerations: credits.reduce(
        (sum, credit) => sum + credit.quantity,
        0,
      ),
      expiresAt: credits[0]?.expiresAt ?? null,
      singleDocumentGrantCaps: payments.reduce<
        Partial<Record<DocumentType, number>>
      >((caps, payment) => {
        const documentType = paymentDocumentType(payment.metadata);
        if (
          paymentKind(payment.metadata) !== 'single_document' ||
          !documentType
        ) {
          return caps;
        }
        caps[documentType] = (caps[documentType] ?? 0) + 3;
        return caps;
      }, {}),
    };
  }

  private withEffectiveGrant<
    T extends {
      type?: DocumentType;
      grants?: Array<{
        userId: string;
        expiresAt: Date;
        remainingGenerations: number;
      }>;
    },
  >(userId: string, document: T, businessPackPool: BusinessPackPool) {
    const now = new Date();
    const dedicatedGrant = document.grants?.find(
      (grant) =>
        grant.userId === userId &&
        grant.expiresAt > now &&
        grant.remainingGenerations > 0,
    );
    const dedicatedRemaining = Math.min(
      dedicatedGrant?.remainingGenerations ?? 0,
      document.type
        ? (businessPackPool.singleDocumentGrantCaps[document.type] ?? 0)
        : 0,
    );
    const remainingGenerations =
      businessPackPool.remainingGenerations + dedicatedRemaining;
    if (remainingGenerations < 1) return { ...document, effectiveGrant: null };

    const expiresAtCandidates = [
      businessPackPool.expiresAt,
      dedicatedGrant?.expiresAt,
    ].filter((date): date is Date => !!date);
    const expiresAt =
      expiresAtCandidates.sort(
        (left, right) => left.getTime() - right.getTime(),
      )[0] ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return {
      ...document,
      effectiveGrant: {
        remainingGenerations,
        expiresAt,
      },
    };
  }

  private async getDocumentById(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: DOCUMENT_WITH_RELATIONS,
    });
    if (!document) throw new NotFoundException('文書が見つかりません。');
    return document;
  }

  private findIdempotent(documentId: string, idempotencyKey: string) {
    return this.prisma.documentVersion.findFirst({
      where: { documentId, idempotencyKey },
    });
  }
}

function paymentKind(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const kind = (metadata as { kind?: unknown }).kind;
  return typeof kind === 'string' ? kind : undefined;
}

function paymentDocumentType(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const value = (metadata as { documentType?: unknown }).documentType;
  return typeof value === 'string' && isDocumentType(value) ? value : undefined;
}

function isDocumentType(value: string): value is DocumentType {
  return (Object.values(DocumentType) as string[]).includes(value);
}
