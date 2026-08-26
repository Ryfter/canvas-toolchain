import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Operation, SectionId } from './operation.js';
import { SECTIONS, SECTION_IDS } from './sections.js';

type Registry = Map<string, Operation>;

const json = (value: unknown, isError = false): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

/** Operations reachable through ct_advanced: everything not on an intent tool
 *  and not internal. */
function advancedOps(reg: Registry): Operation[] {
  return [...reg.values()].filter((o) => o.exposure === 'advanced');
}

/**
 * The description carries section and operation NAMES only — never schemas.
 * That is the whole context saving: names are cheap, schemas are not.
 */
export function advancedToolSchema(reg: Registry): Tool {
  const ops = advancedOps(reg);
  const lines = SECTION_IDS.map((id) => {
    const names = ops.filter((o) => o.section === id).map((o) => o.id);
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

  if (args.action === 'describe') {
    if (args.operation) {
      const op = ops.find((o) => o.id === args.operation);
      if (!op) {
        return json({ error: `Unknown operation: ${args.operation}`,
                      validOperations: ops.map((o) => o.id) }, true);
      }
      return json({ operations: { [op.id]: { description: op.description, inputSchema: op.inputSchema } } });
    }
    if (args.section) {
      const inSection = ops.filter((o) => o.section === args.section);
      return json({
        section: args.section,
        operations: Object.fromEntries(
          inSection.map((o) => [o.id, { description: o.description, inputSchema: o.inputSchema }]),
        ),
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
    const op = reg.get(args.operation ?? '');
    // Internal operations run as steps inside other operations and are not
    // callable. Report them like any unknown id so the model self-corrects.
    if (!op || op.exposure !== 'advanced') {
      return json({ error: `Unknown or non-callable operation: ${args.operation}`,
                    validOperations: ops.map((o) => o.id) }, true);
    }
    const result = await op.handler(args.params ?? {});
    return json(result);
  }

  return json({ error: `Unknown action: ${args.action}`, validActions: ['describe', 'run'] }, true);
}
