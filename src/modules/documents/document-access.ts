import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

type PrismaLike = {
  project: {
    findUnique(args: { where: { id: string } }): Promise<{
      userId: string;
    } | null>;
  };
  documentGrant: {
    findUnique(args: { where: { documentId: string } }): Promise<{
      userId: string;
      expiresAt: Date;
      remainingGenerations: number;
    } | null>;
  };
  documentCredit: {
    findFirst(args: {
      where: {
        userId: string;
        quantity: { gt: number };
        expiresAt: { gt: Date };
      };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
};

export async function getOwnedProject(
  prisma: PrismaLike,
  userId: string,
  projectId: string,
) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundException('Project not found');
  if (project.userId !== userId)
    throw new ForbiddenException('Project does not belong to user');
  return project;
}

export async function assertGenerationAccess(
  prisma: PrismaLike,
  userId: string,
  documentId: string,
) {
  const now = new Date();
  const grant = await prisma.documentGrant.findUnique({
    where: { documentId },
  });
  if (
    grant &&
    grant.userId === userId &&
    grant.expiresAt > now &&
    grant.remainingGenerations > 0
  )
    return;

  const credit = await prisma.documentCredit.findFirst({
    where: { userId, quantity: { gt: 0 }, expiresAt: { gt: now } },
    select: { id: true },
  });
  if (!credit)
    throw new BadRequestException('No document generation entitlement');
}
