# DESIGN.md Overview

> **Parent:** [README](../README.md) | **Related:** [DESIGN.md File Structure](./DESIGN-MD-File-Structure.md), [DESIGN.md Canvas Template](./DESIGN-MD-Canvas-Template.md), [AI agent guidance in the Canvas template](./DESIGN-MD-Canvas-Template.md)
>
> **Official Resources:**
> - [GitHub Repo (google-labs-code/design.md)](https://github.com/google-labs-code/design.md)
> - [Google Blog Announcement](https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-design-md/)
> - [Google Stitch Tool](https://stitch.withgoogle.com/)
> - [Full Spec (docs/spec.md)](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)

---

## What Is DESIGN.md?

DESIGN.md is an open-source file format (Apache 2.0, released April 21, 2026) created by Google Labs and incubated in the Stitch AI design tool. It is a **portable design system specification** — a single Markdown file that describes your visual identity to both humans and AI agents.

The best analogy: **DESIGN.md is to design what AGENTS.md (or CLAUDE.md) is to code conventions.** It gives AI coding agents persistent, structured context about your brand — so they don't start from generic defaults every time.

---

## Why It Matters for Canvas Design

Without DESIGN.md, every time you ask an AI to generate Canvas HTML, you explain your colors, fonts, and design rules from scratch. With DESIGN.md:

- **Consistent output** — AI agents produce HTML that matches your brand every time
- **WCAG validation** — The CLI linter checks color contrast ratios automatically
- **Versionable** — Track design system changes in Git (or Obsidian)
- **Shareable** — Hand the file to any AI tool or team member

---

## The Two-Part Structure

A DESIGN.md file has two parts:

### Part 1: YAML Front Matter (machine-readable tokens)

```yaml
---
name: Boise State ITM
colors:
  primary: "#0033A0"        # BSU blue
  secondary: "#D64309"      # BSU orange
  neutral: "#F5F5F5"
  text: "#1A1A1A"
typography:
  h2:
    fontFamily: Lato
    fontSize: 1.75rem
  body:
    fontFamily: Lato
    fontSize: 1rem
rounded:
  sm: 4px
  md: 8px
  lg: 12px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
---
```

### Part 2: Markdown Prose (human-readable rationale)

```markdown
## Overview

Professional but approachable academic design. Content-forward with clear
visual hierarchy. Designed for adult learners who are busy and goal-oriented.

## Colors

Primary Boise State Blue (#0033A0) anchors headings, hero banners, and
primary actions. Secondary Orange (#D64309) is used sparingly — only for
call-to-action elements and important alerts, never for decorative purposes.

## Typography

All Canvas pages use Lato (loaded by the BSU Canvas theme). Heading scale
starts at H2 (Canvas reserves H1 for the page title). Minimum body text is
16px for readability.

## Components

Cards use a 1px neutral border with 8px border-radius. Background is white on
a light gray (#F5F5F5) page background. Never use box-shadow (not allowed by
Canvas RCE sanitizer).
```

---

## What AI Agents Do With It

When an AI agent reads a DESIGN.md:
1. It extracts exact color values from YAML tokens — no guessing
2. It reads the prose rationale — "why" primary blue is used vs. secondary orange
3. It applies component rules — "cards use 8px border-radius with 1px border"
4. It validates against WCAG — knows that `#0033A0` text on white has sufficient contrast

The result is generated HTML that matches your brand **without correction loops**.

---

## Alpha Status

> ⚠️ The DESIGN.md spec is in **alpha**. The format, section names, and CLI are under active development. Review the spec periodically and update your DESIGN.md files accordingly.

Current version: April 2026 open-source release
License: Apache 2.0
Contributions: Accepted via GitHub

---

## See Also

- [DESIGN.md File Structure](./DESIGN-MD-File-Structure.md) — Section-by-section anatomy of the spec
- [DESIGN.md Canvas Template](./DESIGN-MD-Canvas-Template.md) — Ready-to-use DESIGN.md for Canvas courses
- [DESIGN.md Toolchain](./DESIGN-MD-Toolchain.md) — CLI validation, linting, and export
- [AI agent guidance in the Canvas template](./DESIGN-MD-Canvas-Template.md) — Using DESIGN.md as AI agent context
