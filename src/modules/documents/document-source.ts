import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DocumentSourceType, DocumentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SOURCE_TO_TYPE: Partial<Record<DocumentSourceType, DocumentType>> = {
  REQUIREMENTS_VERSION: 'REQUIREMENTS',
  BASIC_DESIGN_VERSION: 'BASIC_DESIGN',
  DETAILED_DESIGN_VERSION: 'DETAILED_DESIGN',
};

const DEFAULT_SOURCE: Record<DocumentType, DocumentSourceType> = {
  REQUIREMENTS: 'PROJECT',
  BASIC_DESIGN: 'REQUIREMENTS_VERSION',
  DETAILED_DESIGN: 'BASIC_DESIGN_VERSION',
  UNIT_TEST: 'DETAILED_DESIGN_VERSION',
  INTEGRATION_TEST: 'DETAILED_DESIGN_VERSION',
};

export function defaultSource(type: DocumentType) {
  return DEFAULT_SOURCE[type];
}

export async function resolveSourceVersion(
  prisma: PrismaService,
  userId: string,
  projectId: string,
  sourceType: DocumentSourceType,
  sourceDocumentVersionId?: string,
) {
  const requiredType = SOURCE_TO_TYPE[sourceType];
  if (!requiredType) return null;
  if (!sourceDocumentVersionId) {
    throw new BadRequestException('Source document version is required');
  }

  const version = await prisma.documentVersion.findUnique({
    where: { id: sourceDocumentVersionId },
    include: { document: { include: { project: true } } },
  });
  if (!version) throw new NotFoundException('Source document version not found');
  if (version.document.project.userId !== userId || version.document.projectId !== projectId) {
    throw new ForbiddenException('Source does not belong to this project');
  }
  if (version.document.type !== requiredType) {
    throw new BadRequestException(`Source must be ${requiredType}`);
  }
  return { documentType: version.document.type, versionNo: version.versionNo, data: version.extractedJson };
}
