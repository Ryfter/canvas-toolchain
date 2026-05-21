import { OllamaAdapter } from '../llm/ollama_adapter.js';
import type { LlmClient } from '../llm/client.js';
import type { CcConfig, TaskCategory } from '../types.js';

export class ModelRouter {
  private ollama: OllamaAdapter | null = null;
  private ollamaReachable: boolean | null = null;

  constructor(
    private readonly config: CcConfig,
    private readonly anthropicFactory: () => LlmClient,
  ) {
    if (config.providers.ollama) {
      this.ollama = new OllamaAdapter(
        config.providers.ollama.baseUrl,
        config.providers.ollama.model,
      );
    }
  }

  async forCategory(category: TaskCategory): Promise<LlmClient> {
    if (category === 'none') {
      throw new Error('Category "none" requires no LLM — do not call forCategory("none")');
    }

    const preferred = this.config.routing[category];

    if (preferred === 'ollama' && this.ollama) {
      if (this.ollamaReachable === null) {
        this.ollamaReachable = await this.ollama.isReachable();
      }
      if (this.ollamaReachable) return this.ollama;
    }

    return this.anthropicFactory();
  }
}
