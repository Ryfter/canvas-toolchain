# Template / Theme Library — Phase 1 (Local) Design

**Status:** Draft (2026-05-20) — needs review
**Repo:** `D:\Dev\Command-and-Control-MCP` (registry tooling) + content lives at `~/.command-and-control/registry/`
**Size:** Medium
**Depends on:** Registry mechanism (spec #8)
**Decisions verified in conversation:**
- Coupling: hybrid (decoupled resources, bundles available)
- Slots: fixed vocabulary with `x-*` extensions allowed
- Image strategy: prompt-first; optional pre-rendered asset

---

## 1. Problem

`update_course_materials` needs to generate Canvas pages that combine:
- A **structure** (where things go on the page)
- A **visual style** (how things look)
- **Generation instructions** (how the LLM fills the structure with brand-appropriate prose)

Today these are tangled together in CDS's `course-templates.ts` — one TypeScript file with a small fixed catalog. There's no way for a professor to install a new template, swap themes, or share their own. There's no separation between "comparison layout structure" and "business school visual identity" and "Kevin's voice when describing comparisons" — even though those three things vary independently in practice.

## 2. Goals

1. Three independently installable, independently versioned resource types: **templates**, **themes**, **prompts**.
2. Any template × any theme × any prompt-set produces a valid Canvas page (modulo unknown extension slots, which degrade gracefully).
3. **Bundles** as a convenience: a bundle pins compatible versions of a template + theme + prompt-set so casual users get a coherent look in one install.
4. Local-first storage under `~/.command-and-control/registry/`. Phase 2 ships these as GitHub-installable; data model designed for that today.
5. CDS's existing baked-in catalog migrates to this structure as the seed library.
6. Image-related theme content is **prompt-first** (the assumption is on-demand generation); pre-rendered assets are optional overrides.

## 3. Non-goals

- A web UI to browse the registry. Phase 1 is MCP-tool driven.
- Hosting infrastructure (covered in registry spec #8).
- Premium monetisation (covered in registry spec #8).
- Render pipeline implementation — that belongs in CDS's `update_course_materials` rewrite (spec #4). This spec defines the data model; the rewrite consumes it.

## 4. Architecture

```
                      ┌─────────────────────┐
                      │  C&C update_course_ │
                      │  materials rewrite  │
                      │  (consumer)         │
                      └──────────┬──────────┘
                                 │
                                 ▼
       ┌─────────────────────────────────────────────────┐
       │  Page recipe = template × theme × prompts        │
       │                       × content                   │
       │  ↓ render                                         │
       │  Canvas-safe HTML + image prompts to resolve      │
       └─────────────────────────────────────────────────┘
                                 ▲
                                 │
       ┌─────────────────────────┴───────────────────────┐
       │   Local registry (~/.command-and-control/        │
       │                    registry/)                    │
       │                                                  │
       │   ├── template/<id>@<version>/                   │
       │   │     manifest.json                            │
       │   │     structure.html                           │
       │   │     slots.json                               │
       │   │     preview.png (optional)                   │
       │   │                                              │
       │   ├── theme/<id>@<version>/                      │
       │   │     manifest.json                            │
       │   │     theme.json (colors, fonts, image prompts)│
       │   │     assets/ (optional pre-rendered images)   │
       │   │                                              │
       │   ├── prompt/<id>@<version>/                     │
       │   │     manifest.json                            │
       │   │     prompts.json (one per slot)              │
       │   │                                              │
       │   ├── bundle/<id>@<version>/                     │
       │   │     manifest.json (lists pinned deps)        │
       │   │                                              │
       │   └── index.json (what's installed)              │
       └──────────────────────────────────────────────────┘
```

## 5. Slot vocabulary (v1)

Controlled set. Every template uses one or more of these. Themes and prompts know how to handle each.

| Slot | Purpose | Theme styles | Prompt fills |
|---|---|---|---|
| `hero` | Top-of-page banner with title + optional image | Background colour/image, title typography | Page title, optional subtitle, hero image prompt |
| `intro` | Short framing paragraph(s) below hero | Body paragraph styles | 2-4 sentence orientation |
| `body` | Main content area | Default prose styles | Bulk content — usually the assignment / lesson body |
| `callout` | Highlighted box for "what's new", "watch out", etc. | Accent colour, border, icon | Single key message, 1-2 sentences |
| `comparison` | Side-by-side comparison block | Two-column layout styles | Two items + criteria for comparison |
| `examples` | Illustrative examples list | Card or list styles | 2-4 worked examples |
| `objectives` | Learning objectives bulleted list | Bullet styles | 3-5 objectives in "Students will be able to..." form |
| `resources` | Linked external resources | Link styles | Curated list of relevant external links |
| `footer` | Closing section (assignment due, instructor note) | Muted footer styles | Logistics: due date, submission format, contact |
| `panopto` | Embedded Panopto video (existing CDS pattern) | Iframe wrapper styles | Video ID + accessibility caption note |

**Extension slots:** `x-*` (e.g. `x-quiz`, `x-poll`, `x-widget`) for content that doesn't fit the controlled vocabulary. Themes and prompts MAY handle `x-*` slots; if absent, the render falls back to a generic "named content block" treatment.

## 6. Template schema

`template/<id>@<version>/manifest.json`:

```jsonc
{
  "schemaVersion": 1,
  "kind": "template",
  "id": "comparison-layout-academic",
  "version": "1.2.0",
  "name": "Side-by-side comparison (academic)",
  "description": "Two-column comparison with explicit criteria",
  "author": { "name": "Kevin Rank", "url": "..." },
  "license": "MIT",
  "tier": "free",
  "slots": ["hero", "intro", "comparison", "callout", "footer"],
  "extensionSlots": [],
  "files": ["structure.html", "slots.json", "preview.png"],
  "tags": ["comparison", "two-column"]
}
```

`structure.html` is the skeleton with `{{slot:hero}}`, `{{slot:comparison}}`, etc. placeholders. No styles, no content — just structural HTML.

`slots.json` documents per-slot constraints (max length, required fields):

```jsonc
{
  "hero": { "required": true, "fields": { "title": { "maxLength": 80 } } },
  "comparison": {
    "required": true,
    "fields": {
      "items": { "type": "array", "minItems": 2, "maxItems": 3 },
      "criteria": { "type": "array", "minItems": 2 }
    }
  }
}
```

## 7. Theme schema

`theme/<id>@<version>/manifest.json`:

```jsonc
{
  "schemaVersion": 1,
  "kind": "theme",
  "id": "ada-business-school",
  "version": "2.0.0",
  "name": "Ada Business School",
  "author": { "name": "..." },
  "tier": "free",
  "compatibleSlots": ["hero", "intro", "body", "callout", "comparison",
                      "examples", "objectives", "resources", "footer", "panopto"],
  "files": ["theme.json", "assets/"],
  "tags": ["business", "formal", "navy-and-gold"]
}
```

`theme.json` carries the actual style data:

```jsonc
{
  "schemaVersion": 1,
  "colors": {
    "primary": "#0a2540",
    "accent": "#c9a44d",
    "background": "#ffffff",
    "text": "#1a1a1a",
    "muted": "#6b6b6b"
  },
  "typography": {
    "headingFontStack": "Georgia, 'Times New Roman', serif",
    "bodyFontStack": "Lato, 'Helvetica Neue', sans-serif",
    "headingWeight": "600",
    "bodyWeight": "400"
  },
  "slotStyles": {
    "hero": {
      "css": "padding:40px 32px;background:linear-gradient(...)",
      "imagePrompt": "Editorial photograph for a business school lesson page: {{topic}}, clean composition, soft natural light, formal but inviting, in the palette of navy and gold."
    },
    "callout": {
      "css": "border-left:4px solid {{accent}};padding:16px 20px;background:rgba(...)",
      "iconHint": "info-circle"
    },
    "comparison": {
      "css": "display:grid;grid-template-columns:1fr 1fr;gap:24px"
    },
    "footer": {
      "css": "color:{{muted}};font-size:14px;border-top:1px solid #eee;padding-top:16px"
    }
  },
  "globalCss": "/* any baseline styles applied to all slots */",
  "imageAssets": {
    "hero": null
  }
}
```

**Image strategy (prompt-first, asset optional):**
- Every visual slot has an `imagePrompt` in its slot style. This is the default path: render the prompt with topic-aware substitutions and call an image generator.
- `theme.json#imageAssets` MAY override the prompt with a pre-rendered asset (URL relative to `assets/`). When `imageAssets.hero` is non-null, the renderer uses the asset and skips generation.
- Image prompts use `{{topic}}`, `{{semester}}`, and theme colour variables as templating placeholders.

## 8. Prompt-set schema

`prompt/<id>@<version>/manifest.json`:

```jsonc
{
  "schemaVersion": 1,
  "kind": "prompt",
  "id": "ranks-voice",
  "version": "1.0.0",
  "name": "Kevin Rank — professorial voice",
  "tier": "free",
  "slots": ["hero", "intro", "callout", "comparison", "examples", "objectives", "footer"],
  "files": ["prompts.json"]
}
```

`prompts.json`:

```jsonc
{
  "schemaVersion": 1,
  "hero": {
    "prompt": "Write a hero title for an assignment page on {{topic}}. Tone: direct, slightly playful, professionally curious. Max 12 words. Then a 1-sentence subtitle that orients the student to what they'll do, not what they'll learn.",
    "outputSchema": { "title": "string", "subtitle": "string" }
  },
  "intro": {
    "prompt": "Write 2-4 sentences orienting a student to {{topic}} at {{audience-level}}. ...",
    "outputSchema": { "html": "string" }
  },
  "comparison": {
    "prompt": "Compare {{itemA}} vs {{itemB}} across criteria {{criteria}}. Output a table-shaped JSON with one row per criterion and a 'verdict' field giving Kevin's actual opinion.",
    "outputSchema": { "rows": "array", "verdict": "string" }
  }
}
```

Prompt templating supports placeholders that the renderer substitutes from page content + course context.

## 9. Bundle schema

`bundle/<id>@<version>/manifest.json`:

```jsonc
{
  "schemaVersion": 1,
  "kind": "bundle",
  "id": "business-school-starter",
  "version": "1.0.0",
  "name": "Business school starter",
  "description": "Coherent template + theme + voice for business school courses",
  "tier": "free",
  "includes": [
    { "kind": "template", "id": "comparison-layout-academic", "version": "1.2.0" },
    { "kind": "template", "id": "case-study-deep-dive", "version": "1.0.0" },
    { "kind": "theme", "id": "ada-business-school", "version": "2.0.0" },
    { "kind": "prompt", "id": "ranks-voice", "version": "1.0.0" }
  ]
}
```

Installing a bundle triggers install of each `includes` entry. The bundle itself is also recorded in the local index so `uninstall_resource bundle:business-school-starter` removes the lot.

## 10. Render flow (informative; full impl in update_course_materials spec)

```
Given: pageContent (from CI brief), templateId, themeId, promptSetId

1. Load template (structure.html, slots.json)
2. Load theme (theme.json, assets/)
3. Load prompt-set (prompts.json)
4. For each slot in template.slots:
     a. Find prompt for slot in prompt-set
     b. Render prompt with placeholders (topic, content, audience)
     c. Call LlmClient with prompt → slot content
     d. Look up slot style in theme
     e. If slot has image:
          - If theme.imageAssets[slot] is set → use asset
          - Else render imagePrompt and call image generator (or queue for manual)
     f. Render slot HTML by combining style + content + image
5. Substitute slot HTML into template.structure.html placeholders
6. Apply globalCss
7. Pass result through CDS canvasSafeTransform()
8. Pass through auditAccessibility()
9. Return final HTML + any unresolved image prompts
```

Image-generation step is pluggable — same adapter pattern as `LlmClient` and `SearchClient`. Phase 1 may leave image prompts unrendered (return them in the result so the professor can paste them into ChatGPT or whatever). Auto-generation is a follow-up.

## 11. Local file layout

```
~/.command-and-control/registry/
├── index.json
├── template/
│   ├── comparison-layout-academic@1.2.0/
│   │   ├── manifest.json
│   │   ├── structure.html
│   │   ├── slots.json
│   │   └── preview.png
│   └── case-study-deep-dive@1.0.0/
├── theme/
│   ├── ada-business-school@2.0.0/
│   │   ├── manifest.json
│   │   ├── theme.json
│   │   └── assets/
│   └── ada-design-school@1.0.0/
├── prompt/
│   ├── ranks-voice@1.0.0/
│   │   ├── manifest.json
│   │   └── prompts.json
│   └── ada-house-voice@1.0.0/
└── bundle/
    └── business-school-starter@1.0.0/
        └── manifest.json
```

## 12. CDS migration

CDS currently has `src/tools/course-templates.ts` with a small hard-coded catalog. Migration path:

1. Extract each existing template's structure into a `template/<id>@<version>/` directory (default seed library shipped via free GitHub registry).
2. Extract any baked-in styling into a `theme/cds-default@1.0.0/` theme.
3. Extract baked-in prompt logic into a `prompt/cds-default@1.0.0/` prompt-set.
4. Bundle them as `bundle/cds-defaults@1.0.0/`.
5. CDS retains the catalog file as a thin compatibility shim that points at the bundle — existing callers don't break.

The migration is part of `update_course_materials` rewrite (spec #4), not this spec.

## 13. Test plan

- Unit: schema validators for each manifest kind.
- Unit: bundle installation order resolves dependencies correctly.
- Unit: extension slot `x-*` handling falls back gracefully when theme doesn't define a style.
- Unit: image strategy — when `imageAssets[slot]` is set, the renderer uses it; when null, returns the unrendered prompt.
- Integration: install a template + theme + prompt-set + bundle, verify directory layout.

## 14. Open decisions for review

1. **Is the slot vocabulary right?** I've proposed 10 slots. Likely candidates I left out: `tableOfContents`, `progress`, `quiz`, `discussion`. The first three are common; quiz/discussion may be better as `x-*` extensions since they have richer interaction semantics. Your call on additions.

2. **Should `slots.json` constraints be machine-enforced or advisory?** Strict enforcement (a `comparison` slot MUST have ≥2 items) catches errors but rejects edge cases. Advisory (warn but allow) is friendlier. I lean strict for required fields, advisory for max-length.

3. **Image generation provider — defer or design now?** This spec says "image generation is pluggable, phase 1 may leave prompts unrendered." We could spec the `ImageAdapter` interface now (Anthropic via Claude Sonnet's image support? OpenAI's image API? Replicate? Local Stable Diffusion?), or defer until update_course_materials needs it.

4. **Prompt templating engine — Handlebars-style `{{topic}}` or full JS expressions?** Simple substitution is enough for v1. Full expressions (`{{topic.toLowerCase()}}`) allow conditional logic but complicate the parser. I'd keep it simple.

5. **Theme inheritance.** Should a theme be able to extend another (e.g., "ada-business-school-dark extends ada-business-school")? Useful but adds complexity. Defer to v2 unless needed.

## 15. Out of scope

- Hosting infrastructure (covered in registry spec #8)
- Premium-tier theme packs
- A web UI for browsing
- Image generation implementation
- Theme inheritance (deferred)
- A graphical theme editor
