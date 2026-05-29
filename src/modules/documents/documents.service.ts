import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentSourceType, DocumentType, Prisma, ProjectStatus } from '@prisma/client';
import { DOCUMENT_CONFIG, parseDocumentType } from './document-config';
import { DocumentGrantsService } from './document-grants.service';
import { normalizeDocumentOutput, selectSheets } from './document-output';
import { DocumentPromptService } from './document-prompt.service';
import { defaultSource, resolveSourceVersion } from './document-source';
import { ExcelService } from '../generate/excel.service';
import { PrismaService } from '../prisma/prisma.service';

type GenerateInput = {
  sourceType?: DocumentSourceType;
  sourceDocumentVersionId?: string;
  inputJson?: Record<string, unknown>;
  selectedSheets?: string[];
  generationMode?: 'standard' | 'simple' | 'custom';
  testViewpoints?: string[];
  quality?: 'standard' | 'high';
  idempotencyKey?: string;
  requestId?: string;
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly grants: DocumentGrantsService,
    private readonly prompts: DocumentPromptService,
    private readonly excel: ExcelService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.getOwnedProject(userId, projectId);
    const documents = await this.prisma.document.findMany({
      where: { projectId },
      include: { versions: { orderBy: { versionNo: 'desc' }, take: 20 }, grants: true },
      orderBy: { type: 'asc' },
    });
    return documents.map((document) => this.toDto(document));
  }

  async tree(userId: string, projectId: string) {
    const existing = await this.list(userId, projectId);
    return Object.values(DocumentType).map((type) => existing.find((doc) => doc.type === type) ?? {
      id: null,
      type,
      title: DOCUMENT_CONFIG[type].title,
      currentVersion: 0,
      grant: null,
      versions: [],
    });
  }

  async get(userId: string, projectId: string, typeParam: string) {
    return this.toDto(await this.ensureDocument(userId, projectId, this.requireType(typeParam)));
  }

  async generate(userId: string, projectId: string, typeParam: string, input: GenerateInput) {
    const type = this.requireType(typeParam);
    const document = await this.ensureDocument(userId, projectId, type);
    this.validateDocumentCooldown(document.lastGenerateAt);
    const sourceType = input.sourceType ?? defaultSource(type);
    this.validateGenerateInput(type, sourceType, input);
    if (input.idempotencyKey) {
      const existing = await this.findIdempotent(document.id, input.idempotencyKey);
      if (existing) return this.versionDto(document, existing);
    }

    await this.prisma.$transaction((tx) => this.grants.ensureGrant(tx, userId, document.id, type));
    const selectedSheets = selectSheets(type, input.generationMode, input.selectedSheets);
    const source = await resolveSourceVersion(this.prisma, userId, projectId, sourceType, input.sourceDocumentVersionId);
    const raw = await this.prompts.generate(type, {
      project: { id: document.project.id, docTitle: document.project.docTitle, formFields: document.project.formFields },
      inputJson: input.inputJson ?? {},
      source,
      selectedSheets,
      testViewpoints: input.testViewpoints,
    }, input.quality ?? 'standard');
    const output = normalizeDocumentOutput(type, selectedSheets, raw);
    const version = await this.saveVersion(document.id, projectId, sourceType, input, selectedSheets, output.sheets);
    const updated = await this.getDocumentById(document.id);
    return this.versionDto(updated, version);
  }

  async download(userId: string, projectId: string, typeParam: string, versionNo: number, requestId?: string) {
    const document = await this.ensureDocument(userId, projectId, this.requireType(typeParam));
    const version = await this.prisma.documentVersion.findUnique({ where: { documentId_versionNo: { documentId: document.id, versionNo } } });
    if (!version) throw new NotFoundException('Document version not found');
    const buffer = await this.excel.generateWorkbook({
      docTitle: document.title,
      documentType: document.type,
      extractedJson: version.extractedJson as Record<string, Record<string, unknown>[]>,
      requestId,
    });
    return { filename: `${document.title}-v${versionNo}.xlsx`, buffer };
  }

  private async saveVersion(documentId: string, projectId: string, sourceType: DocumentSourceType, input: GenerateInput, selectedSheets: string[], extractedJson: Record<string, unknown>) {
    return this.prisma.$transaction(async (tx) => {
      await this.grants.consumeGeneration(tx, documentId);
      const latest = await tx.documentVersion.findFirst({ where: { documentId }, orderBy: { versionNo: 'desc' } });
      const created = await tx.documentVersion.create({ data: {
        documentId,
        versionNo: (latest?.versionNo ?? 0) + 1,
        quality: input.quality ?? 'standard',
        sourceType,
        sourceDocumentVersionId: input.sourceDocumentVersionId,
        inputJson: (input.inputJson ?? {}) as Prisma.InputJsonValue,
        selectedSheets: selectedSheets as Prisma.InputJsonValue,
        extractedJson: extractedJson as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey,
      } });
      await tx.document.update({ where: { id: documentId }, data: { currentVersion: created.versionNo, lastGenerateAt: new Date() } });
      await tx.project.update({ where: { id: projectId }, data: { status: ProjectStatus.READY, lastActivityAt: new Date() } });
      return created;
    });
  }

  private async ensureDocument(userId: string, projectId: string, type: DocumentType) {
    await this.getOwnedProject(userId, projectId);
    return this.prisma.document.upsert({
      where: { projectId_type: { projectId, type } },
      create: { projectId, type, title: DOCUMENT_CONFIG[type].title },
      update: {},
      include: { project: true, versions: { orderBy: { versionNo: 'desc' } }, grants: true },
    });
  }

  private async getDocumentById(id: string) {
    const document = await this.prisma.document.findUnique({ where: { id }, include: { project: true, versions: { orderBy: { versionNo: 'desc' } }, grants: true } });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  private async getOwnedProject(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.userId !== userId) throw new ForbiddenException('Project does not belong to user');
    return project;
  }

  private validateGenerateInput(type: DocumentType, sourceType: DocumentSourceType, input: GenerateInput) {
    if (!DOCUMENT_CONFIG[type].sources.includes(sourceType)) throw new BadRequestException('Invalid source type');
    const limit = type === 'INTEGRATION_TEST' && sourceType === 'PASTED_DESIGN' ? 10_000 : 20_000;
    if (JSON.stringify(input.inputJson ?? {}).length > limit) throw new BadRequestException('Input exceeds maximum length');
    selectSheets(type, input.generationMode, input.selectedSheets);
  }

  private validateDocumentCooldown(lastGenerateAt: Date | null) {
    if (lastGenerateAt && Date.now() - lastGenerateAt.getTime() < 30_000) throw new BadRequestException('Generate cooldown: 30 seconds');
  }

  private findIdempotent(documentId: string, idempotencyKey: string) {
    return this.prisma.documentVersion.findFirst({ where: { documentId, idempotencyKey } });
  }

  private requireType(value: string) {
    const type = parseDocumentType(value);
    if (!type) throw new BadRequestException('Invalid document type');
    return type;
  }

  private toDto(document: { grants?: Array<{ remainingGenerations: number; expiresAt: Date }>; versions: Array<{ id: string; versionNo: number; createdAt: Date }>; id: string; type: DocumentType; title: string; currentVersion: number }) {
    const grant = document.grants?.[0] ?? null;
    return { id: document.id, type: document.type, title: document.title, currentVersion: document.currentVersion, grant, versions: document.versions };
  }

  private versionDto(document: { id: string; projectId?: string; type: DocumentType; title: string; grants?: Array<{ remainingGenerations: number; expiresAt: Date }> }, version: { id: string; versionNo: number; createdAt: Date; extractedJson: Prisma.JsonValue }) {
    return { document: this.toDto({ ...document, currentVersion: version.versionNo, versions: [version] }), id: version.id, versionNo: version.versionNo, createdAt: version.createdAt, tabs: version.extractedJson, downloadUrl: `/projects/${document.projectId}/documents/${document.type}/versions/${version.versionNo}/download`, grant: document.grants?.[0] ?? null };
  }
}
