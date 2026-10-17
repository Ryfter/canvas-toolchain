import type { DeprecatedReplacement, Deprecation } from './operation.js';

/**
 * The release the legacy setup ids disappear in — the one after the release
 * that ships them as warning wrappers.
 *
 * Deliberately pinned rather than derived from `package.json`. Deriving it makes
 * the promise move: a version bump would silently re-date every notice and every
 * generated skill file, so the wrappers could never actually expire. And at the
 * time of writing `package.json` is 2.3.0 with v2.3.0 already tagged, so "next
 * minor" would name 2.4.0 — the very release these wrappers ship in, leaving a
 * zero-release window instead of one more release.
 *
 * `tests/surface-deprecation.test.ts` restates this value and fails once the
 * package reaches it while any wrapper is still registered.
 */
export const LEGACY_SETUP_REMOVE_IN = '2.5.0';

/**
 * Build the deprecation record for a legacy operation.
 *
 * The wording is assembled here once. `marker` is what a listing shows next to
 * the id; `notice` adds the release the id goes away in and is what a call
 * returns and what the generated skill op file carries.
 */
export function deprecation(replacement: DeprecatedReplacement): Deprecation {
  const marker = `Deprecated — use ${replacement.tool} {action: "${replacement.action}"}`;
  return {
    replacement,
    removeIn: LEGACY_SETUP_REMOVE_IN,
    marker,
    notice: `${marker}; removed in ${LEGACY_SETUP_REMOVE_IN}.`,
  };
}
