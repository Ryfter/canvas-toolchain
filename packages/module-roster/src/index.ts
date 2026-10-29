import {
  requireCtx,
  type AnthropicCredential,
  type CanvasToolchainModule,
  type ModuleContext,
} from '@canvas-toolchain/module-contract';
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import { createRosterTools } from './tools.js';

export const MODULE_ID = 'roster';

export interface RosterModuleOptions {
  /** Test seam for Canvas HTTP. */
  fetchImpl?: typeof fetch;
  /** Test seam for the LLM built from a configured Anthropic credential. */
  makeLlm?(cred: AnthropicCredential): LlmClient;
}

/**
 * Build a roster module instance with its own host context. The host calls `init(ctx)` once
 * before exposing the tools; a tool called earlier throws MODULE_NOT_INITIALIZED.
 */
export function createRosterModule(opts: RosterModuleOptions = {}): CanvasToolchainModule {
  let ctx: ModuleContext | undefined;
  return {
    id: MODULE_ID,
    name: 'Roster & Identity Manager',
    description:
      'Build the PII-free canvas_id,pseudonym,major roster the Group Builder consumes: ingest a ' +
      'PeopleSoft CSV, match students to Canvas, assign stable per-student pseudonyms, AI-normalize ' +
      'majors. Propose->commit; a minimal SIS-anchored vault stores only the identity link.',
    version: '1.0.0',
    handles: [],
    contractVersion: 2,
    credentials: [
      {
        kind: 'canvas',
        required: true,
        purpose: 'Reads your course roster to match PeopleSoft students to Canvas and resolve pseudonyms to names.',
      },
      {
        kind: 'anthropic',
        required: false,
        purpose: 'Normalizes PeopleSoft major names; without it, majors pass through unchanged.',
      },
    ],
    init(c: ModuleContext): void {
      ctx = c;
    },
    tools: createRosterTools({
      getCtx: () => requireCtx(ctx),
      fetchImpl: opts.fetchImpl,
      makeLlm: opts.makeLlm,
    }),
  };
}

const rosterModule = createRosterModule();

export default rosterModule;
export { proposeRoster } from './propose.js';
export { commitRoster } from './commit.js';
export { resolveIdentity } from './resolve.js';
// Reused by @canvas-toolchain/module-peerassessment (vault bridge + PeopleSoft fallback).
// Path-taking: pass ctx.paths.secrets to both loadVault and loadColumnMap (roster-vault/ moves as one unit).
export { loadVault } from './vault/store.js';
export { loadColumnMap } from './peoplesoft/column-map.js';
export { parseRosterFile } from './peoplesoft/parse.js';
export type { VaultRecord, ColumnMapping, PeopleSoftRow } from './types.js';
