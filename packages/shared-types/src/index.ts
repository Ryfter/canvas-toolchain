/**
 * Shared types for the Canvas Toolchain monorepo.
 *
 * These types are used across Curriculum Intelligence, Canvas Design Studio,
 * and Command & Control. Add types here when they need to be shared between
 * two or more packages.
 *
 * TODO (issue #2): migrate Verdict, TopicMap, BrandKit, slot vocabulary,
 * TrajectoryEntry, UpdateCourseMaterialsInput/Result here as each is
 * refactored. Start with Verdict since it's needed by both CI and C&C.
 */

// ── Verdict ──────────────────────────────────────────────────────────────────

export type Verdict = 'KEEP' | 'UPDATE' | 'DROP' | 'ADD';

export const VERDICTS: Verdict[] = ['KEEP', 'UPDATE', 'DROP', 'ADD'];

// ── Template slot vocabulary ──────────────────────────────────────────────────

export const CORE_SLOTS = [
  'hero',
  'intro',
  'body',
  'callout',
  'comparison',
  'examples',
  'objectives',
  'resources',
  'footer',
  'panopto',
] as const;

export type CoreSlot = typeof CORE_SLOTS[number];

/** Extension slot name — must start with 'x-' */
export type ExtensionSlot = `x-${string}`;

export type SlotName = CoreSlot | ExtensionSlot;

// ── Placeholders — to be migrated from individual packages ───────────────────
// See GitHub issue #2 for the full list of types to move here.
