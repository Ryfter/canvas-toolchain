# DESIGN.md Toolchain

> **Parent:** [README](../README.md) | **Related:** [DESIGN.md Overview](./DESIGN-MD-Overview.md), [AI agent guidance in the Canvas template](./DESIGN-MD-Canvas-Template.md)
>
> **Source:** [GitHub: google-labs-code/design.md](https://github.com/google-labs-code/design.md)

---

## CLI Tool (@google/design.md)

The official CLI requires Node.js and runs via `npx` (no global install needed).

### Installation Check

```bash
npx @google/design.md --version
```

### Core Commands

#### Lint (Validate)

```bash
npx @google/design.md lint DESIGN.md
```

Validates:
- All required sections present
- Token references resolve (no broken `{colors.missing}` references)
- WCAG contrast ratios checked automatically
- Structural correctness

Returns structured JSON. Exit code 1 if errors found.

```bash
# JSON output for piping to other tools
npx @google/design.md lint --format json DESIGN.md

# Lint from stdin
cat DESIGN.md | npx @google/design.md lint -
```

**Example output:**
```json
{
  "findings": [
    {
      "severity": "warning",
      "path": "components.button-primary",
      "message": "textColor (#ffffff) on backgroundColor (#0F6E56) has contrast ratio 4.82:1 — passes WCAG AA."
    }
  ],
  "summary": { "errors": 0, "warnings": 1, "info": 0 }
}
```

#### Diff (Compare Versions)

```bash
npx @google/design.md diff DESIGN-v1.md DESIGN-v2.md
```

Shows added, removed, and modified tokens. Useful for:
- Tracking design system evolution
- Catching unintended regressions in CI/CD
- Reviewing institutional template updates

Exit code 1 if regressions detected (more errors/warnings in v2 than v1).

#### Export (Convert to Other Formats)

```bash
# Export to Tailwind CSS theme
npx @google/design.md export --format tailwind DESIGN.md > tailwind.theme.json

# Export to W3C DTCG format
npx @google/design.md export --format dtcg DESIGN.md > tokens.json
```

Supported export formats: `tailwind`, `dtcg` (W3C Design Token Community Group)

#### Spec (Print the Specification)

```bash
# Print full spec — useful to inject into AI agent context
npx @google/design.md spec

# Print just the rules
npx @google/design.md spec --rules

# Print rules as JSON
npx @google/design.md spec --rules-only --format json
```

This is particularly useful for AI agents: inject the spec output so the agent understands the DESIGN.md format itself, not just the contents of your specific file.

---

## The Eight Linter Rules

The CLI runs eight rules against your DESIGN.md:

1. **Required sections present** — `## Overview` and `## Colors` are mandatory
2. **Token references resolve** — `{colors.primary}` must point to a defined token
3. **No circular token references** — `A = B`, `B = A` is caught
4. **Color values are valid hex or named CSS colors**
5. **WCAG AA contrast** — text-on-background pairs are checked
6. **Typography font sizes are valid CSS values**
7. **Spacing values are valid CSS values**
8. **Component token values are valid (literals or references)**

---

## Generating DESIGN.md via Google Stitch

[Stitch](https://stitch.withgoogle.com/) can automatically generate a DESIGN.md from your visual system:

1. Go to stitch.withgoogle.com
2. Create a project or import existing design
3. Export → DESIGN.md
4. Customize the Canvas-specific `## Agents` section manually

The Stitch-generated file covers tokens well but won't know about Canvas RCE constraints — always add the `## Agents` section manually. See [DESIGN.md Canvas Template](./DESIGN-MD-Canvas-Template.md) for what to include.

---

## See Also

- [DESIGN.md Overview](./DESIGN-MD-Overview.md) — What DESIGN.md is
- [AI agent guidance in the Canvas template](./DESIGN-MD-Canvas-Template.md) — Using your DESIGN.md with Claude, Cursor, etc.
- [DESIGN.md Canvas Template](./DESIGN-MD-Canvas-Template.md) — Ready-to-use Canvas DESIGN.md

---

# DESIGN.md AI Integration

> **Related:** [DESIGN.md Overview](./DESIGN-MD-Overview.md), [DESIGN.md Toolchain](./DESIGN-MD-Toolchain.md)

---

## How to Use DESIGN.md as AI Context

### Option 1: Paste into System Prompt

For any AI chat interface, paste the full contents of your `DESIGN.md` at the start of your session or in the system prompt:

```
You are a Canvas LMS HTML designer. Here is my design system:

[paste DESIGN.md contents here]

Generate Canvas-ready HTML that strictly follows these design tokens and constraints.
All CSS must be inline. No <style> blocks. No <script> tags. Follow the constraints
in the ## Agents section exactly.
```

### Option 2: Reference File in Claude Code / Cursor

In Claude Code or Cursor, place `DESIGN.md` in your project root. The agent will automatically consult it for design decisions, similar to how `CLAUDE.md` works for code conventions.

### Option 3: Inject Spec + DESIGN.md for Maximum Clarity

```bash
# Get the spec
SPEC=$(npx @google/design.md spec)

# Combine with your DESIGN.md
echo "$SPEC" > agent-context.md
echo "---" >> agent-context.md
cat DESIGN.md >> agent-context.md
```

Paste `agent-context.md` into your AI tool's context. The agent now understands both the format and your specific values.

---

## Prompt Patterns for Canvas HTML Generation

### Course Home Page

```
Using my DESIGN.md design system, generate a Canvas-ready HTML course home page for
[Course Name]. Include:
- Hero banner with course title, semester tag, and two CTA buttons
- A callout box with current week information
- A 3-column feature card grid showing course capabilities
- A schedule section showing 3 weeks (past, current, upcoming) with status pills
- A 2-column section with learning objectives and upcoming deadlines
- A footer bar with office hours and contact info

Constraints: All CSS inline. No <style>. No <script>. Use only allowed Canvas
CSS properties. Wrap in a single <div> with max-width: 860px.
```

### Module Overview Page

```
Generate a Canvas module overview page using my design system. The module is
"Week 7: Data Visualization." Include:
- A section header with week number, module title, and completion estimate
- A learning objectives checklist (4 items)
- An activity grid with 3 cards: Lecture, Lab, Discussion
- A resources section with 3 linked items
- A deadline callout box

All CSS inline, no <style> or <script>.
```

### Callout Box Variants

```
Generate four callout box variants (info, success, warning, danger) using my
DESIGN.md component tokens. Each should have a bold label, 1–2 sentences of
placeholder text, and match the callout component specs exactly.
```

---

## Validation Loop

After AI generates HTML, validate it:

1. **Visually check** — does it match your DESIGN.md visual intent?
2. **CSS check** — run a quick scan for any disallowed properties (`box-shadow`, `filter`, etc.)
3. **Accessibility check** — heading hierarchy correct? All images have `alt`?
4. **Canvas paste test** — paste into Canvas RCE HTML view, save, and verify nothing was stripped

---

## See Also

- [DESIGN.md Canvas Template](./DESIGN-MD-Canvas-Template.md) — The DESIGN.md file to feed to agents
- [Course Home Page](../05-patterns/Course-Home-Page.md) — Page pattern with full HTML example
- [Accessibility Overview](../06-accessibility/Accessibility-Overview.md) — Validation checklist
