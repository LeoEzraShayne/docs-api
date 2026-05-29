import { BadRequestException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { DOCUMENT_CONFIG, SheetSpec, sheetNames } from './document-config';

export type DocumentOutput = {
  sheets: Record<string, Array<Record<string, unknown>>>;
  metadata?: Record<string, unknown>;
};

export function selectSheets(
  type: DocumentType,
  mode: string | undefined,
  selected?: string[],
) {
  const config = DOCUMENT_CONFIG[type];
  if (mode && !config.modes.includes(mode as 'standard' | 'simple' | 'custom')) {
    throw new BadRequestException('Invalid generation mode');
  }
  if (mode === 'simple') return config.simpleSheets ?? sheetNames(type);
  if (mode === 'custom') {
    if (!selected?.length) throw new BadRequestException('At least one sheet is required');
    const invalid = selected.filter((sheet) => !sheetNames(type).includes(sheet));
    if (invalid.length) throw new BadRequestException(`Invalid sheets: ${invalid.join(', ')}`);
    return selected;
  }
  return sheetNames(type);
}

export function normalizeDocumentOutput(
  type: DocumentType,
  selectedSheets: string[],
  raw: unknown,
) {
  const parsed = parseRaw(raw);
  const specs = DOCUMENT_CONFIG[type].sheets.filter((sheet) =>
    selectedSheets.includes(sheet.name),
  );

  return {
    sheets: Object.fromEntries(
      specs.map((spec) => [spec.name, normalizeRows(spec, parsed.sheets[spec.name])]),
    ),
    metadata: parsed.metadata ?? {},
  };
}

function parseRaw(raw: unknown): DocumentOutput {
  if (raw && typeof raw === 'object' && 'sheets' in raw) {
    const output = raw as DocumentOutput;
    if (output.sheets && typeof output.sheets === 'object') return output;
  }
  throw new BadRequestException('Document generation returned invalid JSON shape');
}

function normalizeRows(spec: SheetSpec, rows: unknown) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new BadRequestException(`Missing rows for sheet: ${spec.name}`);
  }

  return rows.map((row, index) => {
    const source =
      row && typeof row === 'object' && !Array.isArray(row)
        ? (row as Record<string, unknown>)
        : {};
    const normalized: Record<string, unknown> = {};
    for (const column of spec.columns) {
      normalized[column] =
        column === 'No'
          ? source[column] ?? index + 1
          : isExecutionColumn(column)
            ? ''
            : source[column] ?? '';
    }
    return normalized;
  });
}

function isExecutionColumn(column: string) {
  return column === '実施者' || column === '実施日' || column === '備考';
}
