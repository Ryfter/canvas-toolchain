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

/** One wording for an unrecognized action, whether from describe's target or a direct call. */
function unknownAction(toolName: string, meta: { extendedBy: SectionId }, action: string | undefined, ops: Operation[]): CallToolResult {
  return json({
    error: `Unknown action "${action}" for ${toolName}`,
    validActions: [...ops.map((o) => o.intentAction), 'describe'],
    hint: `Less common operations live in ct_advanced section "${meta.extendedBy}".`,
  }, true);
}

function isCallToolResult(value: unknown): value is CallToolResult {
  return typeof value === 'object' && value !== null && Array.isArray((value as { content?: unknown }).content);
}

function requiredNames(schema: Record<string, unknown>): string[] {
  return Array.isArray(schema.required)
    ? schema.required.filter((n): n is string => typeof n === 'string')
    : [];
}

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
        '; describe — get full parameter schemas for one action (params: { of: "<action>" }) or all of this tool\'s actions.' +
        `\nFor less common operations see ct_advanced section "${meta.extendedBy}".`,
      inputSchema: {
        type: 'object',
        required: ['action'],
        properties: {
          action: { type: 'string', enum: [...ops.map((o) => o.intentAction as string), 'describe'] },
          params: {
            type: 'object',
            description: 'Arguments for the chosen action. For action="describe", optionally { of: "<action>" } to narrow to one.',
          },
        },
      },
    };
  });
}

export async function runIntent(
  reg: Registry, toolName: string, rawArgs: unknown,
): Promise<CallToolResult> {
  const meta = INTENT_TOOLS[toolName as IntentToolId];
  if (!meta) {
    return json({
      error: `Unknown tool "${toolName}"`,
      validTools: INTENT_IDS,
    }, true);
  }
  const args = (rawArgs ?? {}) as { action?: string; params?: unknown };
  const ops = actionsFor(reg, toolName as IntentToolId);

  if (args.action === 'describe') {
    const target = (args.params as { of?: string } | undefined)?.of;
    if (target) {
      const op = ops.find((o) => o.intentAction === target);
      if (!op) return unknownAction(toolName, meta, target, ops);
      return json({
        operations: { [op.intentAction as string]: { description: op.description, inputSchema: op.inputSchema } },
      });
    }
    return json({
      operations: Object.fromEntries(
        ops.map((o) => [o.intentAction as string, { description: o.description, inputSchema: o.inputSchema }]),
      ),
    });
  }

  const op = ops.find((o) => o.intentAction === args.action);
  if (!op) return unknownAction(toolName, meta, args.action, ops);

  const params = args.params ?? {};
  if (typeof params !== 'object' || Array.isArray(params)) {
    return json({
      error: 'params must be an object',
      inputSchema: op.inputSchema,
    }, true);
  }

  const missing = requiredNames(op.inputSchema).filter(
    (name) => !(name in (params as Record<string, unknown>)),
  );
  if (missing.length > 0) {
    return json({
      error: `Missing required field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
      missing,
      inputSchema: op.inputSchema,
    }, true);
  }

  const result = await op.handler(params);
  if (isCallToolResult(result)) return result;
  return json(result);
}
