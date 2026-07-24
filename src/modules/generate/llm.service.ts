import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
      throw new Error(
        `${client.provider} chat completion failed: ${response.status} ${body.slice(0, 300)}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content)
      throw new Error(
        `${client.provider} chat completion returned empty content`,
      );
    return JSON.parse(content) as T;
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
          ? (this.configService.get<string>('DEEPSEEK_MODEL_HIGH') ??
            this.configService.get<string>('DEEPSEEK_MODEL') ??
            'deepseek-v4-pro')
          : (this.configService.get<string>('DEEPSEEK_MODEL_STANDARD') ??
            this.configService.get<string>('DEEPSEEK_MODEL') ??
            'deepseek-v4-pro');

      return {
        provider: 'DeepSeek',
        apiKey: deepSeekKey,
        model,
        url: this.chatCompletionsUrl(baseUrl),
      };
    }

    const model =
      quality === 'high'
        ? (this.configService.get<string>('OPENAI_MODEL_HIGH') ?? 'gpt-4.1')
        : (this.configService.get<string>('OPENAI_MODEL_STANDARD') ??
          'gpt-4.1-mini');

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
}
