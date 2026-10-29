import { join } from 'node:path';

/** Default directory for generated PeerAssessment import files, under the host-provided config dir. */
export function peerAssessmentDir(configDir: string): string {
  return join(configDir, 'peerassessment');
}

/** Sanitized output file name for a course + group set. */
export function importCsvFileName(courseId: string, groupSetName: string): string {
  const safe = groupSetName.replace(/[^A-Za-z0-9._-]+/g, '-');
  return `peerassessment-import-${courseId}-${safe}.csv`;
}
