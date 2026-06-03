import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicLlmClient, type AnthropicConfig } from '../src/index.js';

describe('AnthropicLlmClient', () => {
  const cfg: AnthropicConfig = { apiKey: 'sk-test-123', model: 'claude-3-5-sonnet-20241022' };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to api.anthropic.com with the supplied config', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(
      JSON.stringify({ content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 3, output_tokens: 1 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    const client = new AnthropicLlmClient(cfg);

    const result = await client.complete('sys', 'usr');

    expect(globalThis.fetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'x-api-key': 'sk-test-123',
        'anthropic-version': '2023-06-01',
      }),
    }));
    expect(result).toEqual({ text: 'hi', usage: { inputTokens: 3, outputTokens: 1 } });
  });

  it('throws with status + truncated body on non-200', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('rate limited', { status: 429 }));
    const client = new AnthropicLlmClient(cfg);

    await expect(client.complete('sys', 'usr')).rejects.toThrow(/Anthropic API 429.*rate limited/);
  });

  it('honors opts.model and opts.maxTokens overrides', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(
      JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }),
      { status: 200 },
    ));
    const client = new AnthropicLlmClient(cfg);

    await client.complete('sys', 'usr', { model: 'claude-3-opus', maxTokens: 500 });

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body) as { model: string; max_tokens: number };
    expect(body.model).toBe('claude-3-opus');
    expect(body.max_tokens).toBe(500);
  });

  it('returns concatenated text from multi-block content', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(
      JSON.stringify({ content: [{ type: 'text', text: 'foo ' }, { type: 'text', text: 'bar' }, { type: 'tool_use' }] }),
      { status: 200 },
    ));
    const client = new AnthropicLlmClient(cfg);

    const result = await client.complete('sys', 'usr');

    expect(result.text).toBe('foo bar');
  });
});
