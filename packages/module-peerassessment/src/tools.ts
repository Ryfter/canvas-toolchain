import type { ModuleTool } from '@canvas-toolchain/module-contract';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { PaCanvasClient, loadCanvasCreds } from './canvas/client.js';
import { buildVaultIndex } from './source/vault.js';
import { loadPeopleSoftIndex } from './source/peoplesoft.js';
import { buildPeerAssessmentImport } from './build.js';

const text = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }] });
const json = (v: unknown): CallToolResult => text(JSON.stringify(v, null, 2));

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
        outputDir: { type: 'string', description: 'Directory for the CSV (default under CC_HOME/peerassessment).' },
        dryRun: { type: 'boolean', description: 'When true, return the report only; write no file.' },
      },
    },
  },
  handler: async (args) => {
    const a = args as {
      courseId: string; groupSetName: string; peopleSoftFile?: string; outputDir?: string; dryRun?: boolean;
    };
    try {
      const canvas = new PaCanvasClient(loadCanvasCreds());
      const groups = await canvas.readGroupSet(Number(a.courseId), a.groupSetName);
      const allStudents = await canvas.listCourseStudents(Number(a.courseId));
      const report = buildPeerAssessmentImport({
        courseId: a.courseId,
        groupSetName: a.groupSetName,
        groups,
        allStudents,
        sources: { vaultIndex: buildVaultIndex(), peopleSoftIndex: loadPeopleSoftIndex(a.peopleSoftFile) },
        outputDir: a.outputDir,
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

export const peerAssessmentTools: ModuleTool[] = [buildImportTool];
