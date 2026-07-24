import { DocumentType } from '@prisma/client';
import { DOCUMENT_CONFIG } from '../documents/document-config';

const TAB_LIMIT = 5;
const LEGACY_KEYS = [
  'flow',
  'screens',
  'functions',
  'nfr',
  'risks_issues',
  'glossary',
] as const;

export type PreviewSchema = 'requirements-v2' | 'legacy-v1';

const REQUIREMENTS_REDACTIONS: Record<string, string[]> = {
  機能要件一覧: ['概要'],
  '外部連携/API一覧': ['業務説明'],
  非機能要件: ['説明'],
  '課題・リスク一覧': ['影響'],
};

function redactLegacyRow(tab: string, row: Record<string, unknown>) {
  const clone = { ...row };

  if (tab === 'functions') {
    delete clone.acceptance;
    delete clone.acceptanceCriteria;
    delete clone.exceptions;
  }

  if (tab === 'nfr') {
    delete clone.target;
    delete clone.evidence;
  }

  if (tab === 'risks_issues') {
    delete clone.countermeasure;
    delete clone.decision_point;
  }

  return clone;
}

export function detectPreviewSchema(
  tabs: Record<string, Record<string, unknown>[]>,
): PreviewSchema {
  const officialSheets = DOCUMENT_CONFIG[DocumentType.REQUIREMENTS].sheets;
  if (officialSheets.every((sheet) => Array.isArray(tabs[sheet.name]))) {
    return 'requirements-v2';
  }
  if (LEGACY_KEYS.some((key) => Array.isArray(tabs[key]))) {
    return 'legacy-v1';
  }
  return 'legacy-v1';
}

export function emptyRequirementsTabs() {
  return Object.fromEntries(
    DOCUMENT_CONFIG[DocumentType.REQUIREMENTS].sheets.map((sheet) => [
      sheet.name,
      [],
    ]),
  );
}

export function redactPreviewTabs(
  tabs: Record<string, Record<string, unknown>[]>,
) {
  if (detectPreviewSchema(tabs) === 'requirements-v2') {
    return Object.fromEntries(
      DOCUMENT_CONFIG[DocumentType.REQUIREMENTS].sheets.map((sheet) => [
        sheet.name,
        (tabs[sheet.name] ?? []).slice(0, TAB_LIMIT).map((row) => {
          const clone = { ...row };
          for (const column of REQUIREMENTS_REDACTIONS[sheet.name] ?? []) {
            clone[column] = '（正式生成後に表示）';
          }
          return clone;
        }),
      ]),
    );
  }

  return Object.fromEntries(
    Object.entries(tabs).map(([tab, rows]) => [
      tab,
      rows.slice(0, TAB_LIMIT).map((row) => redactLegacyRow(tab, row)),
    ]),
  );
}
