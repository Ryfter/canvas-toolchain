import { type ModuleContext, type ModuleTool } from '@canvas-toolchain/module-contract';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { PaCanvasClient } from './canvas/client.js';
import { buildVaultIndex } from './source/vault.js';
import { loadPeopleSoftIndex } from './source/peoplesoft.js';
import { buildPeerAssessmentImport } from './build.js';
import { peerAssessmentDir } from './paths.js';

const text = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }] });
const json = (v: unknown): CallToolResult => text(JSON.stringify(v, null, 2));

/**
 * Build the tool list around a ctx accessor. The module keeps ctx in module scope (set by
 * init) and passes `() => requireCtx(ctx)`, so a call before init fails MODULE_NOT_INITIALIZED.
 */
export function createPeerAssessmentTools(getCtx: () => ModuleContext): ModuleTool[] {
const buildImportTool: ModuleTool = {
  schema: {
    name: 'build_peerassessment_import',
    description:
      'Build the PeerAssessment.com student/group import CSV (Team,Login ID,Email,First Name,Last Name,' +
      'Student ID #) from a Canvas group set. Reads groups + members live from Canvas; fills Login ID / ' +
      'Student ID # from your PeopleSoft export (via the roster vault) when your Canvas token withholds ' +
      'them. Returns a pre-upload report (incomplete rows, ungrouped students, duplicate emails). Pass ' +
      'dryRun:true to validate without writing. Writes only a local CSV you upload yourself — never to ' +
      'Canvas or the vault.',
    inputSchema: {
      type: 'object' as const,
      required: ['courseId', 'groupSetName'],
      properties: {
        courseId: { type: 'string', description: 'Canvas course id.' },
        groupSetName: { type: 'string', description: 'Exact name of the Canvas group set (category) to read.' },
        peopleSoftFile: { type: 'string', description: 'Path to the PeopleSoft export CSV (ID backstop). Optional.' },
        outputDir: { type: 'string', description: 'Directory for the CSV (default: the peerassessment folder in the module config dir).' },
        dryRun: { type: 'boolean', description: 'When true, return the report only; write no file.' },
      },
    },
  },
  handler: async (args) => {
    const a = args as {
      courseId: string; groupSetName: string; peopleSoftFile?: string; outputDir?: string; dryRun?: boolean;
    };
    const ctx = getCtx(); // throws MODULE_NOT_INITIALIZED before init
    try {
      const canvas = new PaCanvasClient(await ctx.credentials.get('canvas'));
      const groups = await canvas.readGroupSet(Number(a.courseId), a.groupSetName);
      const allStudents = await canvas.listCourseStudents(Number(a.courseId));
      const report = buildPeerAssessmentImport({
        courseId: a.courseId,
        groupSetName: a.groupSetName,
        groups,
        allStudents,
        sources: { vaultIndex: buildVaultIndex(ctx.paths.secrets), peopleSoftIndex: loadPeopleSoftIndex(ctx.paths.secrets, a.peopleSoftFile) },
        outputDir: a.outputDir ?? peerAssessmentDir(ctx.paths.config),
        dryRun: a.dryRun,
      });
      return json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({
        error: 'BUILD_FAILED',
        message,
        fix: 'Verify the course id and the exact group-set name, that Canvas is configured (setup_canvas), ' +
          'that the roster vault is readable, and that any peopleSoftFile path + remembered column mapping are valid.',
      });
    }
  },
};

return [buildImportTool];
}
