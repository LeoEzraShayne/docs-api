import { Injectable } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { DOCUMENT_CONFIG, SheetSpec } from './document-config';
import { DocumentOutput } from './document-output';
import { DOCUMENT_PROMPT_RULES } from './document-prompt-texts';
import { LlmService } from '../generate/llm.service';

type Input = {
  project: Record<string, unknown>;
  inputJson: Record<string, unknown>;
  source: unknown;
  selectedSheets: string[];
  testViewpoints?: string[];
};

@Injectable()
export class DocumentPromptService {
  constructor(private readonly llm: LlmService) {}

  generate(type: DocumentType, input: Input, quality: 'standard' | 'high') {
    const config = DOCUMENT_CONFIG[type];
    const specs = config.sheets.filter((sheet) =>
      input.selectedSheets.includes(sheet.name),
    );
    return this.llm.generateJson<DocumentOutput>(
      [
        { role: 'system', content: this.systemPrompt(type, specs) },
        { role: 'user', content: JSON.stringify(input) },
      ],
      quality,
      this.stub(type, specs, input),
    );
  }

  private systemPrompt(type: DocumentType, specs: SheetSpec[]) {
    return [
      `Generate ${DOCUMENT_CONFIG[type].title} as strict JSON.`,
      'Return only {"sheets":{sheetName:rows[]},"metadata":{}}.',
      'Use Japanese user-visible content. Do not add sheets or columns.',
      'Every selected sheet must contain at least one row and must use exactly the required Japanese column names.',
      'If source information is missing, keep the relevant cell blank instead of inventing unsupported facts.',
      ...DOCUMENT_PROMPT_RULES[type],
      `Required sheets and columns: ${JSON.stringify(specs)}`,
    ].join('\n');
  }

  private stub(
    type: DocumentType,
    specs: SheetSpec[],
    input: Input,
  ): DocumentOutput {
    const title = String(input.project.docTitle ?? DOCUMENT_CONFIG[type].title);
    return {
      sheets: Object.fromEntries(
        specs.map((spec) => [
          spec.name,
          [this.stubRow(type, spec, title, input)],
        ]),
      ),
      metadata: { stub: true },
    };
  }

  private stubRow(
    type: DocumentType,
    spec: SheetSpec,
    title: string,
    input: Input,
  ) {
    const row: Record<string, unknown> = {};
    for (const column of spec.columns)
      row[column] = this.valueFor(type, spec.name, column, title, input);
    return row;
  }

  private valueFor(
    type: DocumentType,
    sheet: string,
    column: string,
    title: string,
    input: Input,
  ) {
    if (column === 'No') return 1;
    if (column === '実施者' || column === '実施日' || column === '備考')
      return '';
    if (column.includes('ID')) return `${type.slice(0, 3)}-001`;
    if (column.includes('画面')) return 'ログイン画面';
    if (column.includes('API')) return 'ユーザー登録API';
    if (column.includes('テーブル')) return 'ユーザー';
    if (column.includes('シナリオ')) return 'ユーザー登録シナリオ';
    if (column.includes('テスト')) return `${sheet}の確認`;
    if (column.includes('手順'))
      return '1. 入力する\n2. 実行する\n3. 結果を確認する';
    if (column.includes('期待')) return '期待どおりに処理される';
    if (column.includes('関連機能')) return '認証コード送信、ユーザー登録';
    if (column.includes('分類')) return '業務';
    if (column.includes('種別')) return '画面';
    if (
      column.includes('内容') ||
      column.includes('説明') ||
      column.includes('概要')
    )
      return `${title}の${sheet}`;
    return String(input.inputJson[column] ?? `${sheet} ${column}`);
  }
}
