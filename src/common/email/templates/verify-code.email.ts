export const VERIFY_CODE_EMAIL_SUBJECT = '【Docs】ログイン認証コード';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildVerifyCodeEmail(code: string) {
  const safeCode = escapeHtml(code);

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${VERIFY_CODE_EMAIL_SUBJECT}</title>
  </head>
  <body style="margin:0; padding:0; background:#f4f6f8; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; background:#f4f6f8;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; max-width:560px; border-collapse:collapse;">
            <tr>
              <td style="padding:0 0 16px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td align="center" width="40" height="40" style="width:40px; height:40px; border-radius:10px; background:#111827; color:#ffffff; font-size:20px; font-weight:700; line-height:40px;">
                      D
                    </td>
                    <td style="padding-left:12px; color:#111827; font-size:18px; font-weight:700; line-height:24px;">
                      Docs
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff; border:1px solid #e5e7eb; border-radius:18px; box-shadow:0 18px 45px rgba(17, 24, 39, 0.08); overflow:hidden;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse;">
                  <tr>
                    <td style="padding:36px 32px 28px 32px;">
                      <h1 style="margin:0; color:#111827; font-size:24px; font-weight:700; line-height:32px; letter-spacing:0;">
                        ログイン認証コード
                      </h1>
                      <p style="margin:14px 0 0 0; color:#4b5563; font-size:15px; line-height:24px;">
                        Docsへのログインに使用する認証コードをお送りします。
                      </p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; margin:28px 0; border-collapse:collapse;">
                        <tr>
                          <td align="center" style="padding:28px 16px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:14px;">
                            <div style="color:#6b7280; font-size:13px; font-weight:700; line-height:18px;">
                              認証コード
                            </div>
                            <div style="margin-top:10px; color:#111827; font-size:38px; font-weight:800; line-height:46px; letter-spacing:8px;">
                              ${safeCode}
                            </div>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:0; color:#374151; font-size:15px; line-height:24px;">
                        このコードは<strong style="font-weight:700;">10分間</strong>有効です。
                      </p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; margin-top:22px; border-collapse:collapse;">
                        <tr>
                          <td style="padding:14px 16px; background:#f8fafc; border-left:4px solid #111827; border-radius:10px; color:#4b5563; font-size:13px; line-height:20px;">
                            心当たりがない場合は、このメールを破棄してください。
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px 12px 0 12px; color:#6b7280; font-size:12px; line-height:20px;">
                このメールは自動送信されています。返信はできません。
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildVerifyCodeText(code: string) {
  return [
    `Docsのログイン認証コードは ${code} です。`,
    'このコードは10分間有効です。',
    '心当たりがない場合は、このメールを破棄してください。',
    'このメールは自動送信されています。返信はできません。',
  ].join('\n');
}
