import { describe, expect, it } from 'vitest';
import { LlmProviderError } from '../src/errors.js';

describe('LlmProviderError', () => {
  it('preserves code, provider, message, and fix', () => {
    const err = new LlmProviderError('OLLAMA_UNREACHABLE', 'No connection', 'ollama', ['Start Ollama']);
    expect(err.code).toBe('OLLAMA_UNREACHABLE');
    expect(err.provider).toBe('ollama');
    expect(err.message).toBe('No connection');
    expect(err.fix).toEqual(['Start Ollama']);
  });

  it('is an instance of Error and LlmProviderError', () => {
    const err = new LlmProviderError('ANY', 'msg', 'unknown', []);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LlmProviderError);
  });

  it('has name === "LlmProviderError" so stack traces are readable', () => {
    const err = new LlmProviderError('ANY', 'msg', 'unknown', []);
    expect(err.name).toBe('LlmProviderError');
  });
});
