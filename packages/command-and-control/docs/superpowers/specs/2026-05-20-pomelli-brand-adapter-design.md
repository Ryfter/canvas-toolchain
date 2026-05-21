# Pomelli BrandAdapter — Design

**Status:** Draft (2026-05-20) — needs review
**Repo:** `D:\Dev\Command-and-Control-MCP` (adapter lives in C&C; results feed into theme registry)
**Size:** Small
**Depends on:** Template/theme library (spec #2), Registry mechanism (spec #8)

---

## 1. Problem

Generating a coherent visual identity for a course (or institution) is tedious. The professor needs colors, typography, image style, and brand voice — all consistent with their institution. Doing this by hand is slow; asking a generic LLM gets generic results. Pomelli (Google Labs) generates brand kits from a URL or brand description: colors, typography hints, image style descriptors, voice tone. We want to plug Pomelli (or any equivalent service) into the template/theme library as a `BrandAdapter`.

## 2. Goals

1. A `BrandAdapter` interface that any brand-generation service can implement.
2. A `PomelliAdapter` implementation (when Pomelli API access is available).
3. Output maps directly onto a theme manifest: a Pomelli result becomes a new entry in the local theme registry.
4. The adapter is optional. The system works without it; Pomelli just accelerates theme creation.
5. Caching: brand kits don't change often; one fetch lasts for a long time.

## 3. Non-goals

- Bypassing the template/theme registry. Pomelli output goes through the same `theme/<id>@<version>/` structure as hand-authored themes.
- Image generation (separate concern; covered in template/theme library spec under image strategy).
- Multi-brand management. One brand per call.

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ BrandAdapter interface                                       │
│   generateBrandKit(input) → BrandKit                         │
│     ├── PomelliAdapter                                       │
│     ├── (future) other branding service adapters             │
│     └── ManualAdapter (passthrough for user-provided)        │
└──────────────────────────────────────────────────────────────┘
                                │
                                ▼
              ┌─────────────────────────────────┐
              │  BrandKit → theme.json mapping   │
              │  (small transformation step)     │
              └─────────────────────────────────┘
                                │
                                ▼
              ┌─────────────────────────────────┐
              │  theme/<id>@<version>/ in       │
              │  local registry                  │
              └─────────────────────────────────┘
```

## 5. Interface

```typescript
// src/brand/brand_adapter.ts
export interface BrandKitInput {
  /** A URL the adapter can crawl for brand context, OR a description. One required. */
  url?: string;
  description?: string;
  /** Audience hints to bias style choices. */
  audience?: 'k12' | 'undergrad' | 'graduate' | 'professional';
  /** Optional preferred mood. */
  mood?: 'formal' | 'playful' | 'editorial' | 'technical';
}

export interface BrandKit {
  /** Canonical name for this kit (used as theme id seed). */
  name: string;
  /** Color palette. */
  colors: {
    primary: string;     // hex
    accent: string;
    background: string;
    text: string;
    muted: string;
  };
  /** Typography hints — string CSS font stacks; no font files. */
  typography: {
    headingFontStack: string;
    bodyFontStack: string;
    headingWeight: string;
    bodyWeight: string;
  };
  /** Image style descriptors that prompt-first imagery will incorporate. */
  imageStyle: {
    descriptor: string;       // "Editorial photography with warm tones..."
    avoid: string[];          // ["stock photography", "AI-generated faces"]
  };
  /** Voice descriptors that feed into prompt-set generation. */
  voice: {
    tone: string;             // "Direct, slightly playful"
    formality: 'casual' | 'mixed' | 'formal';
    avoid: string[];          // ["jargon", "hedging language"]
  };
  /** Provenance for debugging. */
  source: { adapter: string; rawInput: BrandKitInput; fetchedAt: string };
}

export interface BrandAdapter {
  generateBrandKit(input: BrandKitInput): Promise<BrandKit>;
}
```

## 6. PomelliAdapter

When Pomelli API access exists:

```typescript
// src/brand/pomelli_adapter.ts
export class PomelliAdapter implements BrandAdapter {
  constructor(private readonly apiKey: string) {}

  async generateBrandKit(input: BrandKitInput): Promise<BrandKit> {
    // POST to Pomelli endpoint with url or description
    // Map Pomelli's response shape onto BrandKit
    // Cache by (input.url ?? input.description) hash for 30 days
  }
}
```

**Today's reality:** Pomelli is a Google Labs product without a publicly documented programmatic API as of this writing. The adapter is designed against the public product surface and may need to swap to whatever interface Google exposes (REST endpoint, OAuth, GCP project, etc.). The interface above is provider-shape; PomelliAdapter is one implementation.

If no API exists yet, `PomelliAdapter` falls back to user-paste mode: returns a structured prompt for the professor to paste into Pomelli's UI, then accepts the JSON response back via `submitPomelliResponse({json})`. This keeps the workflow useful even without an API.

## 7. ManualAdapter

```typescript
// src/brand/manual_adapter.ts
export class ManualAdapter implements BrandAdapter {
  async generateBrandKit(input: { kit: Partial<BrandKit> }): Promise<BrandKit> {
    // Validate and fill defaults
    // Used when the professor pastes a kit from any source
  }
}
```

Lets a professor use a kit they generated elsewhere (Pomelli's UI, manual design work, a different tool) without needing an adapter for that source.

## 8. BrandKit → theme.json mapping

The mapping is mostly 1:1:

```typescript
function brandKitToTheme(kit: BrandKit): Theme {
  return {
    schemaVersion: 1,
    colors: kit.colors,
    typography: kit.typography,
    slotStyles: defaultSlotStyles(kit),  // generate slot CSS using colors + typography
    globalCss: '',
    imageAssets: {},                     // empty — prompt-first
    /* slot imagePrompts derived from kit.imageStyle */
  };
}
```

The `defaultSlotStyles(kit)` helper generates baseline CSS for each known slot using the kit's colors and typography. This produces a working theme immediately; the professor can hand-edit the resulting `theme.json` for refinements.

**ImagePrompt construction:** for each slot that has imagery, the prompt is built from `kit.imageStyle.descriptor` + slot context (e.g., for `hero`: "Hero image for an assignment page on {{topic}}, in the style of {{descriptor}}, avoiding {{avoid}}").

## 9. C&C tool surface

```typescript
// New tools added to C&C MCP surface:
// - generate_brand_kit({ url?, description?, adapter? }) → BrandKit
// - install_brand_kit_as_theme({ kit, themeId, themeVersion }) → installed theme path
// - update_brand_kit_cache({ url? }) → re-fetch
```

Workflow:
1. Professor: "generate a brand kit from carthage.edu"
2. C&C calls `generate_brand_kit` → returns `BrandKit`
3. Professor reviews; optionally tweaks
4. Professor: "install this as theme 'carthage-default'"
5. C&C calls `install_brand_kit_as_theme` → writes to local registry
6. `update_course_materials` can now use `theme:carthage-default` for renders

## 10. Caching

Cache by hash of input (URL or description). TTL: 30 days. Cache lives at `~/.command-and-control/cache/brand-kits/<hash>.json`. `update_brand_kit_cache` forces a refresh.

## 11. Test plan

- Unit: `BrandKit → theme.json` mapping (input shape → expected theme structure).
- Unit: PomelliAdapter with mocked fetch (when API exists) — verify request shape, response parsing, cache behaviour.
- Unit: ManualAdapter validation — accept partial kits, fill defaults, reject malformed.
- Integration: `generate_brand_kit` + `install_brand_kit_as_theme` produces a valid theme in the local registry.

## 12. Open decisions for review

1. **Pomelli access path.** If/when Pomelli has a public API, swap the adapter implementation. Until then, ManualAdapter + structured-paste mode covers the workflow. Should we also add an `AnthropicBrandAdapter` that uses Claude to do the brand analysis from a URL? Less specialised than Pomelli but always-available. I think yes — gives a default that works today.

2. **Voice → prompt-set generation.** A BrandKit carries voice descriptors but those are theme-level. Should we ALSO auto-generate a matching prompt-set (`prompt/carthage-voice@1.0.0`) from the same kit? Probably yes — voice consistency matters more than visual consistency. Could be a separate tool `generate_prompt_set_from_brand_kit`.

3. **Image style descriptor — free-form or structured?** Currently `imageStyle.descriptor` is a string. Could decompose into `palette`, `composition`, `lighting`, `subjects`. Structured is more useful for downstream image gen prompts; free-form is what Pomelli probably outputs. I'd start free-form and add structured fields opportunistically.

## 13. Out of scope

- Image generation itself (separate adapter, image-source pluggable)
- Multi-brand inheritance ("course brand extends department brand extends institution brand")
- Brand validation against accessibility standards (contrast ratios, font legibility) — useful follow-up
