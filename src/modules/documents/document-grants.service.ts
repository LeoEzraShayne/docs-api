import { BadRequestException, Injectable } from '@nestjs/common';
import { DocumentType, PlanType, Prisma } from '@prisma/client';

@Injectable()
export class DocumentGrantsService {
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

    const entitlement = await tx.entitlement.findUnique({ where: { userId } });
    if (!entitlement || entitlement.oneshotCredits < 1) {
      throw new BadRequestException('No document generation entitlement');
    }

    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await tx.entitlement.update({
      where: { userId },
      data: {
        oneshotCredits: { decrement: 1 },
        planType: PlanType.ONESHOT,
      },
    });

    return tx.documentGrant.upsert({
      where: { documentId },
      create: { userId, documentId, documentType, expiresAt },
      update: { remainingGenerations: 3, expiresAt },
    });
  }

  async consumeGeneration(tx: Prisma.TransactionClient, documentId: string) {
    const grant = await tx.documentGrant.findUnique({ where: { documentId } });
    if (!grant || grant.remainingGenerations < 1 || grant.expiresAt <= new Date()) {
      throw new BadRequestException('No document generations remaining');
    }

    return tx.documentGrant.update({
      where: { documentId },
      data: { remainingGenerations: { decrement: 1 } },
    });
  }
}
