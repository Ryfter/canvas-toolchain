export type TaskCategory = 'none' | 'fast' | 'judgment';
export type ProviderName = 'anthropic' | 'ollama';
export type Mode = 'easy' | 'advanced';

export interface AnthropicProviderConfig {
  model: string;
}

export interface OllamaProviderConfig {
  baseUrl: string;
  model: string;
}

export interface CcConfig {
  mode: Mode;
  providers: {
    anthropic: AnthropicProviderConfig;
    ollama?: OllamaProviderConfig;
  };
  /** Path to the canvas-backup executable. Set via setup_cc so professors don't need env vars. */
  downloader?: {
    executablePath?: string;
  };
  /** Premium registry settings. Token is never logged or echoed by tools. */
  registry?: {
    token?: string;
    premiumBaseUrl?: string;
    githubOrg?: string;
  };
  routing: {
    fast: ProviderName;
    judgment: ProviderName;
  };
  lastRun: {
    analyze_course: string | null;
    plan_next_semester: string | null;
    update_course_materials: string | null;
    full_pipeline: string | null;
  };
}

export const DEFAULT_CONFIG: CcConfig = {
  mode: 'easy',
  providers: {
    anthropic: { model: 'claude-sonnet-4-6' },
  },
  routing: {
    fast: 'anthropic',
    judgment: 'anthropic',
  },
  lastRun: {
    analyze_course: null,
    plan_next_semester: null,
    update_course_materials: null,
    full_pipeline: null,
  },
};
