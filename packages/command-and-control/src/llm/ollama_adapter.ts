/** @deprecated Use @canvas-toolchain/shared-llm instead. */
import type { LlmClient, LlmOpts } from './client.js';

export class OllamaAdapter implements LlmClient {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async complete(prompt: string, opts?: LlmOpts): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts?.model ?? this.model,
        prompt,
        stream: false,
        ...(opts?.maxTokens ? { options: { num_predict: opts.maxTokens } } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { response: string };
    return data.response;
  }

  async isReachable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
