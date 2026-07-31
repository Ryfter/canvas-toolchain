import { join } from 'node:path';
import { writeImportCsv } from './output.js';
import { importCsvPath, importCsvFileName } from './paths.js';
import { resolveMembers, type ResolveSources } from './join/resolve.js';
import { findIncomplete, findUngrouped, findDuplicateEmails, findMultiGrouped } from './report.js';
import type { PaGroup, PaCanvasUser, ImportReport } from './types.js';

const FERPA_NOTE =
  'PeerAssessment.com is institution-approved; this file contains student PII (name, email, login, student ID). Handle per FERPA.';

export interface BuildInput {
  courseId: string;
  groupSetName: string;
  groups: PaGroup[];
  allStudents: PaCanvasUser[];
  sources: ResolveSources;
  outputDir?: string;
  dryRun?: boolean;
}

/** Orchestrate: resolve rows -> validate -> (write unless dryRun/empty) -> report. Pure: no I/O beyond the CSV write. */
export function buildPeerAssessmentImport(input: BuildInput): ImportReport {
  const resolved = resolveMembers(input.groups, input.sources);
  const rows = resolved.map((r) => r.row);

  const warnings = [FERPA_NOTE];
  if (input.sources.peopleSoftIndex == null) {
    warnings.push('No PeopleSoft export supplied; Login ID / Student ID # rely on Canvas only and may be blank.');
  }

  let outputPath: string | null = null;
  let rowsWritten = 0;
  if (!input.dryRun && rows.length > 0) {
    const path = input.outputDir
      ? join(input.outputDir, importCsvFileName(input.courseId, input.groupSetName))
      : importCsvPath(input.courseId, input.groupSetName);
    outputPath = writeImportCsv(path, rows);
    rowsWritten = rows.length;
  }

  return {
    outputPath,
    rowsWritten,
    totalStudents: resolved.length,
    incomplete: findIncomplete(resolved),
    ungrouped: findUngrouped(input.allStudents, resolved),
    duplicateEmails: findDuplicateEmails(resolved),
    multiGrouped: findMultiGrouped(resolved),
    warnings,
  };
}
