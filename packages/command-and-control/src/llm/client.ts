export interface LlmOpts {
  model?: string;
  maxTokens?: number;
}

export interface LlmClient {
  complete(prompt: string, opts?: LlmOpts): Promise<string>;
}
