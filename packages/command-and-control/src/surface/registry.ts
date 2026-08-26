import type { Operation } from './operation.js';
import { setupCc } from '../tools/setup_cc.js';
import { setupAnthropic } from '../tools/setup_anthropic.js';
import { setupCanvas } from '../tools/setup_canvas.js';
import { setupOllama } from '../tools/setup_ollama.js';

export const CORE_OPERATIONS: Operation[] = [
  {
    id: 'setup_cc',
    section: 'admin',
    description: 'Configure Command & Control: set mode (easy/advanced), Anthropic model, Ollama base URL and model, and routing preferences. Run this first.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mode: { type: 'string', enum: ['easy', 'advanced'] },
        anthropicModel: { type: 'string', description: 'Anthropic model name, e.g. "claude-sonnet-4-6".' },
        ollamaBaseUrl: { type: 'string', description: 'Ollama server URL, e.g. "http://localhost:11434".' },
        ollamaModel: { type: 'string', description: 'Ollama model name, e.g. "llama3.2".' },
        routingFast: { type: 'string', enum: ['anthropic', 'ollama'] },
        routingJudgment: { type: 'string', enum: ['anthropic', 'ollama'] },
        downloaderPath: { type: 'string', description: 'Absolute path to the canvas-backup executable (or canvas-backup.exe). Persisted in config — professors set this once instead of managing env vars.' },
        registryToken: { type: 'string', description: 'Premium registry token for ryfter:// resources. Stored locally and never echoed back.' },
        premiumRegistryBaseUrl: { type: 'string', description: 'Optional premium registry API base URL override.' },
        registryGithubOrg: { type: 'string', description: 'Optional GitHub org override for the free registry. Defaults to canvas-toolchain.' },
      },
    },
    handler: (args) => setupCc(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'cc',
  },
  {
    id: 'setup_anthropic',
    section: 'admin',
    description: 'Configure the Anthropic API key used by all AI-powered tools. Validates the key against the Anthropic API before saving. Stored locally at ~/.command-and-control/anthropic-config.json with 0o600 permissions.',
    inputSchema: {
      type: 'object' as const,
      required: ['apiKey'],
      properties: {
        apiKey: { type: 'string', description: 'Anthropic API key starting with sk-ant-. Stored locally and never echoed back.' },
        model: { type: 'string', description: 'Anthropic model name for validation calls, e.g. "claude-haiku-4-5-20251001" (default).' },
        test: { type: 'boolean', description: 'Validate the key with a 1-token API call before saving (default: true).' },
      },
    },
    handler: (args) => setupAnthropic(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'anthropic',
  },
  {
    id: 'setup_canvas',
    section: 'admin',
    description: 'Configure the Canvas LMS host and API token used for direct page publishing. Validates the token against /api/v1/users/self before saving. Stored locally at ~/.command-and-control/canvas-config.json with 0o600 permissions.',
    inputSchema: {
      type: 'object' as const,
      required: ['host', 'token'],
      properties: {
        host: { type: 'string', description: 'Canvas hostname, e.g. "example.instructure.com". Leading https:// is stripped automatically.' },
        token: { type: 'string', description: 'Canvas API access token from Canvas → Account → Settings → New Access Token. Stored locally and never echoed back.' },
        test: { type: 'boolean', description: 'Validate the token with /api/v1/users/self before saving (default: true).' },
      },
    },
    handler: (args) => setupCanvas(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'canvas',
  },
  {
    id: 'setup_ollama',
    section: 'admin',
    description: 'Configure Ollama as the local generation LLM. Discovery mode (no model) returns the recommended-models markdown. Commit mode (with model) validates the model is pulled and writes ollama-config.json.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        baseUrl: { type: 'string', description: 'Ollama base URL. Default http://localhost:11434.' },
        model: { type: 'string', description: 'Ollama model ID. Omit for discovery mode.' },
      },
    },
    handler: (args) => setupOllama(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'ollama',
  },
];

export function buildRegistry(): Map<string, Operation> {
  const reg = new Map<string, Operation>();
  for (const op of CORE_OPERATIONS) {
    if (reg.has(op.id)) throw new Error(`duplicate operation id: ${op.id}`);
    reg.set(op.id, op);
  }
  return reg;
}
