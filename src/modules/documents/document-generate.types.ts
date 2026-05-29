import { DocumentSourceType } from '@prisma/client';

export type GenerateInput = {
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
