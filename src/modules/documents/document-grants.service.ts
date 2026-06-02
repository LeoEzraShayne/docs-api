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
    const existing = await tx.documentGrant.findUnique({
      where: { documentId },
    });
    if (
      existing &&
      existing.userId === userId &&
      existing.expiresAt > now &&
      existing.remainingGenerations > 0
    ) {
      return existing;
    }

    const credit = await tx.documentCredit.findFirst({
      where: {
        userId,
        quantity: { gt: 0 },
        expiresAt: { gt: now },
        OR: [
          { source: `single_document:${documentType}` },
          { source: 'single_document' },
        ],
      },
      orderBy: { expiresAt: 'asc' },
    });
    if (!credit) return null;

    await tx.documentCredit.update({
      where: { id: credit.id },
      data: { quantity: { decrement: 1 } },
    });
    await tx.entitlement.update({
      where: { userId },
      data: { oneshotCredits: { decrement: 1 } },
    });
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return tx.documentGrant.upsert({
      where: { documentId },
      create: { userId, documentId, documentType, expiresAt },
      update: { remainingGenerations: 3, expiresAt },
    });
  }

  async consumeGeneration(
    tx: Prisma.TransactionClient,
    userId: string,
    documentId: string,
    documentType: DocumentType,
  ) {
    const now = new Date();
    const grant = await tx.documentGrant.findUnique({ where: { documentId } });
    const dedicatedGrant =
      grant &&
      grant.userId === userId &&
      grant.remainingGenerations > 0 &&
      grant.expiresAt > now
        ? grant
        : null;
    const businessPackCredit = await tx.documentCredit.findFirst({
      where: {
        userId,
        source: 'business_pack',
        quantity: { gt: 0 },
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: 'asc' },
    });

    if (
      dedicatedGrant &&
      (!businessPackCredit ||
        dedicatedGrant.expiresAt <= businessPackCredit.expiresAt)
    ) {
      return tx.documentGrant.update({
        where: { documentId },
        data: { remainingGenerations: { decrement: 1 } },
      });
    }

    if (businessPackCredit) {
      return this.entitlements.consumeBusinessPackCredit(tx, userId);
    }

    throw new BadRequestException('この文書の残り生成回数がありません。');
  }
}
