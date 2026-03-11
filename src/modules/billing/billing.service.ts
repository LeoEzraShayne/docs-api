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
      return {
        url: `${this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'}/success?mode=stub-oneshot`,
      };
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price:
            this.configService.get<string>('STRIPE_PRICE_ONESHOT') ?? undefined,
          quantity: 1,
        },
      ],
      success_url: `${this.configService.get<string>('FRONTEND_URL')}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.configService.get<string>('FRONTEND_URL')}/pricing`,
      metadata: { userId, kind: 'oneshot' },
    });

    return { url: session.url ?? `${this.configService.get<string>('FRONTEND_URL')}/pricing` };
  }

  async createSubscriptionCheckout(userId: string) {
    if (!this.stripe) {
      return {
        url: `${this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'}/success?mode=stub-subscription`,
      };
    }

    const priceId =
      this.configService.get<string>('STRIPE_PRICE_STARTER') ??
      this.configService.get<string>('STRIPE_PRICE_SUBSCRIPTION');

    if (!priceId) {
      return {
        url: `${this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'}/pricing`,
      };
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      success_url: `${this.configService.get<string>('FRONTEND_URL')}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.configService.get<string>('FRONTEND_URL')}/pricing`,
      metadata: { userId, kind: 'subscription' },
      line_items: [{ price: priceId, quantity: 1 }],
    });

    return { url: session.url ?? `${this.configService.get<string>('FRONTEND_URL')}/pricing` };
  }

  async createPortal(userId: string) {
    const entitlement = await this.prisma.entitlement.findUnique({ where: { userId } });
    if (!this.stripe || !entitlement?.stripeCustomerId) {
      return {
        url: `${this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'}/account`,
      };
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: entitlement.stripeCustomerId,
      return_url: `${this.configService.get<string>('FRONTEND_URL')}/account`,
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
          await this.entitlementsService.addOneshotCredit(userId);
          await this.prisma.payment.upsert({
            where: { stripeSessionId: session.id },
            create: {
              userId,
              type: 'ONESHOT',
              amountJpy: (session.amount_total ?? 0) / 100,
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
}
