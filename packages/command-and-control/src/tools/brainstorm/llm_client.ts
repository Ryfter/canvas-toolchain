import { loadAnthropicConfig } from '../setup_anthropic.js';

export interface LlmResponse {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LlmClient {
  complete(systemPrompt: string, userPrompt: string, opts?: { model?: string; maxTokens?: number }): Promise<LlmResponse>;
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Production LLM client that calls api.anthropic.com using the key stored
 *  by setup_anthropic. Mirrors the shape from tools/rubric/llm_client.ts —
 *  a future refactor can extract these into a shared module under tools/llm/. */
export class AnthropicLlmClient implements LlmClient {
  async complete(
    systemPrompt: string,
    userPrompt: string,
    opts: { model?: string; maxTokens?: number } = {},
  ): Promise<LlmResponse> {
    const cfg = loadAnthropicConfig();
    const model = opts.model ?? cfg.model;
    const maxTokens = opts.maxTokens ?? 4096;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': cfg.apiKey,
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
      throw new Error(`Anthropic API ${response.status}: ${detail.slice(0, 200)}`);
    }

    const payload = await response.json() as AnthropicResponse;
    const text = (payload.content ?? [])
      .filter(c => c.type === 'text' && typeof c.text === 'string')
      .map(c => c.text as string)
      .join('');
    return {
      text,
      usage: payload.usage
        ? { inputTokens: payload.usage.input_tokens ?? 0, outputTokens: payload.usage.output_tokens ?? 0 }
        : undefined,
    };
  }
}
