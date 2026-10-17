import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Operation, SectionId } from './operation.js';
import { SECTIONS, SECTION_IDS } from './sections.js';

type Registry = Map<string, Operation>;

const json = (value: unknown, isError = false): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

/** Operations reachable through ct_advanced: everything not on an intent tool
 *  and not internal, plus the deprecated legacy ids kept as warning wrappers. */
function advancedOps(reg: Registry): Operation[] {
  const ops = [...reg.values()];
  return [
    ...ops.filter((o) => o.exposure === 'advanced'),
    // A deprecated op normally still sits on its intent tool, so this adds a
    // second address for it. The exposure guard keeps a future deprecated
    // advanced op from being listed twice.
    ...ops.filter((o) => o.deprecated !== undefined && o.exposure !== 'advanced'),
  ];
}

/** What describe reports for one operation. A deprecated op carries its
 *  replacement so the model can move to the supported call. */
function described(op: Operation): Record<string, unknown> {
  return {
    description: op.description,
    inputSchema: op.inputSchema,
    ...(op.deprecated ? { deprecated: op.deprecated } : {}),
  };
}

/**
 * A deprecated legacy id still runs exactly as it did, so its result is
 * returned untouched apart from the deprecation itself: a plain object gains
 * the `deprecation` field, and a CallToolResult keeps its own content — and its
 * `isError` — with the notice appended as one more text block.
 *
 * Anything else (an array, a scalar) is wrapped under `result` rather than
 * spread, because spreading an array into an object would silently turn it into
 * `{0: …, 1: …}`. No operation returns such a shape today; the branch exists so
 * a future one cannot be corrupted rather than to serve a caller.
 */
function withDeprecation(result: unknown, op: Operation): CallToolResult {
  const deprecated = op.deprecated!;
  if (isCallToolResult(result)) {
    return { ...result, content: [...result.content, { type: 'text', text: deprecated.notice }] };
  }
  if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
    return json({ ...result as Record<string, unknown>, deprecation: deprecated });
  }
  return json({ result, deprecation: deprecated });
}

/** One wording for describe and run so an unknown id reads the same either way. */
function unknownOperation(operation: string | undefined, ops: Operation[]): CallToolResult {
  return json({
    error: `Unknown operation: ${operation}`,
    validOperations: ops.map((o) => o.id),
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

/**
 * The description carries section and operation NAMES only — never schemas.
 * That is the whole context saving: names are cheap, schemas are not. A
 * deprecated id is the one exception, carrying its replacement inline so the
 * marker is visible without a describe round-trip.
 */
export function advancedToolSchema(reg: Registry): Tool {
  const ops = advancedOps(reg);
  const lines = SECTION_IDS.map((id) => {
    const names = ops
      .filter((o) => o.section === id)
      .map((o) => (o.deprecated ? `${o.id} (${o.deprecated.marker})` : o.id));
    return names.length ? `- ${id}: ${SECTIONS[id].description} [${names.join(', ')}]` : null;
  }).filter(Boolean);

  return {
    name: 'ct_advanced',
    description:
      'Less common operations, grouped into sections. Call with action="describe" and a ' +
      'section to get full parameter schemas for that section, then action="run" to execute ' +
      'one. Sections and their operations:\n' + lines.join('\n'),
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['describe', 'run'] },
        section: { type: 'string', enum: SECTION_IDS },
        operation: { type: 'string', description: 'Operation id, required when action="run".' },
        params: { type: 'object', description: 'Arguments for the operation.' },
      },
    },
  };
}

export async function runAdvanced(reg: Registry, rawArgs: unknown): Promise<CallToolResult> {
  const args = (rawArgs ?? {}) as {
    action?: string; section?: SectionId; operation?: string; params?: unknown;
  };
  const ops = advancedOps(reg);

  // Mirrors the missing-action guard at the top of runIntent (intents/index.ts):
  // an absent action must not fall through to the bottom fallback, which would
  // interpolate the literal string "undefined" into the error message.
  if (args.action === undefined) {
    return json({
      error: 'Missing required field "action" for ct_advanced',
      validActions: ['describe', 'run'],
    }, true);
  }

  if (args.section !== undefined && !(SECTION_IDS as string[]).includes(args.section)) {
    return json({
      error: `Unknown section: ${args.section}`,
      validSections: SECTION_IDS,
    }, true);
  }

  if (args.action === 'describe') {
    if (args.operation) {
      const op = ops.find((o) => o.id === args.operation);
      if (!op) return unknownOperation(args.operation, ops);
      return json({ operations: { [op.id]: described(op) } });
    }
    if (args.section) {
      const inSection = ops.filter((o) => o.section === args.section);
      return json({
        section: args.section,
        operations: Object.fromEntries(inSection.map((o) => [o.id, described(o)])),
      });
    }
    return json({
      sections: Object.fromEntries(SECTION_IDS.map((id) => [id, {
        description: SECTIONS[id].description,
        operations: ops.filter((o) => o.section === id).map((o) => o.id),
      }])),
    });
  }

  if (args.action === 'run') {
    if (args.operation === undefined) {
      return json({
        error: 'Missing required field "operation" for action="run"',
        validOperations: ops.map((o) => o.id),
      }, true);
    }

    const op = reg.get(args.operation);
    // Internal operations run as steps inside other operations and are not
    // callable. Report them like any unknown id so the model self-corrects.
    // A deprecated id is callable here by design: that is the warning wrapper.
    if (!op || (op.exposure !== 'advanced' && op.deprecated === undefined)) {
      return unknownOperation(args.operation, ops);
    }

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
    if (op.deprecated) return withDeprecation(result, op);
    if (isCallToolResult(result)) return result;
    return json(result);
  }

  return json({ error: `Unknown action: ${args.action}`, validActions: ['describe', 'run'] }, true);
}
