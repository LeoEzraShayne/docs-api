import {
  DocumentSourceType,
  DocumentType,
  Prisma,
  ProjectStatus,
} from '@prisma/client';
import { GenerateInput } from './document-generate.types';
import { DocumentGrantsService } from './document-grants.service';

type PrismaLike = {
  $transaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T>;
};

export function saveDocumentVersion(
  prisma: PrismaLike,
  grants: DocumentGrantsService,
  params: {
    userId: string;
    documentId: string;
    projectId: string;
    type: DocumentType;
    sourceType: DocumentSourceType;
    input: GenerateInput;
    selectedSheets: string[];
    extractedJson: Record<string, unknown>;
  },
) {
  return prisma.$transaction(async (tx) => {
    await grants.ensureGrant(tx, params.userId, params.documentId, params.type);
    await grants.consumeGeneration(tx, params.userId, params.documentId);
    const latest = await tx.documentVersion.findFirst({
      where: { documentId: params.documentId },
      orderBy: { versionNo: 'desc' },
    });
    const created = await tx.documentVersion.create({
      data: {
        documentId: params.documentId,
        versionNo: (latest?.versionNo ?? 0) + 1,
        quality: params.input.quality ?? 'standard',
        sourceType: params.sourceType,
        sourceDocumentVersionId: params.input.sourceDocumentVersionId,
        inputJson: (params.input.inputJson ?? {}) as Prisma.InputJsonValue,
        selectedSheets: params.selectedSheets as Prisma.InputJsonValue,
        extractedJson: params.extractedJson as Prisma.InputJsonValue,
        idempotencyKey: params.input.idempotencyKey,
      },
    });
    await tx.document.update({
      where: { id: params.documentId },
      data: { currentVersion: created.versionNo, lastGenerateAt: new Date() },
    });
    await tx.project.update({
      where: { id: params.projectId },
      data: { status: ProjectStatus.READY, lastActivityAt: new Date() },
    });
    return created;
  });
}
