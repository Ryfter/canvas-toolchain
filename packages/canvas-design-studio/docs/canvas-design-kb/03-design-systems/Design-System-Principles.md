# Design System Principles for Canvas

Parent: [Canvas Design Knowledge Base](../README.md)
Related: [Color and Typography](Color-and-Typography.md), [Component Library](Component-Library.md)

---

## Why a Design System for Canvas?

Most Canvas courses look different from each other — and even inconsistent within the same course. A lightweight design system solves this by defining rules that are applied consistently. The payoff:

- Students spend less cognitive energy on navigation and more on learning
- Instructors can build pages faster once the patterns are established
- Copying a course to a new semester preserves professional quality
- Your DESIGN.md feeds an AI that generates compliant HTML automatically

---

## The Canvas Design System Hierarchy

```
Institution Level (Canvas Theme Editor — admin)
  └── Brand colors, global font, account-wide CSS classes

Course Level (your DESIGN.md + component library)
  └── Color palette, component patterns, page templates

Page Level (individual HTML in RCE)
  └── Specific content using system components
```

This KB primarily covers the **Course Level** layer.

---

## Five Principles

### 1. Consistency Over Novelty

Use the same card pattern on every page. Use the same callout style for warnings everywhere. Novelty surprises users; consistency builds trust and reduces cognitive load.

> The goal isn't to look impressive — it's to help students find and understand content quickly.

### 2. Content First

Design should serve content, not compete with it. A well-structured heading hierarchy with plain paragraphs beats a flashy layout that obscures the learning objectives.

### 3. Work Within Canvas Constraints

Fighting Canvas's sanitizer wastes time. Design within the allowed properties. When you need more, work with your admin to extend via Theme Editor.

### 4. Mobile as a Real Use Case

University students frequently access Canvas on phones. Any layout that doesn't degrade gracefully to single-column is broken for a significant portion of your students.

### 5. Accessibility Is Non-Negotiable

WCAG 2.1 AA compliance isn't optional at most institutions. Color contrast, heading hierarchy, and alt text should be checked before publishing, not treated as optional polish.

---

## What Makes a Canvas Design System

At minimum, a Canvas design system for a course includes:

| Element | Defined in |
|---|---|
| Color palette | [DESIGN.md Canvas Template](../02-design-md/DESIGN-MD-Canvas-Template.md) |
| Typography scale | [Color and Typography](Color-and-Typography.md) |
| Spacing system | [DESIGN.md Canvas Template](../02-design-md/DESIGN-MD-Canvas-Template.md) |
| Component library | [Component Library](Component-Library.md) |
| Page templates | [Course Home Page](../05-patterns/Course-Home-Page.md) |
| Accessibility rules | [Accessibility Overview](../06-accessibility/Accessibility-Overview.md) |
| Canvas constraints | [HTML Allowlist](../01-canvas-rce/HTML-Allowlist.md) |

---

## Lightweight vs. Full System

For individual instructors, a lightweight system is realistic:
- 2–3 colors (primary, neutral, text)
- 1 callout pattern (reuse for all info/warnings)
- 1 card pattern
- 1 hero banner style
- Consistent heading use (H2 → H3 → H4)

For instructional design teams managing multiple courses, a full system makes sense:
- Complete DESIGN.md with all tokens
- Shared template library or course shell
- Institution-approved Theme Editor classes, if available
- Documented update process

---

## See Also

- [DESIGN.md Overview](../02-design-md/DESIGN-MD-Overview.md) - how to formalize your system as a DESIGN.md
- [Color and Typography](Color-and-Typography.md) - palette and font guidance
- [Component Library](Component-Library.md) - ready-to-use HTML components
