import { BadRequestException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { DocumentGrantsService } from './document-grants.service';

const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

function txWithGrant(grant: unknown) {
  return {
    documentGrant: {
      findUnique: jest.fn().mockResolvedValue(grant),
      update: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({ id: 'grant-1' }),
    },
  } as any;
}

describe('DocumentGrantsService', () => {
  it('reuses an active grant without consuming a new document credit', async () => {
    const entitlements = { consumeDocumentCredit: jest.fn() };
    const service = new DocumentGrantsService(entitlements as any);
    const active = {
      id: 'grant-1',
      userId: 'user-1',
      expiresAt: future(),
      remainingGenerations: 2,
    };

    await expect(
      service.ensureGrant(
        txWithGrant(active),
        'user-1',
        'doc-1',
        DocumentType.REQUIREMENTS,
      ),
    ).resolves.toBe(active);
    expect(entitlements.consumeDocumentCredit).not.toHaveBeenCalled();
  });

  it('starts a new 3-generation window when the previous grant expired', async () => {
    const entitlements = { consumeDocumentCredit: jest.fn() };
    const service = new DocumentGrantsService(entitlements as any);
    const tx = txWithGrant({
      userId: 'user-1',
      expiresAt: past(),
      remainingGenerations: 1,
    });

    await service.ensureGrant(tx, 'user-1', 'doc-1', DocumentType.REQUIREMENTS);

    expect(entitlements.consumeDocumentCredit).toHaveBeenCalledWith(
      tx,
      'user-1',
    );
    expect(tx.documentGrant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ remainingGenerations: 3 }),
      }),
    );
  });

  it('rejects a fourth generation after the grant reaches zero', async () => {
    const service = new DocumentGrantsService({} as any);

    await expect(
      service.consumeGeneration(
        txWithGrant({
          userId: 'user-1',
          expiresAt: future(),
          remainingGenerations: 0,
        }),
        'doc-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
