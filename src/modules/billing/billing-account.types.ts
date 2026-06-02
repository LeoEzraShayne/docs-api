import { DocumentType, PlanType } from '@prisma/client';

export type AccountUsageSummary = {
  email: string;
  planType: PlanType;
  hasBusinessPack: boolean;
  businessPack?: {
    totalDocumentCredits: number;
    unstartedDocumentCredits: number;
    startedDocumentCount: number;
    expiresAt: Date | null;
    status: '利用中' | '利用不可';
  };
  nearestExpiresAt: Date | null;
  nextExpiringDocument: {
    documentTitle: string;
    expiresAt: Date;
  } | null;
  needsPurchase: boolean;
};

export type AccountDocumentUsage = {
  projectId: string;
  projectTitle: string | null;
  documentId: string;
  documentType: DocumentType;
  documentTitle: string;
  generationCount: number;
  remainingGenerations?: number;
  expiresAt: Date | null;
  status: '利用中' | '利用不可';
};

export type PurchaseHistoryPage = {
  items: Array<{
    id: string;
    purchasedAt: Date;
    productName: string;
    documentType: DocumentType | null;
    documentTitle: string | null;
    projectTitle: string | null;
    amountJpy: number;
    status: string;
    grantedContent: string;
    stripeSessionId: string | null;
    stripeInvoiceId: string | null;
  }>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
