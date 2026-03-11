import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlanType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SUBSCRIPTION_QUOTAS: Record<string, number> = {
  STARTER: 10,
  PRO: 50,
  BUSINESS: 200,
};

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureForUser(userId: string) {
    return this.prisma.entitlement.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async getBillingSummary(userId: string) {
    const entitlement = await this.ensureForUser(userId);
    const remaining =
      entitlement.oneshotCredits +
      Math.max(0, entitlement.quotaTotal - entitlement.quotaUsed);

    return {
      planType: entitlement.planType,
      remaining,
      periodEnd: entitlement.periodEnd,
    };
  }

  async addOneshotCredit(userId: string) {
    await this.ensureForUser(userId);
    return this.prisma.entitlement.update({
      where: { userId },
      data: {
        oneshotCredits: { increment: 1 },
        planType: PlanType.ONESHOT,
      },
    });
  }

  async syncSubscription(userId: string, planType: keyof typeof SUBSCRIPTION_QUOTAS) {
    const quotaTotal = SUBSCRIPTION_QUOTAS[planType] ?? 0;
    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    await this.ensureForUser(userId);
    return this.prisma.entitlement.update({
      where: { userId },
      data: {
        planType: planType as PlanType,
        quotaTotal,
        quotaUsed: 0,
        periodStart: now,
        periodEnd: nextMonth,
      },
    });
  }

  async refreshPeriodIfExpired(userId: string) {
    const entitlement = await this.ensureForUser(userId);

    if (
      !entitlement.periodEnd ||
      entitlement.planType === PlanType.FREE ||
      entitlement.oneshotCredits > 0 ||
      entitlement.periodEnd > new Date()
    ) {
      return entitlement;
    }

    const periodStart = entitlement.periodEnd;
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    return this.prisma.entitlement.update({
      where: { userId },
      data: {
        quotaUsed: 0,
        periodStart,
        periodEnd,
      },
    });
  }

  async assertCanExport(userId: string, quality: 'standard' | 'high') {
    const entitlement = await this.refreshPeriodIfExpired(userId);
    const remainingSubscription = Math.max(
      0,
      entitlement.quotaTotal - entitlement.quotaUsed,
    );

    if (
      quality === 'high' &&
      entitlement.planType !== PlanType.PRO &&
      entitlement.planType !== PlanType.BUSINESS
    ) {
      throw new BadRequestException('High quality requires Pro or Business');
    }

    if (entitlement.oneshotCredits > 0 || remainingSubscription > 0) {
      return {
        canExport: true,
        remaining: entitlement.oneshotCredits + remainingSubscription,
      };
    }

    return {
      canExport: false,
      remaining: 0,
    };
  }

  async consumeExportCredit(tx: Prisma.TransactionClient, userId: string) {
    const entitlement = await tx.entitlement.findUnique({ where: { userId } });

    if (!entitlement) {
      throw new NotFoundException('Entitlement not found');
    }

    if (entitlement.oneshotCredits > 0) {
      await tx.entitlement.update({
        where: { userId },
        data: { oneshotCredits: { decrement: 1 } },
      });
      return;
    }

    const remaining = Math.max(0, entitlement.quotaTotal - entitlement.quotaUsed);
    if (remaining < 1) {
      throw new BadRequestException('No credits remaining');
    }

    await tx.entitlement.update({
      where: { userId },
      data: { quotaUsed: { increment: 1 } },
    });
  }
}
