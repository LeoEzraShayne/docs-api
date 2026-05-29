import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DocumentSourceType, DocumentType } from '@prisma/client';
import { defaultSource, resolveSourceVersion } from './document-source';

function prismaWithVersion(version: unknown) {
  return {
    documentVersion: {
      findUnique: jest.fn().mockResolvedValue(version),
    },
  } as any;
}

function version(
  type: DocumentType,
  userId = 'user-1',
  projectId = 'project-1',
) {
  return {
    id: 'version-1',
    versionNo: 2,
    extractedJson: { sheets: {} },
    document: {
      type,
      projectId,
      project: { userId },
    },
  };
}

describe('document source helpers', () => {
  it('returns default source per document type', () => {
    expect(defaultSource(DocumentType.BASIC_DESIGN)).toBe(
      DocumentSourceType.REQUIREMENTS_VERSION,
    );
    expect(defaultSource(DocumentType.INTEGRATION_TEST)).toBe(
      DocumentSourceType.DETAILED_DESIGN_VERSION,
    );
  });

  it('resolves a valid upstream version owned by the same project user', async () => {
    const prisma = prismaWithVersion(version(DocumentType.REQUIREMENTS));
    await expect(
      resolveSourceVersion(
        prisma,
        'user-1',
        'project-1',
        DocumentSourceType.REQUIREMENTS_VERSION,
        'version-1',
      ),
    ).resolves.toMatchObject({
      documentType: DocumentType.REQUIREMENTS,
      versionNo: 2,
    });
  });

  it('rejects missing, missing record, cross-project, and wrong document type sources', async () => {
    await expect(
      resolveSourceVersion(
        prismaWithVersion(null),
        'user-1',
        'project-1',
        DocumentSourceType.REQUIREMENTS_VERSION,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      resolveSourceVersion(
        prismaWithVersion(null),
        'user-1',
        'project-1',
        DocumentSourceType.REQUIREMENTS_VERSION,
        'missing',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      resolveSourceVersion(
        prismaWithVersion(version(DocumentType.REQUIREMENTS, 'user-2')),
        'user-1',
        'project-1',
        DocumentSourceType.REQUIREMENTS_VERSION,
        'version-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      resolveSourceVersion(
        prismaWithVersion(version(DocumentType.BASIC_DESIGN)),
        'user-1',
        'project-1',
        DocumentSourceType.REQUIREMENTS_VERSION,
        'version-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
