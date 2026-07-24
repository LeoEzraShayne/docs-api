import { DocumentSourceType, DocumentType } from '@prisma/client';

export type SheetSpec = { name: string; columns: string[] };
export type GenerationMode = 'standard' | 'simple' | 'custom';
export type DocumentConfig = {
  title: string;
  filename: string;
  sources: DocumentSourceType[];
  modes: GenerationMode[];
  simpleSheets?: string[];
  sheets: SheetSpec[];
};

const execCols = ['実施者', '実施日', '備考'];

export const DOCUMENT_CONFIG: Record<DocumentType, DocumentConfig> = {
  REQUIREMENTS: {
    title: '要件定義書',
    filename: '要件定義書.xlsx',
    sources: ['PROJECT', 'DIRECT_INPUT'],
    modes: ['standard', 'simple', 'custom'],
    simpleSheets: [
      '項目概要',
      '機能要件一覧',
      '画面一覧',
      'データ項目定義',
      '業務フロー',
    ],
    sheets: [
      ['項目概要', ['No', '項目', '内容']],
      ['スコープ定義', ['No', '区分', '対象', '説明']],
      ['業務要件', ['No', '業務', '課題', '要件']],
      ['機能要件一覧', ['No', '機能名', '目的', '概要', '優先度']],
      ['画面一覧', ['No', '画面ID', '画面名', '目的', '主な機能']],
      ['画面概要', ['No', '画面名', '利用者', '概要']],
      ['権限一覧', ['No', 'ロール名', '利用可能機能']],
      ['データ項目定義', ['No', 'エンティティ名', '目的', '主なデータ項目']],
      [
        '外部連携/API一覧',
        ['No', 'API名', '目的', '呼出元', '呼出先', '業務説明'],
      ],
      ['非機能要件', ['No', '分類', '要件', '説明']],
      ['業務フロー', ['No', 'ステップ', '担当', '内容']],
      ['課題・リスク一覧', ['No', '分類', '内容', '影響']],
    ].map(([name, columns]) => ({
      name: name as string,
      columns: columns as string[],
    })),
  },
  BASIC_DESIGN: {
    title: '基本設計書',
    filename: '基本設計書.xlsx',
    sources: ['REQUIREMENTS_VERSION', 'DIRECT_INPUT'],
    modes: ['standard', 'custom'],
    sheets: [
      ['基本設計概要', ['No', '項目', '内容']],
      [
        'システム構成設計',
        ['No', '論理名', '物理名', '種別', '主な役割', '入力', '出力', '備考'],
      ],
      ['画面遷移一覧', ['No', '現在画面', '操作', '遷移先画面']],
      ['画面設計', ['No', '画面名', '画面ID', '画面目的', '主な機能']],
      ['機能設計', ['No', '機能名', '機能ID', '機能説明', '入力', '出力']],
      [
        'API設計',
        [
          'No',
          'API名',
          'API ID',
          'URL',
          'Method',
          '機能概要',
          'リクエスト概要',
          'レスポンス概要',
        ],
      ],
      [
        'データベース設計',
        [
          'No',
          'テーブル論理名',
          'テーブル物理名',
          '目的',
          '主な項目',
          '主キー',
        ],
      ],
      [
        '権限設計',
        ['No', 'ロール名', '対象機能', '参照', '更新', '削除', '備考'],
      ],
      [
        'バッチ・帳票設計',
        ['No', '名称', '種別', '実行タイミング', '機能概要'],
      ],
      ['非機能設計', ['No', '分類', '要件', '説明']],
    ].map(([name, columns]) => ({
      name: name as string,
      columns: columns as string[],
    })),
  },
  DETAILED_DESIGN: {
    title: '詳細設計書',
    filename: '詳細設計書.xlsx',
    sources: ['BASIC_DESIGN_VERSION', 'DIRECT_INPUT'],
    modes: ['standard', 'custom'],
    sheets: [
      [
        'テーブル詳細設計',
        ['No', 'テーブル論理名', 'テーブル物理名', '用途', '主な処理', '備考'],
      ],
      [
        'テーブル項目定義',
        [
          'No',
          'テーブル論理名',
          'テーブル物理名',
          '項目論理名',
          '項目物理名',
          'データ型',
          '必須',
          '説明',
        ],
      ],
      [
        'API項目定義',
        [
          'No',
          'API ID',
          '区分',
          '項目論理名',
          '項目物理名',
          'データ型',
          '必須',
          '説明',
          'サンプル値',
        ],
      ],
      [
        'API詳細設計',
        [
          'No',
          'API名',
          'API ID',
          'URL',
          'Method',
          'Request JSON',
          'Response JSON',
          '処理概要',
        ],
      ],
      [
        '画面項目設計',
        [
          'No',
          '画面名',
          '画面ID',
          '項目論理名',
          '項目物理名',
          '項目種別',
          '必須',
          '活性条件',
          '説明',
        ],
      ],
      [
        '入力チェック設計',
        [
          'No',
          '画面名',
          '項目論理名',
          '項目物理名',
          'チェック内容',
          'エラーメッセージ',
        ],
      ],
      ['画面処理設計', ['No', '画面名', '操作', '処理内容', '呼出API']],
      [
        'エラー設計',
        ['No', 'エラーコード', 'エラー名', 'エラー内容', '処理方法'],
      ],
      [
        'メッセージ設計',
        ['No', 'メッセージID', 'メッセージ内容', '表示タイミング'],
      ],
    ].map(([name, columns]) => ({
      name: name as string,
      columns: columns as string[],
    })),
  },
  UNIT_TEST: {
    title: '単体テスト仕様書',
    filename: '単体テスト仕様書.xlsx',
    sources: ['DETAILED_DESIGN_VERSION', 'DIRECT_INPUT'],
    modes: ['standard', 'custom'],
    sheets: ['画面テスト', 'APIテスト', 'DBテスト'].map((name) => ({
      name,
      columns: [
        'No',
        name === 'DBテスト'
          ? 'テーブル名'
          : name === 'APIテスト'
            ? 'API ID'
            : '画面ID',
        'テスト項目',
        '前提条件',
        'テスト手順',
        '期待結果',
        ...execCols,
      ],
    })),
  },
  INTEGRATION_TEST: {
    title: '結合テスト仕様書',
    filename: '結合テスト仕様書.xlsx',
    sources: ['DETAILED_DESIGN_VERSION', 'PASTED_DESIGN'],
    modes: ['standard', 'custom'],
    sheets: [
      {
        name: '業務シナリオテスト',
        columns: [
          'No',
          'シナリオ名',
          '関連機能',
          '前提条件',
          'テスト手順',
          '期待結果',
          ...execCols,
        ],
      },
    ],
  },
};

export function parseDocumentType(value: string): DocumentType | null {
  return Object.values(DocumentType).includes(value as DocumentType)
    ? (value as DocumentType)
    : null;
}

export function sheetNames(type: DocumentType) {
  return DOCUMENT_CONFIG[type].sheets.map((sheet) => sheet.name);
}
