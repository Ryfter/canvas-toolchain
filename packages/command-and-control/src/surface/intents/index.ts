import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { IntentToolId, Operation, SectionId } from '../operation.js';

type Registry = Map<string, Operation>;

/** Each intent tool names the advanced section that extends it, so the model
 *  has somewhere to look when an intent action does not cover the request. */
export const INTENT_TOOLS: Record<IntentToolId, { summary: string; extendedBy: SectionId }> = {
  ct_setup:   { summary: 'Configure credentials, providers, and paths. Run first.', extendedBy: 'admin' },
  ct_import:  { summary: 'Bring course data in: Canvas archives, transcripts, prior shells.', extendedBy: 'transcripts' },
  ct_inspect: { summary: 'Read current course state: assignments, pages, modules, resources.', extendedBy: 'admin' },
  ct_analyze: { summary: 'Find what is stale: topic currency, semester diffs, off-syllabus drift.', extendedBy: 'research' },
  ct_plan:    { summary: 'Plan next semester: outlines, date shifts, assignment briefs.', extendedBy: 'research' },
  ct_build:   { summary: 'Generate Canvas-safe materials, examples, layouts, and rubrics.', extendedBy: 'design' },
  ct_review:  { summary: 'Accessibility and quality gates before students see anything.', extendedBy: 'accessibility' },
  ct_publish: { summary: 'Preview, publish, roll back, and snapshot Canvas content.', extendedBy: 'snapshots' },
  ct_ask:     { summary: 'Index a course and answer questions from its own materials.', extendedBy: 'admin' },
};

const INTENT_IDS = Object.keys(INTENT_TOOLS) as IntentToolId[];

const json = (value: unknown, isError = false): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

function actionsFor(reg: Registry, tool: IntentToolId): Operation[] {
  return [...reg.values()].filter((o) => o.exposure === 'intent' && o.intentTool === tool);
}

export function intentToolSchemas(reg: Registry): Tool[] {
  return INTENT_IDS.map((id) => {
    const ops = actionsFor(reg, id);
    const meta = INTENT_TOOLS[id];
    return {
      name: id,
      description:
        `${meta.summary}\nActions: ` +
        ops.map((o) => `${o.intentAction} — ${o.description}`).join('; ') +
        `\nFor less common operations see ct_advanced section "${meta.extendedBy}".`,
      inputSchema: {
        type: 'object',
        required: ['action'],
        properties: {
          action: { type: 'string', enum: ops.map((o) => o.intentAction as string) },
          params: { type: 'object', description: 'Arguments for the chosen action.' },
        },
      },
    };
  });
}

export async function runIntent(
  reg: Registry, toolName: string, rawArgs: unknown,
): Promise<CallToolResult> {
  const args = (rawArgs ?? {}) as { action?: string; params?: unknown };
  const ops = actionsFor(reg, toolName as IntentToolId);
  const op = ops.find((o) => o.intentAction === args.action);
  if (!op) {
    return json({
      error: `Unknown action "${args.action}" for ${toolName}`,
      validActions: ops.map((o) => o.intentAction),
      hint: `Less common operations live in ct_advanced section "${INTENT_TOOLS[toolName as IntentToolId]?.extendedBy}".`,
    }, true);
  }
  return json(await op.handler(args.params ?? {}));
}
