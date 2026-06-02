import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentType } from '@prisma/client';
import Stripe from 'stripe';
import { AlertService } from '../alert/alert.service';
import { DOCUMENT_CONFIG } from '../documents/document-config';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { checkoutFrontendUrl, stripeAmountToJpy } from './billing-utils';

@Injectable()
export class BillingService {
  private readonly stripe: Stripe | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly entitlementsService: EntitlementsService,
    private readonly alertService: AlertService,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.assertStripeEnvironment(stripeKey);
    this.stripe = stripeKey
      ? new Stripe(stripeKey, { apiVersion: '2025-02-24.acacia' as never })
      : null;
  }

  async createOneshotCheckout(
    userId: string,
    options?: {
      documentType?: DocumentType;
      projectId?: string;
      documentId?: string;
    },
  ) {
    const selectedType = normalizeDocumentType(options?.documentType);
    if (!this.stripe) {
      const appliedToDocument = await this.addGenerationsToDocumentGrant(
        userId,
        selectedType,
        options?.documentId,
        options?.projectId,
      );
      if (!appliedToDocument) {
        await this.entitlementsService.addDocumentCredits(
          userId,
          1,
          singleDocumentSource(selectedType),
        );
      }
      await this.recordStubPayment(userId, {
        amountJpy: 980,
        kind: 'single_document',
        documentType: selectedType,
        projectId: options?.projectId,
        documentId: options?.documentId,
      });
      return {
        url: `${this.frontendUrl()}/success?mode=stub-oneshot`,
      };
    }

    const price =
      this.configService.get<string>('STRIPE_PRICE_SINGLE_DOCUMENT') ??
      this.configService.get<string>('STRIPE_PRICE_ONESHOT') ??
      undefined;
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [checkoutLineItem(price, 'Docs Single', 980)],
      success_url: `${this.frontendUrl()}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.frontendUrl()}/pricing`,
      metadata: {
        userId,
        kind: 'single_document',
        ...(selectedType ? { documentType: selectedType } : {}),
        ...(options?.projectId ? { projectId: options.projectId } : {}),
        ...(options?.documentId ? { documentId: options.documentId } : {}),
      },
    });

    return { url: session.url ?? `${this.frontendUrl()}/pricing` };
  }

  async createBusinessPackCheckout(userId: string) {
    if (!this.stripe) {
      await this.entitlementsService.addDocumentCredits(
        userId,
        78,
        'business_pack',
      );
      await this.recordStubPayment(userId, {
        amountJpy: 66640,
        kind: 'business_pack',
      });
      return {
        url: `${this.frontendUrl()}/success?mode=stub-business-pack`,
      };
    }

    const price = this.configService.get<string>('STRIPE_PRICE_BUSINESS_PACK');
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [checkoutLineItem(price, 'Business Pack', 66640)],
      success_url: `${this.frontendUrl()}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.frontendUrl()}/pricing`,
      metadata: { userId, kind: 'business_pack' },
    });

    return { url: session.url ?? `${this.frontendUrl()}/pricing` };
  }

  async createSubscriptionCheckout(userId: string) {
    if (!this.stripe) {
      return {
        url: `${this.frontendUrl()}/success?mode=stub-subscription`,
      };
    }

    const priceId =
      this.configService.get<string>('STRIPE_PRICE_STARTER') ??
      this.configService.get<string>('STRIPE_PRICE_SUBSCRIPTION');

    if (!priceId) {
      return {
        url: `${this.frontendUrl()}/pricing`,
      };
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      success_url: `${this.frontendUrl()}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.frontendUrl()}/pricing`,
      metadata: { userId, kind: 'subscription' },
      line_items: [{ price: priceId, quantity: 1 }],
    });

    return { url: session.url ?? `${this.frontendUrl()}/pricing` };
  }

  async createPortal(userId: string) {
    const entitlement = await this.prisma.entitlement.findUnique({
      where: { userId },
    });
    if (!this.stripe || !entitlement?.stripeCustomerId) {
      return {
        url: `${this.frontendUrl()}/account`,
      };
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: entitlement.stripeCustomerId,
      return_url: `${this.frontendUrl()}/account`,
    });
    return { url: session.url };
  }

  async handleWebhook(signature: string | undefined, rawBody: Buffer) {
    const secret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!this.stripe || !secret || !signature) {
      return { ok: true, skipped: true };
    }

    try {
      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        secret,
      );

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.processCheckoutSession(session, event.id);
      }

      if (event.type === 'invoice.paid') {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.parent?.subscription_details?.subscription === 'string'
            ? invoice.parent.subscription_details.subscription
            : null;
        const customerId =
          typeof invoice.customer === 'string' ? invoice.customer : null;

        if (customerId && subscriptionId) {
          const entitlement = await this.prisma.entitlement.findFirst({
            where: { stripeCustomerId: customerId },
          });

          if (entitlement) {
            await this.entitlementsService.syncSubscription(
              entitlement.userId,
              'STARTER',
            );
          }
        }
      }

      await this.alertService.resetFailures('stripe');
      return { ok: true };
    } catch (error) {
      await this.alertService.recordConsecutiveFailure(
        'stripe',
        [],
        error instanceof Error ? error.message : 'Stripe webhook error',
      );
      throw error;
    }
  }

  async confirmCheckoutSession(userId: string, sessionId: string) {
    if (!this.stripe) {
      return { ok: true, skipped: true };
    }
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.userId !== userId) {
      throw new BadRequestException('決済情報のユーザー確認に失敗しました。');
    }
    await this.processCheckoutSession(session);
    return { ok: true };
  }

  private frontendUrl() {
    return checkoutFrontendUrl(this.configService.get<string>('FRONTEND_URL'));
  }

  private assertStripeEnvironment(stripeKey?: string) {
    if (this.configService.get<string>('NODE_ENV') !== 'production') return;

    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? '';
    if (!stripeKey || !stripeKey.startsWith('sk_live_')) {
      throw new InternalServerErrorException(
        '本番環境のStripe秘密鍵が正しく設定されていません。',
      );
    }
    if (!webhookSecret || !webhookSecret.startsWith('whsec_')) {
      throw new InternalServerErrorException(
        '本番環境のStripe Webhook Secretが正しく設定されていません。',
      );
    }
    if (!frontendUrl.startsWith('https://')) {
      throw new InternalServerErrorException(
        '本番環境のフロントエンドURLが正しく設定されていません。',
      );
    }
  }

  private async recordStubPayment(
    userId: string,
    options: {
      amountJpy: number;
      kind: 'single_document' | 'business_pack';
      documentType?: DocumentType;
      projectId?: string;
      documentId?: string;
    },
  ) {
    await this.prisma.payment.create({
      data: {
        userId,
        type: 'ONESHOT',
        amountJpy: options.amountJpy,
        status: 'paid',
        stripeSessionId: `stub_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2)}`,
        metadata: {
          kind: options.kind,
          ...(options.documentType
            ? { documentType: options.documentType }
            : {}),
          ...(options.projectId ? { projectId: options.projectId } : {}),
          ...(options.documentId ? { documentId: options.documentId } : {}),
        },
      },
    });
  }

  private async processCheckoutSession(
    session: Stripe.Checkout.Session,
    stripeEventId?: string,
  ) {
    const userId = session.metadata?.userId;
    if (!userId || session.mode !== 'payment') return;
    if (session.payment_status !== 'paid') {
      throw new BadRequestException('決済が完了していません。');
    }

    const existingPayment = await this.prisma.payment.findUnique({
      where: { stripeSessionId: session.id },
    });
    const kind = session.metadata?.kind ?? 'single_document';
    const documentType = normalizeDocumentType(
      session.metadata?.documentType,
      false,
    );
    const documentId = session.metadata?.documentId;
    const projectId = session.metadata?.projectId;

    if (existingPayment) {
      if (!documentId) {
        await this.convertUnstartedCreditToDocumentGrant(
          userId,
          documentType,
          projectId,
        );
      }
    } else {
      const appliedToDocument =
        kind !== 'business_pack' &&
        (await this.addGenerationsToDocumentGrant(
          userId,
          documentType,
          documentId,
          projectId,
        ));
      if (!appliedToDocument) {
        await this.entitlementsService.addDocumentCredits(
          userId,
          kind === 'business_pack' ? 78 : 1,
          kind === 'business_pack'
            ? 'business_pack'
            : singleDocumentSource(documentType),
        );
      }
    }

    await this.prisma.payment.upsert({
      where: { stripeSessionId: session.id },
      create: {
        userId,
        type: 'ONESHOT',
        amountJpy: stripeAmountToJpy(session),
        status: session.payment_status,
        stripeSessionId: session.id,
        stripeEventId,
        metadata: {
          kind,
          ...(documentType ? { documentType } : {}),
          ...(projectId ? { projectId } : {}),
          ...(documentId ? { documentId } : {}),
        },
      },
      update: {
        status: session.payment_status,
        stripeEventId,
        metadata: {
          kind,
          ...(documentType ? { documentType } : {}),
          ...(projectId ? { projectId } : {}),
          ...(documentId ? { documentId } : {}),
        },
      },
    });
  }

  private async convertUnstartedCreditToDocumentGrant(
    userId: string,
    documentType?: DocumentType,
    projectId?: string,
  ) {
    if (!documentType) return false;
    const document = await this.findTargetDocument(
      userId,
      documentType,
      undefined,
      projectId,
    );
    if (!document) return false;

    const credit = await this.prisma.documentCredit.findFirst({
      where: {
        userId,
        quantity: { gt: 0 },
        expiresAt: { gt: new Date() },
        OR: [
          { source: `single_document:${documentType}` },
          { source: 'single_document' },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!credit) return false;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
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
          documentType,
          remainingGenerations: 3,
          expiresAt,
        },
        update: {
          remainingGenerations: { increment: 3 },
          expiresAt,
        },
      }),
    ]);
    return true;
  }

  private async addGenerationsToDocumentGrant(
    userId: string,
    documentType?: DocumentType,
    documentId?: string,
    projectId?: string,
  ) {
    if (!documentType) return false;
    const document = await this.findTargetDocument(
      userId,
      documentType,
      documentId,
      projectId,
    );
    if (!document) return false;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await this.prisma.documentGrant.upsert({
      where: { documentId: document.id },
      create: {
        userId,
        documentId: document.id,
        documentType,
        remainingGenerations: 3,
        expiresAt,
      },
      update: {
        remainingGenerations: { increment: 3 },
        expiresAt,
      },
    });
    return true;
  }

  private async findTargetDocument(
    userId: string,
    documentType: DocumentType,
    documentId?: string,
    projectId?: string,
  ) {
    if (documentId) {
      return this.prisma.document.findFirst({
        where: {
          id: documentId,
          type: documentType,
          project: { userId },
        },
        select: { id: true },
      });
    }

    if (projectId) {
      const project = await this.prisma.project.findFirst({
        where: {
          id: projectId,
          userId,
        },
        select: { id: true },
      });
      if (!project) return null;

      return this.prisma.document.upsert({
        where: { projectId_type: { projectId, type: documentType } },
        create: {
          projectId,
          type: documentType,
          title: DOCUMENT_CONFIG[documentType].title,
        },
        update: {},
        select: { id: true },
      });
    }

    const grant = await this.prisma.documentGrant.findFirst({
      where: {
        userId,
        documentType,
        document: { project: { userId } },
      },
      orderBy: { updatedAt: 'desc' },
      select: { documentId: true },
    });
    if (!grant) return null;

    return this.prisma.document.findFirst({
      where: {
        id: grant.documentId,
        type: documentType,
        project: { userId },
      },
      select: { id: true },
    });
  }
}

function normalizeDocumentType(
  value: unknown,
  throwOnInvalid = true,
): DocumentType | undefined {
  if (!value) return undefined;
  const raw = String(value);
  if (Object.values(DocumentType).includes(raw as DocumentType)) {
    return raw as DocumentType;
  }
  if (throwOnInvalid) {
    throw new BadRequestException('文書種別が正しくありません。');
  }
  return undefined;
}

function singleDocumentSource(documentType?: DocumentType) {
  return documentType ? `single_document:${documentType}` : 'single_document';
}

function checkoutLineItem(
  price: string | undefined,
  name: string,
  amountJpy: number,
): Stripe.Checkout.SessionCreateParams.LineItem {
  if (price) return { price, quantity: 1 };
  return {
    quantity: 1,
    price_data: {
      currency: 'jpy',
      unit_amount: amountJpy,
      product_data: { name },
    },
  };
}
