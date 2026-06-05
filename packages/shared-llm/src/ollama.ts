import type { LlmClient, LlmResponse } from './index.js';
import { LlmProviderError } from './errors.js';

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  /** Per-request timeout in ms. Default 120000 (120s). */
  timeoutMs?: number;
}

interface OllamaGenerateResponse {
  response?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export class OllamaLlmClient implements LlmClient {
  constructor(private readonly cfg: OllamaConfig) {}

  async complete(
    systemPrompt: string,
    userPrompt: string,
    opts: { model?: string; maxTokens?: number } = {},
  ): Promise<LlmResponse> {
    const model = opts.model ?? this.cfg.model;
    const timeoutMs = this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const body: Record<string, unknown> = {
      model,
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      stream: false,
    };
    if (opts.maxTokens !== undefined) {
      body.options = { num_predict: opts.maxTokens };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.cfg.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const e = err as { name?: string; cause?: { code?: string } };
      if (e?.name === 'AbortError') {
        throw new LlmProviderError(
          'OLLAMA_TIMEOUT',
          `Ollama request exceeded ${timeoutMs}ms timeout`,
          'ollama',
          ['Try a smaller model, or raise CC_OLLAMA_TIMEOUT_MS'],
        );
      }
      if (e?.cause?.code === 'ECONNREFUSED' || (err instanceof TypeError && /fetch failed/i.test(String(err)))) {
        throw new LlmProviderError(
          'OLLAMA_UNREACHABLE',
          `Could not reach Ollama at ${this.cfg.baseUrl}`,
          'ollama',
          [`Start Ollama with 'ollama serve', or switch providers with set_active_llm_provider`],
        );
      }
      throw new LlmProviderError(
        'LLM_REQUEST_FAILED',
        `Ollama request failed: ${err instanceof Error ? err.message : String(err)}`,
        'ollama',
        ['Check network and provider status'],
      );
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const truncated = detail.slice(0, 200);
      if (response.status === 404) {
        throw new LlmProviderError(
          'OLLAMA_MODEL_NOT_PULLED',
          `Ollama 404: ${truncated}`,
          'ollama',
          [`Run: ollama pull ${model}`],
        );
      }
      throw new LlmProviderError(
        'LLM_REQUEST_FAILED',
        `Ollama API ${response.status}: ${truncated}`,
        'ollama',
        ['Check network and provider status'],
      );
    }

    const payload = (await response.json()) as OllamaGenerateResponse;
    const text = payload.response ?? '';
    const usage = (payload.prompt_eval_count !== undefined || payload.eval_count !== undefined)
      ? { inputTokens: payload.prompt_eval_count ?? 0, outputTokens: payload.eval_count ?? 0 }
      : undefined;
    return { text, usage };
  }
}
