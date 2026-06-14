import { homedir } from 'node:os';
import { join } from 'node:path';

/** Resolve the C&C home dir, honoring CC_HOME (tests point this at a temp dir). */
export function ccHome(): string {
  return process.env.CC_HOME ?? join(homedir(), '.command-and-control');
}

/** Default directory for generated PeerAssessment import files. */
export function peerAssessmentDir(): string {
  return join(ccHome(), 'peerassessment');
}

/** Sanitized output file name for a course + group set. */
export function importCsvFileName(courseId: string, groupSetName: string): string {
  const safe = groupSetName.replace(/[^A-Za-z0-9._-]+/g, '-');
  return `peerassessment-import-${courseId}-${safe}.csv`;
}

/** Default full output path under CC_HOME. */
export function importCsvPath(courseId: string, groupSetName: string): string {
  return join(peerAssessmentDir(), importCsvFileName(courseId, groupSetName));
}
