export type LlmProvider = 'anthropic' | 'ollama' | 'unknown';

export class LlmProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly provider: LlmProvider,
    public readonly fix: string[],
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}
