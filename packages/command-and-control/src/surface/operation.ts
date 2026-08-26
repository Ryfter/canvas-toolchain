import type { TaskCategory } from '../types.js';

export type IntentToolId =
  | 'ct_setup' | 'ct_import' | 'ct_inspect' | 'ct_analyze' | 'ct_plan'
  | 'ct_build' | 'ct_review' | 'ct_publish' | 'ct_ask';

export type SectionId =
  | 'modules' | 'registry' | 'transcripts' | 'research'
  | 'accessibility' | 'snapshots' | 'design' | 'admin';

export type Exposure = 'intent' | 'advanced' | 'internal';

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
}
