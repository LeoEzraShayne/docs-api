import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

type UpsertProjectInput = {
  docTitle?: string;
  formFields?: Record<string, unknown>;
  minutesText?: string;
};

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: UpsertProjectInput) {
    const count = await this.prisma.project.count({ where: { userId } });
    if (count >= 3) {
      throw new BadRequestException('Free tier project limit reached');
    }

    if ((input.minutesText?.length ?? 0) > 20_000) {
      throw new BadRequestException('minutesText exceeds 20,000 characters');
    }

    return this.prisma.project.create({
      data: {
        userId,
        docTitle: input.docTitle?.trim() || '无标题项目',
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
      throw new NotFoundException('Project not found');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('Project does not belong to user');
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
      throw new NotFoundException('Version not found');
    }

    return {
      project: {
        id: project.id,
        docTitle: project.docTitle,
      },
      versionNo: version.versionNo,
      quality: version.quality,
      tabs: version.extractedJson,
    };
  }

  async update(userId: string, projectId: string, input: UpsertProjectInput) {
    await this.getOwnedProject(userId, projectId);

    if ((input.minutesText?.length ?? 0) > 20_000) {
      throw new BadRequestException('minutesText exceeds 20,000 characters');
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
