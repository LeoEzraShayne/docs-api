import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, ProjectStatus } from '@prisma/client';
import type { RequestWithMeta } from '../../common/request-id.middleware';
import { getTokyoDateKey } from '../../common/tokyo-date';
import { TooManyRequestsException } from '../../common/too-many-requests.exception';
import { AlertService } from '../alert/alert.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { ExcelService } from './excel.service';
import { LlmService } from './llm.service';
import { redactPreviewTabs } from './redaction';

@Injectable()
export class GenerateService {
  private readonly logger = new Logger(GenerateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly llmService: LlmService,
    private readonly excelService: ExcelService,
    private readonly entitlementsService: EntitlementsService,
    private readonly alertService: AlertService,
  ) {}

  async generate(
    userId: string,
    projectId: string,
    input: {
      mode: 'preview' | 'export';
      quality: 'standard' | 'high';
      idempotencyKey?: string;
      ip: string;
      requestId?: string;
    },
  ) {
    const project = await this.projectsService.getOwnedProject(userId, projectId);
    const now = new Date();

    if (
      project.lastGenerateAt &&
      now.getTime() - project.lastGenerateAt.getTime() < 30_000
    ) {
      throw new TooManyRequestsException('Generate cooldown: 30 seconds');
    }

    if (input.mode === 'preview') {
      await this.assertPreviewLimit(userId, projectId);
      input.quality = 'standard';
    }

    const exportAbility =
      input.mode === 'export'
        ? await this.entitlementsService.assertCanExport(userId, input.quality)
        : null;
    const billingSummary =
      input.mode === 'preview'
        ? await this.entitlementsService.getBillingSummary(userId)
        : null;

    if (input.mode === 'export' && exportAbility && !exportAbility.canExport) {
      return {
        project: { id: project.id, docTitle: project.docTitle },
        versionNo: 0,
        tabs: {
          flow: [],
          screens: [],
          functions: [],
          nfr: [],
          risks_issues: [],
          glossary: [],
        },
        paywall: exportAbility,
      };
    }

    if (input.mode === 'export' && input.idempotencyKey) {
      const existing = await this.prisma.projectVersion.findFirst({
        where: {
          projectId,
          idempotencyKey: input.idempotencyKey,
        },
      });

      if (existing) {
        const tabs = existing.extractedJson as Record<string, Record<string, unknown>[]>;
        return {
          project: { id: project.id, docTitle: project.docTitle },
          versionNo: existing.versionNo,
          tabs,
          paywall: exportAbility,
        };
      }
    }

    const llmStartedAt = Date.now();
    let tabs: Record<string, Record<string, unknown>[]>;
    try {
      tabs = await this.llmService.extractRequirements(
        {
          docTitle: project.docTitle,
          formFields: (project.formFields as Record<string, unknown>) ?? {},
          minutesText: project.minutesText,
        },
        input.quality,
      );
      await this.alertService.resetFailures('openAi');
    } catch (error) {
      await this.alertService.recordConsecutiveFailure(
        'openAi',
        input.requestId ? [input.requestId] : [],
        error instanceof Error ? error.message : 'OpenAI failure',
      );
      throw error;
    }

    const version = await this.prisma.$transaction(async (tx) => {
      const latestVersion = await tx.projectVersion.findFirst({
        where: { projectId },
        orderBy: { versionNo: 'desc' },
      });

      const created = await tx.projectVersion.create({
        data: {
          projectId,
          versionNo: (latestVersion?.versionNo ?? 0) + 1,
          quality: input.quality,
          extractedJson: tabs as Prisma.InputJsonValue,
          idempotencyKey: input.mode === 'export' ? input.idempotencyKey : null,
        },
      });

      await tx.project.update({
        where: { id: projectId },
        data: {
          status: ProjectStatus.READY,
          lastGenerateAt: now,
          lastActivityAt: now,
        },
      });

      if (input.mode === 'preview') {
        const dateKey = getTokyoDateKey(now);
        const usage = await tx.previewUsage.findFirst({
          where: {
            kind: 'PROJECT_PREVIEW',
            userId,
            dateKey,
          },
        });

        if (usage) {
          await tx.previewUsage.update({
            where: { id: usage.id },
            data: { count: { increment: 1 } },
          });
        } else {
          await tx.previewUsage.create({
            data: {
              kind: 'PROJECT_PREVIEW',
              userId,
              projectId,
              dateKey,
              count: 1,
            },
          });
        }
      }

      return created;
    });

    this.logger.log(
      JSON.stringify({
        requestId: input.requestId,
        userId,
        projectId,
        versionNo: version.versionNo,
        llmLatencyMs: Date.now() - llmStartedAt,
      }),
    );

    return {
      project: { id: project.id, docTitle: project.docTitle },
      versionNo: version.versionNo,
      tabs: input.mode === 'preview' ? redactPreviewTabs(tabs) : tabs,
      paywall: {
        canExport: input.mode === 'export' ? !!exportAbility?.canExport : false,
        remaining:
          input.mode === 'export'
            ? (exportAbility?.remaining ?? 0)
            : (billingSummary?.remaining ?? 0),
      },
    };
  }

  async downloadVersion(
    userId: string,
    projectId: string,
    versionNo: number,
    request: Pick<RequestWithMeta, 'requestId'>,
  ) {
    const project = await this.projectsService.getOwnedProject(userId, projectId);
    const version = await this.prisma.projectVersion.findUnique({
      where: {
        projectId_versionNo: {
          projectId,
          versionNo,
        },
      },
    });

    if (!version) {
      throw new BadRequestException('Version not found');
    }

    const canExport = await this.entitlementsService.assertCanExport(
      userId,
      version.quality as 'standard' | 'high',
    );

    if (!canExport.canExport) {
      throw new BadRequestException('No export credits remaining');
    }

    const excelStartedAt = Date.now();
    try {
      const buffer = await this.excelService.generateWorkbook({
        docTitle: project.docTitle ?? '要件定義',
        extractedJson: version.extractedJson as Record<
          string,
          Record<string, unknown>[]
        >,
        requestId: request.requestId,
      });

      await this.prisma.$transaction(async (tx) => {
        await this.entitlementsService.consumeExportCredit(tx, userId);
      });

      await this.alertService.recordExcelResult(true, request.requestId);
      this.logger.log(
        JSON.stringify({
          requestId: request.requestId,
          userId,
          projectId,
          versionNo,
          excelLatencyMs: Date.now() - excelStartedAt,
        }),
      );

      return {
        filename: `${project.docTitle ?? 'requirements'}-v${versionNo}.xlsx`,
        buffer,
      };
    } catch (error) {
      await this.alertService.recordExcelResult(false, request.requestId);
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new BadRequestException('Failed to generate Excel');
    }
  }

  private async assertPreviewLimit(userId: string, projectId: string) {
    const dateKey = getTokyoDateKey();
    const usage = await this.prisma.previewUsage.findFirst({
      where: {
        kind: 'PROJECT_PREVIEW',
        userId,
        dateKey,
      },
    });

    if ((usage?.count ?? 0) >= 1) {
      throw new TooManyRequestsException('Preview limit reached for today');
    }

    const projectCount = await this.prisma.project.count({ where: { userId } });
    if (projectCount > 3) {
      throw new BadRequestException('Preview unavailable beyond free limit');
    }

    if (!projectId) {
      throw new BadRequestException('Project id required');
    }
  }
}
