import { LlmProviderError } from './errors.js';

export interface AnthropicConfig {
  apiKey: string;
  model: string;
}

export interface LlmResponse {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LlmClient {
  /** Send a system + user prompt to the LLM and return the response text +
   *  usage metadata. Implementations: production (Anthropic API), test (mock). */
  complete(
    systemPrompt: string,
    userPrompt: string,
    opts?: { model?: string; maxTokens?: number },
  ): Promise<LlmResponse>;
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Production LLM client that calls api.anthropic.com. Config is passed in by the
 *  caller (typically loaded from ~/.command-and-control/anthropic-config.json in C&C
 *  consumers, or the equivalent path in any other consumer). */
export class AnthropicLlmClient implements LlmClient {
  constructor(private readonly cfg: AnthropicConfig) {}

  async complete(
    systemPrompt: string,
    userPrompt: string,
    opts: { model?: string; maxTokens?: number } = {},
  ): Promise<LlmResponse> {
    const model = opts.model ?? this.cfg.model;
    const maxTokens = opts.maxTokens ?? 4096;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const truncated = detail.slice(0, 200);
      if (response.status === 401) {
        throw new LlmProviderError(
          'ANTHROPIC_INVALID_KEY',
          `Anthropic API 401: ${truncated}`,
          'anthropic',
          ['Re-run setup_anthropic with a valid key'],
        );
      }
      if (response.status === 429) {
        throw new LlmProviderError(
          'ANTHROPIC_RATE_LIMITED',
          `Anthropic API 429: ${truncated}`,
          'anthropic',
          ['Wait and retry, or switch to Ollama with set_active_llm_provider'],
        );
      }
      throw new LlmProviderError(
        'LLM_REQUEST_FAILED',
        `Anthropic API ${response.status}: ${truncated}`,
        'anthropic',
        ['Check network and provider status'],
      );
    }

    const payload = (await response.json()) as AnthropicResponse;
    const text = (payload.content ?? [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('');
    return {
      text,
      usage: payload.usage
        ? { inputTokens: payload.usage.input_tokens ?? 0, outputTokens: payload.usage.output_tokens ?? 0 }
        : undefined,
    };
  }
}
