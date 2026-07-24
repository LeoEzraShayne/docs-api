import { DocumentType } from '@prisma/client';
import { DOCUMENT_CONFIG } from '../documents/document-config';
import {
  detectPreviewSchema,
  emptyRequirementsTabs,
  redactPreviewTabs,
} from './redaction';

describe('requirements preview schema and redaction', () => {
  it('detects and preserves every official sheet and column', () => {
    const tabs = Object.fromEntries(
      DOCUMENT_CONFIG[DocumentType.REQUIREMENTS].sheets.map((sheet) => [
        sheet.name,
        Array.from({ length: 7 }, (_, index) =>
          Object.fromEntries(
            sheet.columns.map((column) => [column, `${column}-${index + 1}`]),
          ),
        ),
      ]),
    );

    expect(detectPreviewSchema(tabs)).toBe('requirements-v2');
    const preview = redactPreviewTabs(tabs);
    expect(Object.keys(preview)).toEqual(
      DOCUMENT_CONFIG[DocumentType.REQUIREMENTS].sheets.map(
        (sheet) => sheet.name,
      ),
    );
    for (const sheet of DOCUMENT_CONFIG[DocumentType.REQUIREMENTS].sheets) {
      expect(preview[sheet.name]).toHaveLength(5);
      expect(Object.keys(preview[sheet.name][0])).toEqual(sheet.columns);
    }
    expect(preview['機能要件一覧'][0]['概要']).toBe('（正式生成後に表示）');
    expect(preview['外部連携/API一覧'][0]['業務説明']).toBe(
      '（正式生成後に表示）',
    );
  });

  it('keeps legacy previews compatible with the original redaction rules', () => {
    const tabs = {
      flow: [{ step: 1 }],
      screens: [{ name: '画面' }],
      functions: [{ feature: '検索', acceptance: '確認条件' }],
      nfr: [{ requirement: '性能', target: '3秒' }],
      risks_issues: [{ issue: '遅延', countermeasure: '増員' }],
      glossary: [{ term: '受注' }],
    };
    expect(detectPreviewSchema(tabs)).toBe('legacy-v1');
    const preview = redactPreviewTabs(tabs);
    expect(preview.functions[0]).not.toHaveProperty('acceptance');
    expect(preview.nfr[0]).not.toHaveProperty('target');
    expect(preview.risks_issues[0]).not.toHaveProperty('countermeasure');
  });

  it('creates the complete empty v2 paywall shape', () => {
    const empty = emptyRequirementsTabs();
    expect(detectPreviewSchema(empty)).toBe('requirements-v2');
    expect(Object.values(empty).every((rows) => rows.length === 0)).toBe(true);
  });
});
