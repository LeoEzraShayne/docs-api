import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlanType, Prisma, ProjectStatus } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { detectPreviewSchema, redactPreviewTabs } from '../generate/redaction';

type UpsertProjectInput = {
  docTitle?: string;
  formFields?: Record<string, unknown>;
  minutesText?: string;
};

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: UpsertProjectInput) {
    const [count, entitlement] = await Promise.all([
      this.prisma.project.count({ where: { userId } }),
      this.prisma.entitlement.findUnique({ where: { userId } }),
    ]);
    const planType = entitlement?.planType ?? PlanType.FREE;
    if (planType === PlanType.FREE && count >= 3) {
      throw new BadRequestException(
        '無料プランの案件作成上限に達しました。不要な案件を削除するか、文書枠を購入してから続行してください。',
      );
    }

    if ((input.minutesText?.length ?? 0) > 20_000) {
      throw new BadRequestException('議事録は20,000文字以内にしてください。');
    }

    return this.prisma.project.create({
      data: {
        userId,
        docTitle: input.docTitle?.trim() || '無題の案件',
        formFields: (input.formFields ?? {}) as Prisma.InputJsonValue,
        minutesText: input.minutesText ?? '',
      },
      select: {
        id: true,
        docTitle: true,
        updatedAt: true,
      },
    });
  }

  async list(userId: string) {
    return this.prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        docTitle: true,
        updatedAt: true,
        status: true,
      },
    });
  }

  async listPage(userId: string, pageInput?: number, pageSizeInput?: number) {
    const page = Math.max(1, pageInput ?? 1);
    const pageSize = [12, 24, 48].includes(pageSizeInput ?? 12)
      ? (pageSizeInput ?? 12)
      : 12;
    const where = { userId };
    const [items, total, readyCount, latest] = await Promise.all([
      this.prisma.project.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          docTitle: true,
          updatedAt: true,
          status: true,
        },
      }),
      this.prisma.project.count({ where }),
      this.prisma.project.count({
        where: { ...where, status: ProjectStatus.READY },
      }),
      this.prisma.project.findFirst({
        where,
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);
    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      summary: {
        total,
        readyCount,
        latestUpdatedAt: latest?.updatedAt ?? null,
      },
    };
  }

  async getOwnedProject(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        versions: {
          orderBy: { versionNo: 'desc' },
          select: {
            versionNo: true,
            createdAt: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('案件が見つかりません。');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('この案件にアクセスする権限がありません。');
    }

    return project;
  }

  async getById(userId: string, projectId: string) {
    const project = await this.getOwnedProject(userId, projectId);
    return {
      id: project.id,
      docTitle: project.docTitle,
      formFields: project.formFields,
      minutesText: project.minutesText,
      versions: project.versions,
    };
  }

  async getVersion(userId: string, projectId: string, versionNo: number) {
    const project = await this.getOwnedProject(userId, projectId);
    const version = await this.prisma.projectVersion.findUnique({
      where: {
        projectId_versionNo: {
          projectId,
          versionNo,
        },
      },
    });

    if (!version) {
      throw new NotFoundException('バージョンが見つかりません。');
    }

    const tabs = version.extractedJson as Record<
      string,
      Record<string, unknown>[]
    >;
    const schema = detectPreviewSchema(tabs);
    return {
      project: {
        id: project.id,
        docTitle: project.docTitle,
      },
      versionNo: version.versionNo,
      quality: version.quality,
      schema,
      tabs: schema === 'requirements-v2' ? redactPreviewTabs(tabs) : tabs,
    };
  }

  async update(userId: string, projectId: string, input: UpsertProjectInput) {
    await this.getOwnedProject(userId, projectId);

    if ((input.minutesText?.length ?? 0) > 20_000) {
      throw new BadRequestException('議事録は20,000文字以内にしてください。');
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        docTitle: input.docTitle?.trim() || undefined,
        formFields: input.formFields as Prisma.InputJsonValue | undefined,
        minutesText: input.minutesText ?? undefined,
        lastActivityAt: new Date(),
      },
      include: {
        versions: {
          orderBy: { versionNo: 'desc' },
          select: { versionNo: true, createdAt: true },
        },
      },
    });
  }

  async hardDelete(userId: string, projectId: string) {
    await this.getOwnedProject(userId, projectId);
    await this.prisma.project.delete({ where: { id: projectId } });
    return { ok: true };
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupInactiveProjects() {
    const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    await this.prisma.project.deleteMany({
      where: {
        lastActivityAt: { lt: cutoff },
      },
    });
  }
}
