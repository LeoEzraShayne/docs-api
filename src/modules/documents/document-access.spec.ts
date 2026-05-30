import { BadRequestException } from '@nestjs/common';
import { assertGenerationAccess } from './document-access';

const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

function prisma(grant: unknown, credit: unknown) {
  return {
    documentGrant: { findUnique: jest.fn().mockResolvedValue(grant) },
    documentCredit: { findFirst: jest.fn().mockResolvedValue(credit) },
  } as any;
}

describe('document access', () => {
  it('allows generation with an active document grant', async () => {
    const db = prisma(
      { userId: 'user-1', expiresAt: future(), remainingGenerations: 1 },
      null,
    );

    await expect(
      assertGenerationAccess(db, 'user-1', 'doc-1'),
    ).resolves.toBeUndefined();
    expect(db.documentCredit.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to an unstarted credit when grant is expired', async () => {
    const db = prisma(
      { userId: 'user-1', expiresAt: past(), remainingGenerations: 1 },
      { id: 'credit-1' },
    );

    await expect(
      assertGenerationAccess(db, 'user-1', 'doc-1'),
    ).resolves.toBeUndefined();
    expect(db.documentCredit.findFirst).toHaveBeenCalled();
  });

  it('rejects when no grant or credit can be used', async () => {
    await expect(
      assertGenerationAccess(prisma(null, null), 'user-1', 'doc-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
