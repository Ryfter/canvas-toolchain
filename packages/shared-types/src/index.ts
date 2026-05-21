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

// ── Brand kits ────────────────────────────────────────────────────────────────

export interface BrandKitInput {
  /** A URL the adapter can crawl for brand context, OR a description. */
  url?: string;
  description?: string;
  /** Audience hints to bias style choices. */
  audience?: 'k12' | 'undergrad' | 'graduate' | 'professional';
  /** Optional preferred mood. */
  mood?: 'formal' | 'playful' | 'editorial' | 'technical';
  /** Manual or pasted kit payload for passthrough adapters. */
  kit?: Partial<BrandKit>;
}

export interface BrandKit {
  /** Canonical name for this kit, used as a theme id seed. */
  name: string;
  colors: {
    primary: string;
    accent: string;
    background: string;
    text: string;
    muted: string;
  };
  typography: {
    headingFontStack: string;
    bodyFontStack: string;
    headingWeight: string;
    bodyWeight: string;
  };
  imageStyle: {
    descriptor: string;
    avoid: string[];
  };
  voice: {
    tone: string;
    formality: 'casual' | 'mixed' | 'formal';
    avoid: string[];
  };
  source: {
    adapter: string;
    rawInput: BrandKitInput;
    fetchedAt: string;
  };
}
