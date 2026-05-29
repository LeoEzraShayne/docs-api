import { DocumentSourceType, DocumentType } from '@prisma/client';

export const DOCUMENT_CONFIG: Record<
  DocumentType,
  {
    title: string;
    filename: string;
    sources: DocumentSourceType[];
    sheets: string[];
  }
> = {
  REQUIREMENTS: {
    title: '要件定義書',
    filename: '要件定義書.xlsx',
    sources: ['PROJECT', 'DIRECT_INPUT'],
    sheets: [
      '項目概要',
      'スコープ定義',
      '業務要件',
      '機能要件一覧',
      '画面一覧',
      '画面概要',
      '権限一覧',
      'データ項目定義',
      '外部連携/API一覧',
      '非機能要件',
      '業務フロー',
      '課題・リスク一覧',
    ],
  },
  BASIC_DESIGN: {
    title: '基本設計書',
    filename: '基本設計書.xlsx',
    sources: ['REQUIREMENTS_VERSION', 'DIRECT_INPUT'],
    sheets: [
      '基本設計概要',
      'システム構成設計',
      '画面遷移一覧',
      '画面設計',
      '機能設計',
      'API設計',
      'データベース設計',
      '権限設計',
      'バッチ・帳票設計',
      '非機能設計',
    ],
  },
  DETAILED_DESIGN: {
    title: '詳細設計書',
    filename: '詳細設計書.xlsx',
    sources: ['BASIC_DESIGN_VERSION', 'DIRECT_INPUT'],
    sheets: [
      'テーブル詳細設計',
      'テーブル項目定義',
      'API項目定義',
      'API詳細設計',
      '画面項目設計',
      '入力チェック設計',
      '画面処理設計',
      'エラー設計',
      'メッセージ設計',
    ],
  },
  UNIT_TEST: {
    title: '単体テスト仕様書',
    filename: '単体テスト仕様書.xlsx',
    sources: ['DETAILED_DESIGN_VERSION', 'DIRECT_INPUT'],
    sheets: ['画面テスト', 'APIテスト', 'DBテスト'],
  },
  INTEGRATION_TEST: {
    title: '結合テスト仕様書',
    filename: '結合テスト仕様書.xlsx',
    sources: ['DETAILED_DESIGN_VERSION', 'PASTED_DESIGN'],
    sheets: ['業務シナリオテスト'],
  },
};

export function parseDocumentType(value: string): DocumentType | null {
  return Object.values(DocumentType).includes(value as DocumentType)
    ? (value as DocumentType)
    : null;
}
