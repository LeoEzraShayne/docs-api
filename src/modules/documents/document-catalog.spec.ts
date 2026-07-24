import { DocumentType } from '@prisma/client';
import {
  buildDocumentCatalogV1,
  calculateDocumentCatalogHash,
  safeWorkbookName,
} from './document-catalog';
import { DOCUMENT_CONFIG } from './document-config';

describe('document catalog v1', () => {
  it('is generated entirely from DOCUMENT_CONFIG', () => {
    const catalog = buildDocumentCatalogV1();

    expect(catalog.contractVersion).toBe(1);
    for (const type of Object.values(DocumentType)) {
      const actual = catalog.documents[type];
      const expected = DOCUMENT_CONFIG[type];
      expect(actual).toMatchObject({
        title: expected.title,
        filename: expected.filename,
        sources: expected.sources,
        modes: expected.modes,
        simpleSheets: expected.simpleSheets ?? [],
      });
      expect(actual.sheets).toEqual(
        expected.sheets.map((sheet) => ({
          ...sheet,
          workbookName: safeWorkbookName(sheet.name),
        })),
      );
    }
  });

  it('keeps a stable hash and changes it when the contract changes', () => {
    const first = buildDocumentCatalogV1();
    const second = buildDocumentCatalogV1();
    expect(first.contractHash).toBe(second.contractHash);

    const changed = structuredClone(first.documents);
    changed.REQUIREMENTS.sheets[0].columns.push('追加列');
    expect(calculateDocumentCatalogHash(changed)).not.toBe(first.contractHash);
  });

  it('uses Excel-safe worksheet names', () => {
    expect(safeWorkbookName('外部連携/API一覧')).toBe('外部連携・API一覧');
  });
});
