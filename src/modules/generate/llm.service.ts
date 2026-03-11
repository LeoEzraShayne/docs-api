import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type ExtractionInput = {
  docTitle?: string | null;
  formFields: Record<string, unknown>;
  minutesText: string;
};

type TabRow = Record<string, unknown>;

@Injectable()
export class LlmService {
  constructor(private readonly configService: ConfigService) {}

  async extractRequirements(
    input: ExtractionInput,
    quality: 'standard' | 'high',
  ): Promise<Record<string, TabRow[]>> {
    const openAiKey =
      this.configService.get<string>('OPENAI_API_KEY') ??
      this.configService.get<string>('docs_generate_key');

    if (!openAiKey) {
      return this.stub(input, quality);
    }

    try {
      const model =
        quality === 'high'
          ? this.configService.get<string>('OPENAI_MODEL_HIGH') ?? 'gpt-4.1'
          : this.configService.get<string>('OPENAI_MODEL_STANDARD') ??
            'gpt-4.1-mini';

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You extract Japanese requirements into strict JSON with tabs: flow, screens, functions, nfr, risks_issues, glossary.',
            },
            {
              role: 'user',
              content: JSON.stringify(input),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI ${response.status}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return this.stub(input, quality);
      }

      const parsed = JSON.parse(content) as Record<string, TabRow[]>;
      return this.normalizeTabs(parsed, input);
    } catch {
      return this.stub(input, quality);
    }
  }

  private normalizeTabs(
    tabs: Record<string, TabRow[]>,
    input: ExtractionInput,
  ): Record<string, TabRow[]> {
    const stub = this.stub(input, 'standard');
    return {
      flow: this.normalizeRows(tabs.flow ?? stub.flow),
      screens: this.normalizeRows(tabs.screens ?? stub.screens),
      functions: this.normalizeRows(tabs.functions ?? stub.functions),
      nfr: this.normalizeRows(tabs.nfr ?? stub.nfr),
      risks_issues: this.normalizeRows(tabs.risks_issues ?? stub.risks_issues),
      glossary: this.normalizeRows(tabs.glossary ?? stub.glossary),
    };
  }

  private normalizeRows(rows: unknown[]): TabRow[] {
    return rows.map((row) => {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        return row as TabRow;
      }

      if (typeof row === 'string') {
        return { value: row };
      }

      return { value: JSON.stringify(row) };
    });
  }

  private stub(
    input: ExtractionInput,
    quality: 'standard' | 'high',
  ): Record<string, TabRow[]> {
    const title = input.docTitle || '要件定義';
    const detailSuffix = quality === 'high' ? '（高精度）' : '（標準）';

    return {
      flow: [
        { step: 1, actor: '用户', action: '登录', note: `${title}${detailSuffix}` },
        { step: 2, actor: '用户', action: '输入项目内容', note: '填写表单并粘贴议事录' },
        { step: 3, actor: '系统', action: '生成预览/导出', note: '返回多标签结构化结果' },
      ],
      screens: [
        { name: 'Login', purpose: 'Google/邮箱验证码登录' },
        { name: 'Project Form', purpose: '录入项目背景与会议纪要' },
        { name: 'Preview', purpose: '查看受限/完整要件定义结果' },
      ],
      functions: [
        {
          feature: 'Google登录',
          description: '使用 Google id_token 登录',
          acceptance: '用户能完成授权并进入项目页',
          exceptions: 'token 无效时返回 401',
        },
        {
          feature: '邮箱验证码登录',
          description: '通过 Resend 发送 6 位验证码',
          acceptance: '10 分钟内验证码有效',
          exceptions: '超过频率限制返回 429',
        },
        {
          feature: '项目生成',
          description: '生成预览和 Excel',
          acceptance: '成功时创建版本号',
          exceptions: 'worker 失败时返回 503',
        },
      ],
      nfr: [
        {
          category: 'Security',
          requirement: 'httpOnly cookie 鉴权',
          target: 'JWT 30 天有效',
          evidence: 'Set-Cookie header',
        },
        {
          category: 'Performance',
          requirement: '生成接口支持降级',
          target: 'preview 30 秒内返回',
          evidence: '服务端日志',
        },
      ],
      risks_issues: [
        {
          issue: '未付费截图白嫖',
          summary: '预览只返回前 5 行并隐藏关键列',
          countermeasure: '服务端 redaction',
          decision_point: '是否后续增加更强限制',
        },
        {
          issue: 'Excel worker 不可用',
          summary: '导出不可用但不扣费',
          countermeasure: '503 + 告警',
          decision_point: '是否引入备用 worker',
        },
      ],
      glossary: [
        { term: 'Preview', meaning: '受限预览，不可下载完整 Excel' },
        { term: 'Export', meaning: '消耗额度并生成完整 xlsx' },
      ],
    };
  }
}
