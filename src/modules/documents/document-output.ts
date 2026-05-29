import { DocumentType } from '@prisma/client';
import { DOCUMENT_CONFIG } from './document-config';

type Row = Record<string, unknown>;

const TAB_ORDER = ['flow', 'screens', 'functions', 'nfr', 'risks_issues', 'glossary'];

export function buildDocumentOutput(
  type: DocumentType,
  selectedSheets: string[],
  llmTabs: Record<string, Row[]>,
) {
  const config = DOCUMENT_CONFIG[type];
  const sheets = selectedSheets.length > 0 ? selectedSheets : config.sheets;

  return Object.fromEntries(
    sheets.map((sheet, index) => {
      const sourceRows = llmTabs[TAB_ORDER[index % TAB_ORDER.length]] ?? [];
      const rows = sourceRows.length > 0 ? sourceRows : [{ 内容: `${sheet} を生成` }];
      return [sheet, rows.map((row, rowIndex) => ({ No: rowIndex + 1, ...row }))];
    }),
  );
}

export function validateSheets(type: DocumentType, selectedSheets?: string[]) {
  const allowed = DOCUMENT_CONFIG[type].sheets;
  const sheets = selectedSheets?.length ? selectedSheets : allowed;
  const invalid = sheets.filter((sheet) => !allowed.includes(sheet));

  if (invalid.length > 0) {
    throw new Error(`Invalid sheets: ${invalid.join(', ')}`);
  }

  return sheets;
}
