import { Injectable } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AccountDocumentUsage,
  AccountUsageSummary,
  PurchaseHistoryPage,
} from './billing-account.types';

@Injectable()
export class BillingAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccountUsage(userId: string) {
    const [user, entitlement, credits, grants] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      }),
      this.prisma.entitlement.findUnique({ where: { userId } }),
      this.prisma.documentCredit.findMany({
        where: { userId },
        orderBy: { expiresAt: 'desc' },
      }),
      this.prisma.documentGrant.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        include: {
          document: {
            include: {
              project: { select: { id: true, docTitle: true } },
            },
          },
        },
      }),
    ]);
    const now = new Date();
    const businessCredits = credits.filter(
      (item) => item.source === 'business_pack',
    );
    const businessExpiresAt = maxDate(
      businessCredits.map((item) => item.expiresAt),
    );
    const hasBusinessPack = businessCredits.length > 0;
    const businessPack = hasBusinessPack
      ? businessPackSummary(
          businessCredits,
          grants.length,
          businessExpiresAt,
          now,
        )
      : undefined;
    const documents = grants.map<AccountDocumentUsage>((grant) => {
      const businessActive =
        hasBusinessPack && !!businessExpiresAt && businessExpiresAt > now;
      const singleActive =
        grant.expiresAt > now && grant.remainingGenerations > 0;
      return {
        projectId: grant.document.project.id,
        projectTitle: grant.document.project.docTitle,
        documentId: grant.documentId,
        documentType: grant.documentType,
        documentTitle: grant.document.title,
        generationCount: grant.document.currentVersion,
        remainingGenerations: hasBusinessPack
          ? undefined
          : Math.max(0, grant.remainingGenerations),
        expiresAt: hasBusinessPack ? businessExpiresAt : grant.expiresAt,
        status: hasBusinessPack
          ? businessActive
            ? '利用中'
            : '利用不可'
          : singleActive
            ? '利用中'
            : '利用不可',
      };
    });
    const nextExpiringDocument = minFutureDocument(documents, now);
    const summary: AccountUsageSummary = {
      email: user?.email ?? '',
      planType: hasBusinessPack
        ? 'BUSINESS'
        : (entitlement?.planType ?? 'FREE'),
      hasBusinessPack,
      businessPack,
      nearestExpiresAt: minFutureDate(
        documents.map((item) => item.expiresAt).filter((date) => !!date),
        now,
      ),
      nextExpiringDocument,
      needsPurchase: hasBusinessPack
        ? !businessPack || businessPack.status === '利用不可'
        : documents.some((item) => item.status === '利用不可') ||
          documents.length === 0,
    };
    return { summary, documents };
  }

  async getPurchaseHistory(
    userId: string,
    pageInput?: number,
    pageSizeInput?: number,
  ): Promise<PurchaseHistoryPage> {
    const page = Math.max(1, pageInput ?? 1);
    const pageSize = [10, 30, 50].includes(pageSizeInput ?? 10)
      ? (pageSizeInput ?? 10)
      : 10;
    const [payments, grants] = await Promise.all([
      this.prisma.payment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.documentGrant.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        include: {
          document: {
            include: {
              project: { select: { id: true, docTitle: true } },
            },
          },
        },
      }),
    ]);
    const projectIds = Array.from(
      new Set(
        payments
          .map((payment) => paymentProjectId(payment.metadata))
          .filter((value): value is string => !!value),
      ),
    );
    const projects = projectIds.length
      ? await this.prisma.project.findMany({
          where: { userId, id: { in: projectIds } },
          select: { id: true, docTitle: true },
        })
      : [];
    const projectTitles = new Map(
      projects.map((project) => [project.id, project.docTitle]),
    );
    const paidDocumentIds = new Set(
      payments
        .map((payment) => paymentDocumentId(payment.metadata))
        .filter((value): value is string => !!value),
    );
    const paidProjectDocuments = new Set(
      payments
        .map((payment) => {
          const projectId = paymentProjectId(payment.metadata);
          const documentType = paymentDocumentType(payment.metadata);
          return projectId && documentType ? `${projectId}:${documentType}` : null;
        })
        .filter((value): value is string => !!value),
    );
    const items = [
      ...payments.map((payment) => {
        const kind = paymentKind(payment.metadata, payment.amountJpy);
        const documentType = paymentDocumentType(payment.metadata);
        const projectId = paymentProjectId(payment.metadata);
        return {
          id: payment.id,
          purchasedAt: payment.createdAt,
          productName: productName(kind, documentType),
          documentType,
          documentTitle: documentType ? documentTitle(documentType) : null,
          projectTitle: projectId ? (projectTitles.get(projectId) ?? null) : null,
          amountJpy: payment.amountJpy,
          status: payment.status,
          grantedContent: grantedContent(kind),
          stripeSessionId: payment.stripeSessionId,
          stripeInvoiceId: payment.stripeInvoiceId,
        };
      }),
      ...grants
        .filter((grant) => {
          if (paidDocumentIds.has(grant.documentId)) return false;
          return !paidProjectDocuments.has(
            `${grant.document.project.id}:${grant.documentType}`,
          );
        })
        .map((grant) => ({
          id: `grant_${grant.id}`,
          purchasedAt: grant.updatedAt,
          productName: 'Docs Single',
          documentType: grant.documentType,
          documentTitle: grant.document.title,
          projectTitle: grant.document.project.docTitle,
          amountJpy: 0,
          status: 'applied',
          grantedContent: '1文書枠を適用',
          stripeSessionId: null,
          stripeInvoiceId: null,
        })),
    ].sort((left, right) => right.purchasedAt.getTime() - left.purchasedAt.getTime());
    const total = items.length;
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }
}

