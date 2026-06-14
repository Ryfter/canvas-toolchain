import type { ModuleTool } from '@canvas-toolchain/module-contract';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { RosterCanvasClient, loadCanvasCreds } from './canvas/client.js';
import { parseRosterFile } from './peoplesoft/parse.js';
import { loadColumnMap, saveColumnMap } from './peoplesoft/column-map.js';
import { loadMajorAliases } from './major/aliases.js';
import { tryMakeAnthropicLlm } from './major/llm.js';
import { proposeRoster } from './propose.js';
import { commitRoster } from './commit.js';
import { resolveIdentity } from './resolve.js';
import type { ColumnMapping, ProposalReport } from './types.js';

const text = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }] });
const json = (v: unknown): CallToolResult => text(JSON.stringify(v, null, 2));

const proposeRosterTool: ModuleTool = {
  schema: {
    name: 'propose_roster',
    description:
      'Read-only proposal: ingest a PeopleSoft CSV, match students to Canvas to discover each ' +
      "canvas_id, assign stable per-student pseudonyms (returning students keep theirs), and " +
      'AI-normalize majors. Returns a review report (matched/ambiguous/unmatched/returning/' +
      'collisions/major map). WRITES NOTHING — idempotent, safe to re-run. Then call commit_roster. ' +
      'Provide the column mapping once; it is remembered for next term.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseId', 'term', 'peopleSoftFile'],
      properties: {
        courseId: { type: 'string', description: 'Canvas course id to pull the roster from.' },
        term: { type: 'string', description: 'Current term code (e.g. FA26); prefixes NEW students\' pseudonyms.' },
        peopleSoftFile: { type: 'string', description: 'Path to the PeopleSoft export CSV.' },
        columnMap: {
          type: 'object' as const,
          description: 'Header names for studentNumber,email,userId,name,major[,secondMajor]. ' +
            'Omit to reuse the remembered mapping.',
          properties: {
            studentNumber: { type: 'string' }, email: { type: 'string' }, userId: { type: 'string' },
            name: { type: 'string' }, major: { type: 'string' }, secondMajor: { type: 'string' },
          },
        },
      },
    },
  },
  handler: async (args) => {
    const a = args as { courseId: string; term: string; peopleSoftFile: string; columnMap?: ColumnMapping };
    const mapping = a.columnMap ?? loadColumnMap();
    if (!mapping) return json({ error: 'No column mapping provided and none remembered. Pass columnMap once.' });
    if (a.columnMap) saveColumnMap(a.columnMap);

    const peopleSoft = parseRosterFile(a.peopleSoftFile, mapping);
    const canvas = new RosterCanvasClient(loadCanvasCreds());
    const canvasUsers = await canvas.listCourseStudents(Number(a.courseId));

    const report = await proposeRoster({
      term: a.term, courseId: a.courseId, peopleSoft, canvasUsers,
      llm: tryMakeAnthropicLlm(), aliases: loadMajorAliases(),
    });
    return json(report);
  },
};

const commitRosterTool: ModuleTool = {
  schema: {
    name: 'commit_roster',
    description:
      'Commit a reviewed proposal (from propose_roster): write the PII-free canvas_id,pseudonym,major ' +
      'roster CSV and insert new students into the identity vault. The ONLY tool that writes. ' +
      'Returning students are not re-numbered, so re-commit is safe. Refuses to run if the proposal ' +
      'still carries unresolved vault collisions.',
    inputSchema: {
      type: 'object' as const,
      required: ['proposal', 'outputPath'],
      properties: {
        proposal: { type: 'object' as const, description: 'The ProposalReport object returned by propose_roster.' },
        outputPath: { type: 'string', description: 'Path to write the de-identified roster CSV.' },
      },
    },
  },
  handler: async (args) => {
    const a = args as { proposal: ProposalReport; outputPath: string };
    return json(commitRoster(a.proposal, a.outputPath));
  },
};

const resolveIdentityTool: ModuleTool = {
  schema: {
    name: 'resolve_identity',
    description:
      'Reverse-lookup: given one or more pseudonyms, resolve each to the live Canvas name (and email ' +
      'if your token exposes it) via the vault. Caches nothing; re-fetches from Canvas each time. ' +
      'Reports unknown pseudonyms and students no longer reachable in Canvas.',
    inputSchema: {
      type: 'object' as const,
      required: ['pseudonyms'],
      properties: {
        pseudonyms: { type: 'array' as const, items: { type: 'string' }, description: 'Pseudonyms to resolve.' },
      },
    },
  },
  handler: async (args) => {
    const a = args as { pseudonyms: string[] };
    const canvas = new RosterCanvasClient(loadCanvasCreds());
    const fetchUser = (canvasId: string) => canvas.getUserById(canvasId);
    return json(await resolveIdentity(a.pseudonyms, fetchUser));
  },
};

export const rosterTools: ModuleTool[] = [proposeRosterTool, commitRosterTool, resolveIdentityTool];
