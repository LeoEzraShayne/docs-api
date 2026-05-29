import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildRequirementsStub } from './requirements-stub';

type ExtractionInput = {
  docTitle?: string | null;
  formFields: Record<string, unknown>;
  minutesText: string;
};

type TabRow = Record<string, unknown>;

@Injectable()
export class LlmService {
  constructor(private readonly configService: ConfigService) {}

  async generateJson<T>(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    quality: 'standard' | 'high',
    fallback: T,
  ): Promise<T> {
    const client = this.getChatCompletionClient(quality);
    if (!client.apiKey) return fallback;

    const response = await fetch(client.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${client.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: client.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`${client.provider} chat completion failed: ${response.status} ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error(`${client.provider} chat completion returned empty content`);
    return JSON.parse(content) as T;
  }

  async extractRequirements(
    input: ExtractionInput,
    quality: 'standard' | 'high',
  ): Promise<Record<string, TabRow[]>> {
    const client = this.getChatCompletionClient(quality);

    if (!client.apiKey) {
      return buildRequirementsStub(input, quality);
    }

    const response = await fetch(client.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${client.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: client.model,
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
      const body = await response.text().catch(() => '');
      throw new Error(
        `${client.provider} chat completion failed: ${response.status} ${body.slice(0, 300)}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(`${client.provider} chat completion returned empty content`);
    }

    const parsed = JSON.parse(content) as Record<string, TabRow[]>;
    return this.normalizeTabs(parsed, input);
  }

  private getChatCompletionClient(quality: 'standard' | 'high') {
    const deepSeekKey = this.configService.get<string>('DEEPSEEK_API_KEY');
    const openAiKey =
      this.configService.get<string>('OPENAI_API_KEY') ??
      this.configService.get<string>('docs_generate_key');
    const useDeepSeek =
      this.configService.get<string>('LLM_PROVIDER') === 'deepseek' ||
      !!deepSeekKey;

    if (useDeepSeek) {
      const baseUrl =
        this.configService.get<string>('DEEPSEEK_BASE_URL') ??
        'https://api.deepseek.com';
      const model =
        quality === 'high'
          ? this.configService.get<string>('DEEPSEEK_MODEL_HIGH') ??
            this.configService.get<string>('DEEPSEEK_MODEL') ??
            'deepseek-v4-pro'
          : this.configService.get<string>('DEEPSEEK_MODEL_STANDARD') ??
            this.configService.get<string>('DEEPSEEK_MODEL') ??
            'deepseek-v4-pro';

      return {
        provider: 'DeepSeek',
        apiKey: deepSeekKey,
        model,
        url: this.chatCompletionsUrl(baseUrl),
      };
    }

    const model =
      quality === 'high'
        ? this.configService.get<string>('OPENAI_MODEL_HIGH') ?? 'gpt-4.1'
        : this.configService.get<string>('OPENAI_MODEL_STANDARD') ??
          'gpt-4.1-mini';

    return {
      provider: 'OpenAI',
      apiKey: openAiKey,
      model,
      url: 'https://api.openai.com/v1/chat/completions',
    };
  }

  private chatCompletionsUrl(baseUrl: string) {
    const normalized = baseUrl.replace(/\/$/, '');
    if (normalized.endsWith('/chat/completions')) {
      return normalized;
    }

    return `${normalized}/chat/completions`;
  }

  private normalizeTabs(
    tabs: Record<string, TabRow[]>,
    input: ExtractionInput,
  ): Record<string, TabRow[]> {
    const stub = buildRequirementsStub(input, 'standard');
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

}
