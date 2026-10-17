import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './registry.mjs';

/**
 * The curated `related:` source data. It is hand-reviewed content, not generated
 * output, so it lives beside the generator rather than in the skills tree.
 *
 * A link is directed (`from` -> `to`) and adds `to` to the `related:` list of
 * `from`'s operation file. Unknown or duplicate ids are not rejected here: they
 * are reported by the `curated-link` lint rule, so a bad edit fails CI with a
 * readable message instead of a stack trace from the loader.
 */
export const CURATED_RELATED_PATH = join(REPO_ROOT, 'scripts/skills/data/related.json');

/** The repo-relative path the lint reports a curated-link violation against. */
export const CURATED_RELATED_FILE = 'scripts/skills/data/related.json';

/**
 * Turn the parsed data file into a `Map<from, to[]>`, which is what
 * `mergeRelated` consumes. Shape errors (a missing `reason`, a non-string id)
 * throw, because those are programming mistakes in the data file rather than
 * references that can be judged later.
 */
export function curatedRelatedFrom(data) {
  const links = data?.links;
  if (!Array.isArray(links)) throw new Error(`${CURATED_RELATED_FILE} must have a "links" array`);

  const byFrom = new Map();
  for (const [index, link] of links.entries()) {
    const { from, to, reason } = link ?? {};
    if (typeof from !== 'string' || !from || typeof to !== 'string' || !to || typeof reason !== 'string' || !reason) {
      throw new Error(`${CURATED_RELATED_FILE} links[${index}] needs non-empty string "from", "to", and "reason"`);
    }
    if (!byFrom.has(from)) byFrom.set(from, []);
    byFrom.get(from).push(to);
  }
  return { links, byFrom };
}

export function loadCuratedRelated(path = CURATED_RELATED_PATH) {
  return curatedRelatedFrom(JSON.parse(readFileSync(path, 'utf8')));
}
