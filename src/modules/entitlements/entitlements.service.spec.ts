import { EntitlementsService } from './entitlements.service';

function createService() {
  const prisma = {
    entitlement: {
      upsert: jest.fn().mockResolvedValue({ userId: 'user-1' }),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
    },
    documentCredit: {
      create: jest.fn().mockImplementation(({ data }) => data),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (operations: unknown[]) =>
      Promise.all(operations),
    ),
  };
  return { service: new EntitlementsService(prisma as any), prisma };
}

describe('EntitlementsService document credits', () => {
  it('creates a single-document credit that expires in about 7 days', async () => {
    const { service, prisma } = createService();
    const before = Date.now();

    await service.addDocumentCredits('user-1', 1, 'single_document');

    const expiresAt = prisma.documentCredit.create.mock.calls[0][0].data
      .expiresAt as Date;
    const days = (expiresAt.getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it('creates a business-pack credit pool with 78 credits and 12-month expiry', async () => {
    const { service, prisma } = createService();

    await service.addDocumentCredits('user-1', 78, 'business_pack');

    const data = prisma.documentCredit.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: 'user-1',
      quantity: 78,
      source: 'business_pack',
    });
    expect(data.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 300 * 86_400_000,
    );
  });

  it('consumes the earliest unstarted document credit', async () => {
    const { service } = createService();
    const tx = {
      documentCredit: {
        findFirst: jest.fn().mockResolvedValue({ id: 'credit-1' }),
        update: jest.fn(),
      },
      entitlement: { update: jest.fn() },
    };

    await service.consumeDocumentCredit(tx as any, 'user-1');

    expect(tx.documentCredit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { expiresAt: 'asc' } }),
    );
    expect(tx.documentCredit.update).toHaveBeenCalledWith({
      where: { id: 'credit-1' },
      data: { quantity: { decrement: 1 } },
    });
  });
});
