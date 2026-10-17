import { assertEndpointAllowed, redirectBlocked } from '@canvas-toolchain/shared-llm';
import type { LlmClient, LlmOpts } from './client.js';

export class OllamaAdapter implements LlmClient {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async complete(prompt: string, opts?: LlmOpts): Promise<string> {
    // SSRF guard on the user-supplied OLLAMA_BASE_URL before any request.
    const endpoint = await assertEndpointAllowed(this.baseUrl);
    const response = await fetch(`${endpoint.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts?.model ?? this.model,
        prompt,
        stream: false,
        ...(opts?.maxTokens ? { options: { num_predict: opts.maxTokens } } : {}),
      }),
      redirect: 'manual',
    });

    if (response.status >= 300 && response.status < 400) {
      throw redirectBlocked(`${endpoint.url}/api/generate`);
    }
    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { response: string };
    return data.response;
  }

  async isReachable(): Promise<boolean> {
    try {
      const endpoint = await assertEndpointAllowed(this.baseUrl);
      const response = await fetch(`${endpoint.url}/api/tags`, {
        signal: AbortSignal.timeout(3000),
        redirect: 'manual',
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
