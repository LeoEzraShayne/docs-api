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
    entitlement: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    project: {
      findFirst: jest.fn().mockResolvedValue({ id: 'project-1' }),
    },
    document: {
      findFirst: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      upsert: jest.fn().mockResolvedValue({ id: 'doc-1' }),
    },
    documentGrant: {
      upsert: jest.fn().mockResolvedValue({ id: 'grant-1' }),
    },
    documentCredit: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    payment: {
      findUnique: jest.fn().mockResolvedValue(existingPayment),
      upsert: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(async (operations: unknown[]) =>
      Promise.all(operations),
    ),
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
    checkout: {
      sessions: {
        retrieve: jest.fn().mockResolvedValue({
          id: 'cs_1',
          mode: 'payment',
          amount_total: 980,
          currency: 'jpy',
          payment_status: 'paid',
          metadata: {
            userId: 'user-1',
            kind: 'single_document',
            documentType: 'REQUIREMENTS',
            documentId: 'doc-1',
            projectId: 'project-1',
          },
        }),
      },
    },
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

  it('confirms a paid single-document checkout and adds 3 generations to the document grant', async () => {
    const { service, entitlements, prisma } = createService();

    await service.confirmCheckoutSession('user-1', 'cs_1');

    expect(prisma.documentGrant.upsert).toHaveBeenCalledWith({
      where: { documentId: 'doc-1' },
      create: expect.objectContaining({
        userId: 'user-1',
        documentId: 'doc-1',
        documentType: 'REQUIREMENTS',
        remainingGenerations: 3,
      }),
      update: expect.objectContaining({
        remainingGenerations: { increment: 3 },
      }),
    });
    expect(entitlements.addDocumentCredits).not.toHaveBeenCalled();
    expect(prisma.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeSessionId: 'cs_1' },
        create: expect.objectContaining({
          metadata: expect.objectContaining({
            documentId: 'doc-1',
            documentType: 'REQUIREMENTS',
            projectId: 'project-1',
          }),
        }),
      }),
    );
  });

  it('adds generations by project and document type when checkout metadata has no document id', async () => {
    const { service, entitlements, prisma } = createService();
    (service as any).stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: 'cs_2',
      mode: 'payment',
      amount_total: 980,
      currency: 'jpy',
      payment_status: 'paid',
      metadata: {
        userId: 'user-1',
        kind: 'single_document',
        documentType: 'BASIC_DESIGN',
        projectId: 'project-1',
      },
    });

    await service.confirmCheckoutSession('user-1', 'cs_2');

    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'project-1',
        userId: 'user-1',
      },
      select: { id: true },
    });
    expect(prisma.document.upsert).toHaveBeenCalledWith({
      where: {
        projectId_type: { projectId: 'project-1', type: 'BASIC_DESIGN' },
      },
      create: {
        projectId: 'project-1',
        type: 'BASIC_DESIGN',
        title: '基本設計書',
      },
      update: {},
      select: { id: true },
    });
    expect(prisma.document.findFirst).not.toHaveBeenCalledWith({
      where: {
        projectId: 'project-1',
        type: 'BASIC_DESIGN',
        project: { userId: 'user-1' },
      },
      select: { id: true },
    });
    expect(prisma.documentGrant.upsert).toHaveBeenCalledWith({
      where: { documentId: 'doc-1' },
      create: expect.objectContaining({
        userId: 'user-1',
        documentId: 'doc-1',
        documentType: 'BASIC_DESIGN',
        remainingGenerations: 3,
      }),
      update: expect.objectContaining({
        remainingGenerations: { increment: 3 },
      }),
    });
    expect(entitlements.addDocumentCredits).not.toHaveBeenCalled();
  });

  it('converts an existing unstarted document credit into grant generations for replayed document-type checkout', async () => {
    const { service, entitlements, prisma } = createService({ id: 'pay-2' });
    prisma.documentCredit.findFirst.mockResolvedValueOnce({
      id: 'credit-1',
      source: 'single_document:BASIC_DESIGN',
    });
    (service as any).stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: 'cs_2',
      mode: 'payment',
      amount_total: 980,
      currency: 'jpy',
      payment_status: 'paid',
      metadata: {
        userId: 'user-1',
        kind: 'single_document',
        documentType: 'BASIC_DESIGN',
        projectId: 'project-1',
      },
    });

    await service.confirmCheckoutSession('user-1', 'cs_2');

    expect(prisma.documentCredit.update).toHaveBeenCalledWith({
      where: { id: 'credit-1' },
      data: { quantity: { decrement: 1 } },
    });
    expect(prisma.entitlement.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { oneshotCredits: { decrement: 1 } },
    });
    expect(prisma.documentGrant.upsert).toHaveBeenCalledWith({
      where: { documentId: 'doc-1' },
      create: expect.objectContaining({
        userId: 'user-1',
        documentId: 'doc-1',
        documentType: 'BASIC_DESIGN',
        remainingGenerations: 3,
      }),
      update: expect.objectContaining({
        remainingGenerations: { increment: 3 },
      }),
    });
    expect(entitlements.addDocumentCredits).not.toHaveBeenCalled();
  });
});
