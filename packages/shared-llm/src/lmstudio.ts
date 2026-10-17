import type { LlmClient, LlmResponse } from './index.js';
import { LlmProviderError } from './errors.js';
import { assertEndpointAllowed, redirectBlocked } from './endpoint-guard.js';

/**
 * OpenAI-compatible client for LM Studio's local server. LM Studio exposes the
 * same surface as the OpenAI API under `{baseUrl}` (default
 * `http://localhost:1234/v1`): `POST /chat/completions` for generation and
 * `GET /models` to list loaded models.
 *
 * The endpoint is user-supplied, so every request re-runs the SSRF guard
 * immediately before `fetch` and refuses redirects (`redirect: 'manual'`). No
 * API key is required; when one is supplied it is sent as a Bearer header and
 * never logged or echoed.
 */
export interface LmStudioConfig {
  baseUrl: string;
  model: string;
  /** Optional Bearer token for a remote/LAN LM Studio server. Never logged. */
  apiKey?: string;
  /** Per-request timeout in ms. Default 120000 (120s). */
  timeoutMs?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface ModelsResponse {
  data?: Array<{ id?: string }>;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MODELS_TIMEOUT_MS = 3000;

const UNREACHABLE_FIX = [
  'Open LM Studio, load a model, then click Developer > Start Server',
  'Or switch providers with set_active_llm_provider',
];

export class LmStudioLlmClient implements LlmClient {
  constructor(private readonly cfg: LmStudioConfig) {}

  async complete(
    systemPrompt: string,
    userPrompt: string,
    opts: { model?: string; maxTokens?: number } = {},
  ): Promise<LlmResponse> {
    const model = opts.model ?? this.cfg.model;
    const timeoutMs = this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
    };
    if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;

    // Re-check the user-supplied endpoint (SSRF guard) immediately before the
    // request; a blocked endpoint never reaches fetch. Throws ENDPOINT_BLOCKED.
    const endpoint = await assertEndpointAllowed(this.cfg.baseUrl);
    const url = `${endpoint.url}/chat/completions`;

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.cfg.apiKey) headers.authorization = `Bearer ${this.cfg.apiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
        redirect: 'manual',
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const e = err as { name?: string; cause?: { code?: string } };
      if (e?.name === 'AbortError') {
        throw new LlmProviderError(
          'LMSTUDIO_TIMEOUT',
          `LM Studio request exceeded ${timeoutMs}ms timeout`,
          'lmstudio',
          ['Try a smaller model, or raise CC_LMSTUDIO_TIMEOUT_MS'],
        );
      }
      if (e?.cause?.code === 'ECONNREFUSED' || (err instanceof TypeError && /fetch failed/i.test(String(err)))) {
        throw new LlmProviderError(
          'LMSTUDIO_UNREACHABLE',
          `Could not reach LM Studio at ${endpoint.url}`,
          'lmstudio',
          UNREACHABLE_FIX,
        );
      }
      throw new LlmProviderError(
        'LLM_REQUEST_FAILED',
        `LM Studio request failed: ${err instanceof Error ? err.message : String(err)}`,
        'lmstudio',
        ['Check network and provider status'],
      );
    }
    clearTimeout(timeoutId);

    if (response.status >= 300 && response.status < 400) {
      throw redirectBlocked(url);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const truncated = detail.slice(0, 200);
      if (response.status === 404) {
        throw new LlmProviderError(
          'LMSTUDIO_MODEL_NOT_FOUND',
          `LM Studio 404: ${truncated}`,
          'lmstudio',
          [`Load '${model}' in LM Studio, then retry`, 'Run setup_lmstudio to list loaded models'],
        );
      }
      throw new LlmProviderError(
        'LLM_REQUEST_FAILED',
        `LM Studio API ${response.status}: ${truncated}`,
        'lmstudio',
        ['Check network and provider status'],
      );
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const text = payload.choices?.[0]?.message?.content ?? '';
    const usage = payload.usage
      ? { inputTokens: payload.usage.prompt_tokens ?? 0, outputTokens: payload.usage.completion_tokens ?? 0 }
      : undefined;
    return { text, usage };
  }
}

/**
 * List the model ids LM Studio currently serves (`GET {baseUrl}/models`).
 * Throws `EndpointBlockedError` for a refused endpoint and
 * `LlmProviderError('LMSTUDIO_UNREACHABLE' | 'LMSTUDIO_TIMEOUT')` when the
 * server cannot be reached, so callers can report a precise code.
 */
export async function listLmStudioModels(
  baseUrl: string,
  opts: { timeoutMs?: number } = {},
): Promise<string[]> {
  const endpoint = await assertEndpointAllowed(baseUrl);
  const url = `${endpoint.url}/models`;
  const timeoutMs = opts.timeoutMs ?? MODELS_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal, redirect: 'manual' });
  } catch (err) {
    const e = err as { name?: string };
    if (e?.name === 'AbortError') {
      throw new LlmProviderError(
        'LMSTUDIO_TIMEOUT',
        `LM Studio models request exceeded ${timeoutMs}ms timeout`,
        'lmstudio',
        UNREACHABLE_FIX,
      );
    }
    throw new LlmProviderError(
      'LMSTUDIO_UNREACHABLE',
      `Could not reach LM Studio at ${endpoint.url}`,
      'lmstudio',
      UNREACHABLE_FIX,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status >= 300 && response.status < 400) {
    throw redirectBlocked(url);
  }
  if (!response.ok) {
    throw new LlmProviderError(
      'LMSTUDIO_UNREACHABLE',
      `LM Studio models endpoint returned HTTP ${response.status} at ${endpoint.url}`,
      'lmstudio',
      UNREACHABLE_FIX,
    );
  }

  const payload = (await response.json()) as ModelsResponse;
  return (payload.data ?? []).map((m) => m.id ?? '').filter(Boolean);
}
