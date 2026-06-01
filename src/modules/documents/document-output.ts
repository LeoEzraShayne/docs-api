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
    throw new BadRequestException('生成モードが正しくありません。');
  }
  if (mode === 'simple') return config.simpleSheets ?? sheetNames(type);
  if (mode === 'custom') {
    if (!selected?.length)
      throw new BadRequestException('少なくとも1つのシートを選択してください。');
    const invalid = selected.filter((sheet) => !sheetNames(type).includes(sheet));
    if (invalid.length)
      throw new BadRequestException(
        `選択できないシートが含まれています: ${invalid.join(', ')}`,
      );
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
  throw new BadRequestException('文書生成結果の形式が正しくありません。');
}

function normalizeRows(spec: SheetSpec, rows: unknown) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new BadRequestException(`シート「${spec.name}」の行がありません。`);
  }

  return rows.map((row, index) => {
    const source =
      row && typeof row === 'object' && !Array.isArray(row)
        ? (row as Record<string, unknown>)
        : {};
    const normalized: Record<string, unknown> = {};
    for (const column of spec.columns) {
      normalized[column] = valueForColumn(column, source, index);
    }
    return normalized;
  });
}

function valueForColumn(
  column: string,
  source: Record<string, unknown>,
  index: number,
) {
  if (column === 'No') return source[column] ?? index + 1;
  if (isExecutionColumn(column)) return '';
  if (column === 'テーブル物理名' && isBlank(source[column])) {
    return physicalTableName(source['テーブル論理名'], index);
  }
  return source[column] ?? '';
}

function isExecutionColumn(column: string) {
  return column === '実施者' || column === '実施日' || column === '備考';
}

function isBlank(value: unknown) {
  return typeof value !== 'string' ? value == null : value.trim() === '';
}

function physicalTableName(logicalName: unknown, index: number) {
  if (typeof logicalName !== 'string' || !logicalName.trim()) {
    return `table_${index + 1}`;
  }
  const mapped = logicalName
    .trim()
    .replace(/ユーザー|利用者/g, ' user ')
    .replace(/脳波/g, ' brain wave ')
    .replace(/測定/g, ' measurement ')
    .replace(/データ/g, ' data ')
    .replace(/結果/g, ' result ')
    .replace(/注文/g, ' order ')
    .replace(/商品/g, ' product ')
    .replace(/在庫/g, ' inventory ')
    .replace(/売上/g, ' sales ')
    .replace(/権限/g, ' permission ')
    .replace(/ロール/g, ' role ')
    .replace(/画面/g, ' screen ')
    .replace(/通知/g, ' notification ')
    .replace(/メール/g, ' email ')
    .replace(/ファイル/g, ' file ')
    .replace(/決済|支払/g, ' payment ')
    .replace(/会計/g, ' accounting ')
    .replace(/履歴/g, ' history ')
    .replace(/設定/g, ' setting ')
    .replace(/マスタ/g, ' master ');
  const name = mapped
    .replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toLowerCase();
  return name || `table_${index + 1}`;
}
