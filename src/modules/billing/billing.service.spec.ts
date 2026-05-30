import { BillingService } from './billing.service';

function createService(existingPayment: unknown = null) {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'STRIPE_SECRET_KEY') return 'sk_test_mock';
      if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_mock';
      if (key === 'FRONTEND_URL') return 'https://docs.example';
      return undefined;
    }),
  };
  const prisma = {
    entitlement: { findUnique: jest.fn(), findFirst: jest.fn() },
    payment: {
      findUnique: jest.fn().mockResolvedValue(existingPayment),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const entitlements = {
    addOneshotCredit: jest.fn(),
    addDocumentCredits: jest.fn(),
    syncSubscription: jest.fn(),
  };
  const alert = {
    resetFailures: jest.fn(),
    recordConsecutiveFailure: jest.fn(),
  };
  const service = new BillingService(
    config as any,
    prisma as any,
    entitlements as any,
    alert as any,
  );
  (service as any).stripe = {
    webhooks: {
      constructEvent: jest.fn().mockReturnValue({
        id: 'evt-1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_1',
            mode: 'payment',
            amount_total: 66640,
            currency: 'jpy',
            payment_status: 'paid',
            metadata: { userId: 'user-1', kind: 'business_pack' },
          },
        },
      }),
    },
  };
  return { service, prisma, entitlements };
}

describe('BillingService webhook', () => {
  it('grants business-pack credits for a new checkout session', async () => {
    const { service, entitlements, prisma } = createService();

    await service.handleWebhook('sig', Buffer.from('{}'));

    expect(entitlements.addDocumentCredits).toHaveBeenCalledWith(
      'user-1',
      78,
      'business_pack',
    );
    expect(prisma.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeSessionId: 'cs_1' },
      }),
    );
  });

  it('does not grant credits again for a replayed checkout session', async () => {
    const { service, entitlements, prisma } = createService({ id: 'pay-1' });

    await service.handleWebhook('sig', Buffer.from('{}'));

    expect(entitlements.addDocumentCredits).not.toHaveBeenCalled();
    expect(prisma.payment.upsert).toHaveBeenCalled();
  });
});
