import { Injectable } from '@nestjs/common';
import { TooManyRequestsException } from '../../common/too-many-requests.exception';
import { getTokyoDateKey } from '../../common/tokyo-date';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../generate/llm.service';
import { redactPreviewTabs } from '../generate/redaction';

@Injectable()
export class DemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
  ) {}

  async preview(ip: string) {
    const now = new Date();
    const minuteAgo = new Date(now.getTime() - 60_000);
    const dailyKey = getTokyoDateKey(now);

    const [recentMinute, daily] = await Promise.all([
      this.prisma.loginCode.count({
        where: {
          provider: 'EMAIL',
          ip,
          createdAt: { gte: minuteAgo },
        },
      }),
      this.prisma.previewUsage.findFirst({
        where: {
          kind: 'DEMO_PREVIEW',
          ip,
          dateKey: dailyKey,
        },
      }),
    ]);

    if (recentMinute >= 1) {
      throw new TooManyRequestsException('Please try demo again later');
    }

    if ((daily?.count ?? 0) >= 3) {
      throw new TooManyRequestsException('Demo daily limit reached');
    }

    if (daily) {
      await this.prisma.previewUsage.update({
        where: { id: daily.id },
        data: { count: { increment: 1 } },
      });
    } else {
      await this.prisma.previewUsage.create({
        data: {
          kind: 'DEMO_PREVIEW',
          dateKey: dailyKey,
          ip,
          count: 1,
        },
      });
    }

    // Reuse loginCode as a simple minute bucket store to avoid a dedicated table in V1.
    await this.prisma.loginCode.create({
      data: {
        email: `demo+${ip}@local.invalid`,
        code: '000000',
        ip,
        expiresAt: new Date(now.getTime() + 60_000),
      },
    });

    const tabs = await this.llmService.extractRequirements(
      {
        docTitle: 'Demo Project',
        formFields: {
          industry: 'SaaS',
          systemType: 'Web',
          purpose: '要件定義自動生成デモ',
        },
        minutesText:
          '用户通过登录进入系统，录入背景和目标，系统生成要件定义预览和 Excel 导出。',
      },
      'standard',
    );

    return {
      project: { id: 'demo', docTitle: 'Demo Project' },
      versionNo: 1,
      tabs: redactPreviewTabs(tabs),
      paywall: { canExport: false, remaining: 0 },
    };
  }
}
