import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { AlertService } from '../alert/alert.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';

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
    this.stripe = stripeKey
      ? new Stripe(stripeKey, { apiVersion: '2025-02-24.acacia' as never })
      : null;
  }

  async createOneshotCheckout(userId: string) {
    if (!this.stripe) {
      await this.entitlementsService.addOneshotCredit(userId);
      return {
        url: `${this.frontendUrl()}/success?mode=stub-oneshot`,
      };
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price:
            this.configService.get<string>('STRIPE_PRICE_SINGLE_DOCUMENT') ??
            this.configService.get<string>('STRIPE_PRICE_ONESHOT') ??
            undefined,
          quantity: 1,
        },
      ],
      success_url: `${this.frontendUrl()}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.frontendUrl()}/pricing`,
      metadata: { userId, kind: 'oneshot' },
    });

    return { url: session.url ?? `${this.configService.get<string>('FRONTEND_URL')}/pricing` };
  }

  async createBusinessPackCheckout(userId: string) {
    if (!this.stripe) {
      await this.entitlementsService.addDocumentCredits(userId, 78, 'business_pack');
      return {
        url: `${this.frontendUrl()}/success?mode=stub-business-pack`,
      };
    }

    const price = this.configService.get<string>('STRIPE_PRICE_BUSINESS_PACK');
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: price ?? undefined, quantity: 1 }],
      success_url: `${this.frontendUrl()}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.frontendUrl()}/pricing`,
      metadata: { userId, kind: 'business_pack' },
    });

    return { url: session.url ?? `${this.configService.get<string>('FRONTEND_URL')}/pricing` };
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

    return { url: session.url ?? `${this.configService.get<string>('FRONTEND_URL')}/pricing` };
  }

  async createPortal(userId: string) {
    const entitlement = await this.prisma.entitlement.findUnique({ where: { userId } });
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
      const event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (userId && session.mode === 'payment') {
          const count = session.metadata?.kind === 'business_pack' ? 78 : 1;
          await this.entitlementsService.addDocumentCredits(
            userId,
            count,
            session.metadata?.kind === 'business_pack' ? 'business_pack' : 'single_document',
          );
          await this.prisma.payment.upsert({
            where: { stripeSessionId: session.id },
            create: {
              userId,
              type: 'ONESHOT',
              amountJpy: this.toAmountJpy(session),
              status: session.payment_status,
              stripeSessionId: session.id,
              stripeEventId: event.id,
            },
            update: {
              status: session.payment_status,
              stripeEventId: event.id,
            },
          });
        }
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
            await this.entitlementsService.syncSubscription(entitlement.userId, 'STARTER');
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

  private toAmountJpy(session: Stripe.Checkout.Session) {
    const amount = session.amount_total ?? 0;
    return session.currency === 'jpy' ? amount : Math.round(amount / 100);
  }

  private frontendUrl() {
    return (
      this.configService
        .get<string>('FRONTEND_URL')
        ?.split(',')[0]
        ?.trim() || 'http://localhost:3000'
    );
  }
}
