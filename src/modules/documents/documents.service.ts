import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { assertGenerationAccess, getOwnedProject } from './document-access';
import { DOCUMENT_CONFIG } from './document-config';
import { GenerateInput } from './document-generate.types';
import { DocumentGrantsService } from './document-grants.service';
import { normalizeDocumentOutput, selectSheets } from './document-output';
import { DocumentPromptService } from './document-prompt.service';
import {
  emptyDocumentNode,
  toDocumentDto,
  toVersionDto,
} from './document-response';
import { defaultSource, resolveSourceVersion } from './document-source';
import {
  requireDocumentType,
  validateDocumentCooldown,
  validateGenerateInput,
} from './document-validation';
import { saveDocumentVersion } from './document-version-writer';
import { ExcelService } from '../generate/excel.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly grants: DocumentGrantsService,
    private readonly prompts: DocumentPromptService,
    private readonly excel: ExcelService,
  ) {}

  async list(userId: string, projectId: string) {
    await getOwnedProject(this.prisma, userId, projectId);
    const documents = await this.prisma.document.findMany({
      where: { projectId },
      include: {
        versions: { orderBy: { versionNo: 'desc' }, take: 20 },
        grants: true,
      },
      orderBy: { type: 'asc' },
    });
    return documents.map((document) => toDocumentDto(document));
  }

  async tree(userId: string, projectId: string) {
    const existing = await this.list(userId, projectId);
    return Object.values(DocumentType).map(
      (type) =>
        existing.find((doc) => doc.type === type) ?? emptyDocumentNode(type),
    );
  }

  async get(userId: string, projectId: string, typeParam: string) {
    return toDocumentDto(
      await this.ensureDocument(
        userId,
        projectId,
        requireDocumentType(typeParam),
      ),
    );
  }

  async generate(
    userId: string,
    projectId: string,
    typeParam: string,
    input: GenerateInput,
  ) {
    const type = requireDocumentType(typeParam);
    const document = await this.ensureDocument(userId, projectId, type);
    if (input.idempotencyKey) {
      const existing = await this.findIdempotent(
        document.id,
        input.idempotencyKey,
      );
      if (existing) return toVersionDto(document, existing);
    }
    validateDocumentCooldown(document.lastGenerateAt);
    const sourceType = input.sourceType ?? defaultSource(type);
    validateGenerateInput(type, sourceType, input);
    await assertGenerationAccess(this.prisma, userId, document.id);

    const selectedSheets = selectSheets(
      type,
      input.generationMode,
      input.selectedSheets,
    );
    const source = await resolveSourceVersion(
      this.prisma,
      userId,
      projectId,
      sourceType,
      input.sourceDocumentVersionId,
    );
    const raw = await this.prompts.generate(
      type,
      {
        project: {
          id: document.project.id,
          docTitle: document.project.docTitle,
          formFields: document.project.formFields,
        },
        inputJson: input.inputJson ?? {},
        source,
        selectedSheets,
        testViewpoints: input.testViewpoints,
      },
      input.quality ?? 'standard',
    );
    const output = normalizeDocumentOutput(type, selectedSheets, raw);
    const version = await saveDocumentVersion(this.prisma, this.grants, {
      userId,
      documentId: document.id,
      projectId,
      type,
      sourceType,
      input,
      selectedSheets,
      extractedJson: output.sheets,
    });
    const updated = await this.getDocumentById(document.id);
    return toVersionDto(updated, version);
  }

  async download(
    userId: string,
    projectId: string,
    typeParam: string,
    versionNo: number,
    requestId?: string,
  ) {
    const document = await this.ensureDocument(
      userId,
      projectId,
      requireDocumentType(typeParam),
    );
    const version = await this.prisma.documentVersion.findUnique({
      where: { documentId_versionNo: { documentId: document.id, versionNo } },
    });
    if (!version) throw new NotFoundException('Document version not found');
    const buffer = await this.excel.generateWorkbook({
      docTitle: document.title,
      documentType: document.type,
      extractedJson: version.extractedJson as Record<
        string,
        Record<string, unknown>[]
      >,
      requestId,
    });
    return { filename: `${document.title}-v${versionNo}.xlsx`, buffer };
  }

  private async ensureDocument(
    userId: string,
    projectId: string,
    type: DocumentType,
  ) {
    await getOwnedProject(this.prisma, userId, projectId);
    return this.prisma.document.upsert({
      where: { projectId_type: { projectId, type } },
      create: { projectId, type, title: DOCUMENT_CONFIG[type].title },
      update: {},
      include: {
        project: true,
        versions: { orderBy: { versionNo: 'desc' } },
        grants: true,
      },
    });
  }

  private async getDocumentById(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        project: true,
        versions: { orderBy: { versionNo: 'desc' } },
        grants: true,
      },
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  private findIdempotent(documentId: string, idempotencyKey: string) {
    return this.prisma.documentVersion.findFirst({
      where: { documentId, idempotencyKey },
    });
  }
}
