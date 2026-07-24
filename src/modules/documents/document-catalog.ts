import { createHash } from 'node:crypto';
import { DocumentSourceType, DocumentType } from '@prisma/client';
import { DOCUMENT_CONFIG, GenerationMode } from './document-config';

export type DocumentCatalogV1 = {
  contractVersion: 1;
  contractHash: string;
  documents: Record<
    DocumentType,
    {
      title: string;
      filename: string;
      sources: DocumentSourceType[];
      modes: GenerationMode[];
      simpleSheets: string[];
      sheets: Array<{
        name: string;
        workbookName: string;
        columns: string[];
      }>;
    }
  >;
};

type CatalogDocuments = DocumentCatalogV1['documents'];

export function safeWorkbookName(name: string) {
  return name.replace(/[*?:\\/[\]]/g, '・').slice(0, 31);
}

function normalizeDocuments(): CatalogDocuments {
  return Object.fromEntries(
    Object.values(DocumentType)
      .sort()
      .map((type) => {
        const config = DOCUMENT_CONFIG[type];
        return [
          type,
          {
            title: config.title,
            filename: config.filename,
            sources: [...config.sources],
            modes: [...config.modes],
            simpleSheets: [...(config.simpleSheets ?? [])],
            sheets: config.sheets.map((sheet) => ({
              name: sheet.name,
              workbookName: safeWorkbookName(sheet.name),
              columns: [...sheet.columns],
            })),
          },
        ];
      }),
  ) as CatalogDocuments;
}

export function calculateDocumentCatalogHash(documents: CatalogDocuments) {
  return createHash('sha256')
    .update(JSON.stringify({ contractVersion: 1, documents }))
    .digest('hex');
}

export function buildDocumentCatalogV1(): DocumentCatalogV1 {
  const documents = normalizeDocuments();
  return {
    contractVersion: 1,
    contractHash: calculateDocumentCatalogHash(documents),
    documents,
  };
}
