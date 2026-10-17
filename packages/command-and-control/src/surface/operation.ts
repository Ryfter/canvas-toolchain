import type { TaskCategory } from '../types.js';

export type IntentToolId =
  | 'ct_setup' | 'ct_import' | 'ct_inspect' | 'ct_analyze' | 'ct_plan'
  | 'ct_build' | 'ct_review' | 'ct_publish' | 'ct_ask';

export type SectionId =
  | 'modules' | 'registry' | 'transcripts' | 'research'
  | 'accessibility' | 'snapshots' | 'design' | 'admin';

export type Exposure = 'intent' | 'advanced' | 'internal';

/** The supported call that replaces a deprecated operation. */
export interface DeprecatedReplacement {
  tool: IntentToolId;
  action: string;
}

/**
 * Present on an operation kept one release as a warning wrapper. Its legacy id
 * still runs through `ct_advanced`, but the replacement is the supported path.
 *
 * `marker` and `notice` carry the human wording. They live on the operation
 * rather than in each renderer so the `ct_advanced` help, the run result, and
 * the generated skill op files can never disagree about it.
 */
export interface Deprecation {
  replacement: DeprecatedReplacement;
  /** The release the legacy id disappears in. */
  removeIn: string;
  /** Short form for listings: `Deprecated — use ct_setup {action: "canvas"}`. */
  marker: string;
  /** Full form for run results and skill files: `marker` plus the removal release. */
  notice: string;
}

export interface Operation {
  /** Unique across core and module operations. Module ops are host-namespaced. */
  id: string;
  section: SectionId;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown) => unknown | Promise<unknown>;
  taskCategory: TaskCategory;
  exposure: Exposure;
  /** Required when exposure === 'intent'. */
  intentTool?: IntentToolId;
  intentAction?: string;
  /** Set on a legacy operation kept as a warning wrapper for one release. */
  deprecated?: Deprecation;
}
