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

  it('fills missing physical table names for database design sheets', () => {
    const basic = normalizeDocumentOutput(
      DocumentType.BASIC_DESIGN,
      ['データベース設計'],
      {
        sheets: {
          データベース設計: [
            { テーブル論理名: 'ユーザー' },
            { テーブル論理名: '測定データ' },
          ],
        },
      },
    );
    const detailed = normalizeDocumentOutput(
      DocumentType.DETAILED_DESIGN,
      ['テーブル詳細設計', 'テーブル項目定義'],
      {
        sheets: {
          テーブル詳細設計: [{ テーブル論理名: '測定データ' }],
          テーブル項目定義: [{ テーブル論理名: '測定データ' }],
        },
      },
    );

    expect(basic.sheets['データベース設計']).toMatchObject([
      { テーブル論理名: 'ユーザー', テーブル物理名: 'user' },
      { テーブル論理名: '測定データ', テーブル物理名: 'measurement_data' },
    ]);
    expect(detailed.sheets['テーブル詳細設計'][0]).toMatchObject({
      テーブル物理名: 'measurement_data',
    });
    expect(detailed.sheets['テーブル項目定義'][0]).toMatchObject({
      テーブル物理名: 'measurement_data',
    });
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
