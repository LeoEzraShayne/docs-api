type ExtractionInput = {
  docTitle?: string | null;
};

type TabRow = Record<string, unknown>;

export function buildRequirementsStub(
  input: ExtractionInput,
  quality: 'standard' | 'high',
): Record<string, TabRow[]> {
  const title = input.docTitle || '要件定義';
  const detailSuffix = quality === 'high' ? '（高精度）' : '（標準）';

  return {
    flow: [
      { step: 1, actor: 'ユーザー', action: 'ログイン', note: `${title}${detailSuffix}` },
      { step: 2, actor: 'ユーザー', action: 'プロジェクト内容入力', note: 'フォームと議事録を入力する' },
      { step: 3, actor: 'システム', action: '生成', note: '構造化結果を返す' },
    ],
    screens: [
      { name: 'Login', purpose: 'Google/メール認証' },
      { name: 'Project Form', purpose: '案件背景と議事録入力' },
      { name: 'Preview', purpose: '生成結果確認' },
    ],
    functions: [
      { feature: 'Googleログイン', description: 'Google id_token でログイン', acceptance: 'ログインできる', exceptions: 'token 無効時は 401' },
      { feature: 'メール認証', description: '6桁コードを送信', acceptance: '10分以内に認証できる', exceptions: '制限超過時は 429' },
      { feature: '文書生成', description: 'Excelを生成', acceptance: '成功時にバージョン作成', exceptions: 'worker 失敗時は 503' },
    ],
    nfr: [
      { category: 'Security', requirement: 'httpOnly cookie 鑑別', target: 'JWT 30日', evidence: 'Set-Cookie' },
      { category: 'Performance', requirement: '生成処理の安定化', target: '30秒以内', evidence: 'サーバーログ' },
    ],
    risks_issues: [
      { issue: 'プレビュー悪用', summary: '一部行のみ表示', countermeasure: 'サーバー側制限', decision_point: '制限強化' },
      { issue: 'Excel worker停止', summary: '出力不可', countermeasure: '503と通知', decision_point: '代替worker' },
    ],
    glossary: [
      { term: 'Preview', meaning: '制限付き表示' },
      { term: 'Export', meaning: 'Excel出力' },
    ],
  };
}
