import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private readonly resend: Resend | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  private async getState() {
    return this.prisma.alertState.upsert({
      where: { id: 'global' },
      create: { id: 'global' },
      update: {},
    });
  }

  async recordConsecutiveFailure(
    kind: 'excelWorker' | 'openAi' | 'stripe',
    requestIds: string[],
    summary: string,
  ) {
    const state = await this.getState();
    const updates =
      kind === 'excelWorker'
        ? { excelWorkerFailures: state.excelWorkerFailures + 1 }
        : kind === 'openAi'
          ? { openAiFailures: state.openAiFailures + 1 }
          : { stripeFailures: state.stripeFailures + 1 };

    const next = await this.prisma.alertState.update({
      where: { id: 'global' },
      data: updates,
    });

    const shouldAlert =
      (kind === 'excelWorker' && next.excelWorkerFailures >= 3) ||
      (kind === 'openAi' && next.openAiFailures >= 5) ||
      (kind === 'stripe' && next.stripeFailures >= 1);

    if (shouldAlert) {
      await this.sendAlert(kind, summary, requestIds);
    }
  }

  async resetFailures(kind: 'excelWorker' | 'openAi' | 'stripe') {
    await this.prisma.alertState.upsert({
      where: { id: 'global' },
      create: { id: 'global' },
      update:
        kind === 'excelWorker'
          ? { excelWorkerFailures: 0 }
          : kind === 'openAi'
            ? { openAiFailures: 0 }
            : { stripeFailures: 0 },
    });
  }

  async recordExcelResult(success: boolean, requestId?: string) {
    const state = await this.getState();
    const now = new Date();
    const windowStartedAt = state.excelWindowStartedAt ?? now;
    const minutesSinceStart =
      (now.getTime() - windowStartedAt.getTime()) / (1000 * 60);

    const shouldReset = minutesSinceStart > 5;
    const total = shouldReset ? 1 : state.excelWindowTotal + 1;
    const failures = shouldReset
      ? success
        ? 0
        : 1
      : state.excelWindowFailures + (success ? 0 : 1);

    await this.prisma.alertState.update({
      where: { id: 'global' },
      data: {
        excelWindowStartedAt: shouldReset ? now : windowStartedAt,
        excelWindowTotal: total,
        excelWindowFailures: failures,
      },
    });

    if (!success && total >= 10 && failures / total > 0.2) {
      await this.sendAlert(
        'excel-error-rate',
        `Excel generation error rate is ${failures}/${total} in the last 5 minutes`,
        requestId ? [requestId] : [],
      );
    }
  }

  async sendAlert(kind: string, summary: string, requestIds: string[]) {
    const adminEmail = this.configService.get<string>('ADMIN_ALERT_EMAIL');

    if (!adminEmail || !this.resend) {
      this.logger.error(`[alert:${kind}] ${summary} ${requestIds.join(',')}`);
      return;
    }

    try {
      await this.resend.emails.send({
        from:
          this.configService.get<string>('MAIL_FROM') ??
          'Docs Alerts <no-reply@official.meritledger.org>',
        to: adminEmail,
        subject: `[docs-api] ${kind} alert`,
        text: [
          `timestamp: ${new Date().toISOString()}`,
          `environment: ${this.configService.get<string>('NODE_ENV') ?? 'development'}`,
          `recent requestIds: ${requestIds.join(', ') || 'n/a'}`,
          `summary: ${summary}`,
        ].join('\n'),
      });
    } catch (error) {
      this.logger.error('Failed to send alert email', error);
    }
  }
}
