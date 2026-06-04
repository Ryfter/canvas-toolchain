import { createHash } from 'node:crypto';

/** SHA-256 hex digest of a UTF-8 string. Used throughout V&R for content-hash
 *  comparisons (prior vs new widget HTML, prior vs new page HTML). SHA-256
 *  picked over the cheaper MD5/SHA-1 per spec Decisions log — collision risk
 *  for educational content is irrelevant in practice, but using a modern hash
 *  avoids ever having to revisit it. */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}
