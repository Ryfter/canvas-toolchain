import type { ModuleTool } from '@canvas-toolchain/module-contract';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { parseRosterFile } from './data/roster.js';
import { proposeMajorBuckets, type Bucket } from './buckets/heuristic.js';
import { saveMajorBuckets } from './buckets/store.js';
import { createGroups, recordGroups, type CreateGroupsInput } from './run.js';
import type { Grouping } from './types.js';

const text = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }] });

const proposeBucketsTool: ModuleTool = {
  schema: {
    name: 'propose_major_buckets',
    description:
      'Preview-then-commit major→archetype-bucket map (technical/quantitative/creative/business/other) ' +
      'for the major-diversity grouping strategy. PROPOSE: with rosterFile (and no buckets), runs the ' +
      'keyword heuristic over the distinct majors and returns a draft map + the majors that fell to ' +
      "'other', for the professor to review/edit. No LLM. COMMIT: with a reviewed buckets map, persists " +
      'it to the per-course major-buckets.json so create_groups uses it.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseId'],
      properties: {
        courseId: { type: 'string', description: 'Canvas course id (for saving the reviewed map).' },
        rosterFile: { type: 'string', description: 'Path to the canvas_id,pseudonym,major CSV (propose path only).' },
        buckets: {
          type: 'object' as const,
          additionalProperties: { type: 'string' },
          description: 'Reviewed major→bucket map to persist (commit path). When given, the map is saved and rosterFile is ignored.',
        },
      },
    },
  },
  handler: async (args) => {
    const { courseId, rosterFile, buckets } = args as {
      courseId: string;
      rosterFile?: string;
      buckets?: Record<string, string>;
    };
    if (buckets) {
      const path = saveMajorBuckets(courseId, buckets as Record<string, Bucket>);
      return text(JSON.stringify({ saved: true, path, note: `Reviewed major buckets saved to ${path}.` }, null, 2));
    }
    if (!rosterFile) {
      return text(JSON.stringify({ error: 'rosterFile is required to propose a draft (or pass buckets to save a reviewed map).' }, null, 2));
    }
    const rows = parseRosterFile(rosterFile);
    const majors = rows.map((r) => r.major ?? '').filter(Boolean);
    const { map, other } = proposeMajorBuckets(majors);
    return text(JSON.stringify({ map, other, note: 'Review/edit, then call propose_major_buckets again with buckets to save (or pass majorBuckets to create_groups).' }, null, 2));
  },
};

const createGroupsTool: ModuleTool = {
  schema: {
    name: 'create_groups',
    description:
      'Form student teams from Canvas data + a thin roster file. Preview-safe: always writes a CSV ' +
      'and a markdown report (and optionally pushes to Canvas), but NEVER records the grouping into ' +
      "the semester pairing history — call record_groups for that once you've committed to a grouping. " +
      'strategy is one of: random, alphabetical, weighted, heterogeneous, homogeneous, major-diversity.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseId', 'strategy'],
      properties: {
        courseId: { type: 'string', description: 'Canvas course id.' },
        strategy: {
          type: 'string',
          description:
            'Grouping strategy id. One of: random, alphabetical, weighted, heterogeneous, ' +
            'homogeneous, major-diversity.',
        },
        groupSize: { type: 'number', description: 'Target members per group (give this OR groupCount).' },
        groupCount: { type: 'number', description: 'Target number of groups (give this OR groupSize).' },
        rosterFile: { type: 'string', description: 'Path to the canvas_id,pseudonym,major CSV.' },
        assignmentIds: {
          type: 'array' as const,
          items: { type: 'number' },
          description: 'Assignment ids to score "assignments completed" against (for relevant strategies).',
        },
        metric: { type: 'string', description: 'Metric key for heterogeneous/homogeneous (default overallGrade).' },
        weights: {
          type: 'object' as const,
          additionalProperties: { type: 'number' },
          description: 'metric→weight map for the weighted strategy.',
        },
        weightedMode: { type: 'string', description: "weighted strategy mode: 'balance' (default) or 'cluster'." },
        majorBuckets: {
          type: 'object' as const,
          additionalProperties: { type: 'string' },
          description:
            'major→archetype-bucket map for major-diversity (from propose_major_buckets, reviewed). ' +
            'Falls back to the saved major-buckets.json when omitted.',
        },
        seed: { type: 'number', description: 'RNG seed for deterministic output (default 1).' },
        outputDir: { type: 'string', description: 'Directory for the CSV + markdown (default under CC_HOME).' },
        pushToCanvas: { type: 'boolean', description: 'When true, also create the groups in Canvas.' },
        canvasCategoryName: { type: 'string', description: 'Group-set name used when pushing to Canvas.' },
      },
    },
  },
  handler: async (args) => {
    return text(JSON.stringify(await createGroups(args as CreateGroupsInput), null, 2));
  },
};

const recordGroupsTool: ModuleTool = {
  schema: {
    name: 'record_groups',
    description:
      'Commit a chosen grouping into the semester-long pairing history so future create_groups runs ' +
      'avoid re-pairing the same students (soft no-repeat). Pass the grouping as an array of groups, ' +
      'each group an array of canvas-id strings. This is the commit step that create_groups deliberately skips.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseId', 'grouping'],
      properties: {
        courseId: { type: 'string', description: 'Canvas course id (history is keyed per course).' },
        grouping: {
          type: 'array' as const,
          items: { type: 'array', items: { type: 'string' } },
          description: 'The grouping to record: an array of groups, each an array of canvas-id strings.',
        },
      },
    },
  },
  handler: async (args) => {
    const { courseId, grouping } = args as { courseId: string; grouping: Grouping };
    const path = recordGroups(courseId, grouping);
    return text(JSON.stringify({ recorded: true, historyPath: path, note: `Pairing history updated at ${path}.` }, null, 2));
  },
};

export const groupBuilderTools: ModuleTool[] = [proposeBucketsTool, createGroupsTool, recordGroupsTool];
