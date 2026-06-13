import type { ModuleTool } from '@canvas-toolchain/module-contract';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { parseRosterFile } from './data/roster.js';
import { proposeMajorBuckets } from './buckets/heuristic.js';

const text = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }] });

const proposeBucketsTool: ModuleTool = {
  schema: {
    name: 'propose_major_buckets',
    description:
      'Propose a major→archetype-bucket map (technical/quantitative/creative/business/other) ' +
      'from the distinct majors in the roster file, for the professor to review/edit before using ' +
      'the major-diversity grouping strategy. Heuristic, no LLM.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseId', 'rosterFile'],
      properties: {
        courseId: { type: 'string', description: 'Canvas course id (for saving the reviewed map).' },
        rosterFile: { type: 'string', description: 'Path to the canvas_id,pseudonym,major CSV.' },
      },
    },
  },
  handler: async (args) => {
    const { rosterFile } = args as { courseId: string; rosterFile: string };
    const rows = parseRosterFile(rosterFile);
    const majors = rows.map((r) => r.major ?? '').filter(Boolean);
    const { map, other } = proposeMajorBuckets(majors);
    return text(JSON.stringify({ map, other, note: 'Review/edit, then pass as majorBuckets to create_groups (or save to major-buckets.json).' }, null, 2));
  },
};

export const groupBuilderTools: ModuleTool[] = [proposeBucketsTool];