function businessPackSummary(
  credits: Array<{ quantity: number; expiresAt: Date }>,
  startedDocumentCount: number,
  expiresAt: Date | null,
  now: Date,
) {
  const activeCredits = credits.filter((credit) => credit.expiresAt > now);
  return {
    totalDocumentCredits: credits.reduce(
      (sum, credit) => sum + credit.quantity,
      startedDocumentCount,
    ),
    unstartedDocumentCredits: activeCredits.reduce(
      (sum, credit) => sum + credit.quantity,
      0,
    ),
    startedDocumentCount,
    expiresAt,
    status:
      expiresAt && expiresAt > now
        ? ('利用中' as const)
        : ('利用不可' as const),
  };
}

function maxDate(dates: Date[]) {
  if (!dates.length) return null;
  return dates.reduce((latest, date) => (date > latest ? date : latest));
}

function minFutureDate(dates: Date[], now: Date) {
  const futureDates = dates.filter((date) => date > now);
  if (!futureDates.length) return null;
  return futureDates.reduce((earliest, date) =>
    date < earliest ? date : earliest,
  );
}

function minFutureDocument(documents: AccountDocumentUsage[], now: Date) {
  return documents
    .filter((document) => document.expiresAt && document.expiresAt > now)
    .reduce<{
      documentTitle: string;
      expiresAt: Date;
    } | null>((earliest, document) => {
      if (!document.expiresAt) return earliest;
      if (!earliest || document.expiresAt < earliest.expiresAt) {
        return {
          documentTitle: document.documentTitle,
          expiresAt: document.expiresAt,
        };
      }
      return earliest;
    }, null);
}

function paymentKind(metadata: unknown, amountJpy: number) {
  if (metadata && typeof metadata === 'object' && 'kind' in metadata) {
    const kind = String((metadata as { kind?: unknown }).kind);
    if (
      kind === 'business_pack' ||
      kind === 'single_document' ||
      kind === 'oneshot'
    ) {
      return kind === 'oneshot' ? 'single_document' : kind;
    }
  }
  return amountJpy >= 60000 ? 'business_pack' : 'single_document';
}

function paymentDocumentType(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || !('documentType' in metadata)) {
    return null;
  }
  const raw = String((metadata as { documentType?: unknown }).documentType);
  return Object.values(DocumentType).includes(raw as DocumentType)
    ? (raw as DocumentType)
    : null;
}

function paymentProjectId(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || !('projectId' in metadata)) {
    return null;
  }
  const raw = String((metadata as { projectId?: unknown }).projectId);
  return raw || null;
}

function paymentDocumentId(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || !('documentId' in metadata)) {
    return null;
  }
  const raw = String((metadata as { documentId?: unknown }).documentId);
  return raw || null;
}

function productName(kind: string, _documentType: DocumentType | null) {
  if (kind === 'business_pack') return 'Business Pack';
  return 'Docs Single';
}

function grantedContent(kind: string) {
  return kind === 'business_pack' ? '78文書枠' : '1文書';
}

function documentTitle(documentType: DocumentType) {
  const titles: Record<DocumentType, string> = {
    REQUIREMENTS: '要件定義書',
    BASIC_DESIGN: '基本設計書',
    DETAILED_DESIGN: '詳細設計書',
    UNIT_TEST: '単体テスト仕様書',
    INTEGRATION_TEST: '結合テスト仕様書',
  };
  return titles[documentType];
}
