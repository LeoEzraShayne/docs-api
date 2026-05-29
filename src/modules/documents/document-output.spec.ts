import { BadRequestException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { DOCUMENT_CONFIG, sheetNames } from './document-config';
import { normalizeDocumentOutput, selectSheets } from './document-output';

describe('document output helpers', () => {
  it('returns all sheets for standard mode and configured sheets for simple mode', () => {
    expect(selectSheets(DocumentType.REQUIREMENTS, 'standard')).toEqual(
      sheetNames(DocumentType.REQUIREMENTS),
    );
    expect(selectSheets(DocumentType.REQUIREMENTS, 'simple')).toEqual(
      DOCUMENT_CONFIG.REQUIREMENTS.simpleSheets,
    );
  });

  it('rejects an empty or invalid custom sheet selection', () => {
    expect(() => selectSheets(DocumentType.BASIC_DESIGN, 'custom', [])).toThrow(
      BadRequestException,
    );
    expect(() =>
      selectSheets(DocumentType.BASIC_DESIGN, 'custom', ['存在しないシート']),
    ).toThrow(BadRequestException);
  });

  it('normalizes rows to fixed columns and keeps execution columns empty', () => {
    const selected = ['画面テスト'];
    const output = normalizeDocumentOutput(DocumentType.UNIT_TEST, selected, {
      sheets: {
        画面テスト: [
          {
            画面ID: 'SCR-001',
            テスト項目: 'ログイン',
            実施者: 'should be cleared',
            extra: 'ignored',
          },
        ],
      },
      metadata: { model: 'stub' },
    });

    expect(output.sheets['画面テスト']).toEqual([
      {
        No: 1,
        画面ID: 'SCR-001',
        テスト項目: 'ログイン',
        前提条件: '',
        テスト手順: '',
        期待結果: '',
        実施者: '',
        実施日: '',
        備考: '',
      },
    ]);
    expect(output.metadata).toEqual({ model: 'stub' });
  });

  it('rejects missing required sheet rows', () => {
    expect(() =>
      normalizeDocumentOutput(
        DocumentType.INTEGRATION_TEST,
        ['業務シナリオテスト'],
        {
          sheets: {},
        },
      ),
    ).toThrow(BadRequestException);
  });
});
