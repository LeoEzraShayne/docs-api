import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentSourceType, DocumentType, Prisma, ProjectStatus } from '@prisma/client';
import { DOCUMENT_CONFIG, parseDocumentType } from './document-config';
import { DocumentGrantsService } from './document-grants.service';
import { buildDocumentOutput, validateSheets } from './document-output';
import { ExcelService } from '../generate/excel.service';
import { LlmService } from '../generate/llm.service';
import { PrismaService } from '../prisma/prisma.service';

type GenerateInput = {
  sourceType?: DocumentSourceType;
  sourceDocumentVersionId?: string;
  inputJson?: Record<string, unknown>;
  selectedSheets?: string[];
  quality?: 'standard' | 'high';
  idempotencyKey?: string;
  requestId?: string;
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly grants: DocumentGrantsService,
    private readonly llm: LlmService,
    private readonly excel: ExcelService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.getOwnedProject(userId, projectId);
    const documents = await this.prisma.document.findMany({
      where: { projectId },
      include: { versions: { orderBy: { versionNo: 'desc' }, take: 5 }, grants: true },
      orderBy: { updatedAt: 'desc' },
    });
    return documents.map((document) => this.toDto(document));
  }

  async get(userId: string, projectId: string, typeParam: string) {
    const type = this.requireType(typeParam);
    const document = await this.ensureDocument(userId, projectId, type);
    return this.toDto(document);
  }

  async generate(
    userId: string,
    projectId: string,
    typeParam: string,
    input: GenerateInput,
  ) {
    const type = this.requireType(typeParam);
    const document = await this.ensureDocument(userId, projectId, type);
    this.validateGenerateInput(type, input);

    if (input.idempotencyKey) {
      const existing = await this.findIdempotent(document.id, input.idempotencyKey);
      if (existing) return this.versionDto(existing);
    }

    await this.prisma.$transaction((tx) =>
      this.grants.ensureGrant(tx, userId, document.id, type),
    );

    const source = await this.resolveSource(userId, input);
    const project = document.project;
    const llmTabs = await this.llm.extractRequirements(
      {
        docTitle: `${project.docTitle ?? DOCUMENT_CONFIG[type].title} ${DOCUMENT_CONFIG[type].title}`,
        formFields: {
          ...(project.formFields as Record<string, unknown>),
          documentType: type,
          input: input.inputJson ?? {},
          source,
        },
        minutesText: JSON.stringify(input.inputJson ?? {}),
      },
      input.quality ?? 'standard',
    );
    const selectedSheets = validateSheets(type, input.selectedSheets);
    const extractedJson = buildDocumentOutput(type, selectedSheets, llmTabs);

    const version = await this.prisma.$transaction(async (tx) => {
      await this.grants.consumeGeneration(tx, document.id);
      const latest = await tx.documentVersion.findFirst({
        where: { documentId: document.id },
        orderBy: { versionNo: 'desc' },
      });
      const created = await tx.documentVersion.create({
        data: {
          documentId: document.id,
          versionNo: (latest?.versionNo ?? 0) + 1,
          quality: input.quality ?? 'standard',
          sourceType: input.sourceType ?? 'PROJECT',
          sourceDocumentVersionId: input.sourceDocumentVersionId,
          inputJson: (input.inputJson ?? {}) as Prisma.InputJsonValue,
          selectedSheets: selectedSheets as Prisma.InputJsonValue,
          extractedJson: extractedJson as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await tx.document.update({
        where: { id: document.id },
        data: { currentVersion: created.versionNo, lastGenerateAt: new Date() },
      });
      await tx.project.update({
        where: { id: projectId },
        data: { status: ProjectStatus.READY, lastActivityAt: new Date() },
      });
      return created;
    });

    return this.versionDto(version);
  }

  async download(userId: string, projectId: string, typeParam: string, versionNo: number, requestId?: string) {
    const type = this.requireType(typeParam);
    const document = await this.ensureDocument(userId, projectId, type);
    const version = await this.prisma.documentVersion.findUnique({
      where: { documentId_versionNo: { documentId: document.id, versionNo } },
    });
    if (!version) throw new NotFoundException('Document version not found');
    const buffer = await this.excel.generateWorkbook({
      docTitle: document.title,
      extractedJson: version.extractedJson as Record<string, Record<string, unknown>[]>,
      requestId,
    });
    return { filename: `${document.title}-v${versionNo}.xlsx`, buffer };
  }

  private async ensureDocument(userId: string, projectId: string, type: DocumentType) {
    const project = await this.getOwnedProject(userId, projectId);
    return this.prisma.document.upsert({
      where: { projectId_type: { projectId, type } },
      create: { projectId, type, title: DOCUMENT_CONFIG[type].title },
      update: {},
      include: { project: true, versions: { orderBy: { versionNo: 'desc' } }, grants: true },
    });
  }

  private async getOwnedProject(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.userId !== userId) throw new ForbiddenException('Project does not belong to user');
    return project;
  }

  private async resolveSource(userId: string, input: GenerateInput) {
    if (!input.sourceDocumentVersionId) return null;
    const version = await this.prisma.documentVersion.findUnique({
      where: { id: input.sourceDocumentVersionId },
      include: { document: { include: { project: true } } },
    });
    if (!version) throw new NotFoundException('Source document version not found');
    if (version.document.project.userId !== userId) throw new ForbiddenException('Source does not belong to user');
    return { documentType: version.document.type, versionNo: version.versionNo, data: version.extractedJson };
  }

  private validateGenerateInput(type: DocumentType, input: GenerateInput) {
    const sourceType = input.sourceType ?? 'PROJECT';
    if (!DOCUMENT_CONFIG[type].sources.includes(sourceType)) {
      throw new BadRequestException('Invalid source type');
    }
    if (JSON.stringify(input.inputJson ?? {}).length > (type === 'INTEGRATION_TEST' ? 10_000 : 20_000)) {
      throw new BadRequestException('Input exceeds maximum length');
    }
    try {
      validateSheets(type, input.selectedSheets);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid sheets');
    }
  }

  private async findIdempotent(documentId: string, idempotencyKey: string) {
    return this.prisma.documentVersion.findFirst({ where: { documentId, idempotencyKey } });
  }

  private requireType(value: string) {
    const type = parseDocumentType(value);
    if (!type) throw new BadRequestException('Invalid document type');
    return type;
  }

  private toDto(document: { grants?: Array<{ remainingGenerations: number; expiresAt: Date }>; versions: Array<{ id: string; versionNo: number; createdAt: Date }>; id: string; type: DocumentType; title: string; currentVersion: number }) {
    const grant = document.grants?.[0];
    return { id: document.id, type: document.type, title: document.title, currentVersion: document.currentVersion, grant, versions: document.versions };
  }

  private versionDto(version: { id: string; versionNo: number; createdAt: Date; extractedJson: Prisma.JsonValue }) {
    return { id: version.id, versionNo: version.versionNo, createdAt: version.createdAt, tabs: version.extractedJson };
  }
}
