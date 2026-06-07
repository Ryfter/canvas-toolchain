import Anthropic from '@anthropic-ai/sdk';
import type { LlmClient, LlmOpts } from './client.js';

const DEFAULT_MODEL = 'claude-opus-4-8';
const DEFAULT_MAX_TOKENS = 4096;

export class AnthropicAdapter implements LlmClient {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(prompt: string, opts?: LlmOpts): Promise<string> {
    const response = await this.client.messages.create({
      model: opts?.model ?? DEFAULT_MODEL,
      max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as Anthropic.TextBlock).text)
      .join('');
  }
}
