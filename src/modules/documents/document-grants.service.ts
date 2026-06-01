import { BadRequestException, Injectable } from '@nestjs/common';
import { DocumentType, Prisma } from '@prisma/client';
import { EntitlementsService } from '../entitlements/entitlements.service';

@Injectable()
export class DocumentGrantsService {
  constructor(private readonly entitlements: EntitlementsService) {}

  async ensureGrant(
    tx: Prisma.TransactionClient,
    userId: string,
    documentId: string,
    documentType: DocumentType,
  ) {
    const now = new Date();
    const existing = await tx.documentGrant.findUnique({ where: { documentId } });
    if (
      existing &&
      existing.userId === userId &&
      existing.expiresAt > now &&
      existing.remainingGenerations > 0
    ) {
      return existing;
    }

    await this.entitlements.consumeDocumentCredit(tx, userId, documentType);
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return tx.documentGrant.upsert({
      where: { documentId },
      create: { userId, documentId, documentType, expiresAt },
      update: { remainingGenerations: 3, expiresAt },
    });
  }

  async consumeGeneration(tx: Prisma.TransactionClient, documentId: string) {
    const grant = await tx.documentGrant.findUnique({ where: { documentId } });
    if (!grant || grant.remainingGenerations < 1 || grant.expiresAt <= new Date()) {
      throw new BadRequestException('この文書の残り生成回数がありません。');
    }

    return tx.documentGrant.update({
      where: { documentId },
      data: { remainingGenerations: { decrement: 1 } },
    });
  }
}
