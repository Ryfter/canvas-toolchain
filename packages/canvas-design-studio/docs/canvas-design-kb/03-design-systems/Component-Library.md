# Component Library

> **Parent:** [README](../README.md) | **Related:** [HTML Allowlist](../01-canvas-rce/HTML-Allowlist.md), [CSS Inline Strategy](../01-canvas-rce/CSS-Inline-Strategy.md), [DESIGN.md Canvas Template](../02-design-md/DESIGN-MD-Canvas-Template.md)
>
> All components here use only Canvas-allowed HTML tags and CSS properties. All CSS is inline. Copy-paste ready.

---

## Variables Reference

When adapting these components, these are the design token values from [DESIGN.md Canvas Template](../02-design-md/DESIGN-MD-Canvas-Template.md):

| Token | Value |
|---|---|
| `--primary` | `#0F6E56` |
| `--primary-dark` | `#085041` |
| `--primary-light` | `#e1f5ee` |
| `--neutral` | `#F4F3EF` |
| `--neutral-dark` | `#e0e0d8` |
| `--text-primary` | `#1A1A1A` |
| `--text-secondary` | `#555550` |
| `--border-radius-lg` | `10px` |
| `--border-radius-xl` | `14px` |

---

## 1. Page Wrapper

Every Canvas page should start with this wrapper to constrain layout and set base typography:

```html
<div style="max-width: 860px; margin: 0 auto; font-family: Lato, sans-serif; color: #1A1A1A; line-height: 1.65;">

  <!-- All page content here -->

</div>
```

---

## 2. Hero Banner

Full-width banner for course home page or module landing page.

```html
<div style="background: linear-gradient(135deg, #085041 0%, #0F6E56 60%, #1D9E75 100%); border-radius: 14px; padding: 48px 48px 40px; margin-bottom: 28px; position: relative; overflow: hidden;">
  <span style="display: inline-block; background: rgba(255,255,255,0.18); color: #fff; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 12px; border-radius: 20px; margin-bottom: 14px;">Spring 2026 · ITM 370</span>
  <h2 style="font-family: Lato, sans-serif; font-size: 2rem; color: #fff; margin: 0 0 10px; line-height: 1.2;">AI Augmented Projects</h2>
  <p style="color: rgba(255,255,255,0.85); font-size: 15px; line-height: 1.65; max-width: 520px; margin: 0 0 24px;">Course description or welcome message goes here. Keep it to 2-3 sentences.</p>
  <a href="#" style="display: inline-block; background: #fff; color: #0F6E56; font-size: 13px; font-weight: 600; padding: 10px 22px; border-radius: 8px; text-decoration: none; margin-right: 10px;">View Modules</a>
  <a href="#" style="display: inline-block; border: 1.5px solid rgba(255,255,255,0.5); color: #fff; font-size: 13px; font-weight: 500; padding: 9px 22px; border-radius: 8px; text-decoration: none;">Syllabus</a>
</div>
```

> **Note:** `linear-gradient` uses the `background` property which is allowed. The gradient syntax works reliably in Canvas.

---

## 3. Callout Boxes (4 Variants)

### Info / Tip
```html
<div style="border-left: 3px solid #185FA5; background: #E6F1FB; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 16px;">
  <strong style="font-size: 13px; color: #0C447C; display: block; margin-bottom: 4px;">Info</strong>
  <span style="font-size: 14px; color: #185FA5; line-height: 1.6;">Your informational message goes here.</span>
</div>
```

### Success / Note
```html
<div style="border-left: 3px solid #3B6D11; background: #EAF3DE; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 16px;">
  <strong style="font-size: 13px; color: #27500A; display: block; margin-bottom: 4px;">Note</strong>
  <span style="font-size: 14px; color: #3B6D11; line-height: 1.6;">A positive note or confirmation goes here.</span>
</div>
```

### Warning
```html
<div style="border-left: 3px solid #854F0B; background: #FAEEDA; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 16px;">
  <strong style="font-size: 13px; color: #633806; display: block; margin-bottom: 4px;">⚠ Warning</strong>
  <span style="font-size: 14px; color: #854F0B; line-height: 1.6;">Important warning or caution goes here.</span>
</div>
```

### Deadline / Urgent
```html
<div style="border-left: 3px solid #A32D2D; background: #FCEBEB; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 16px;">
  <strong style="font-size: 13px; color: #791F1F; display: block; margin-bottom: 4px;">Deadline</strong>
  <span style="font-size: 14px; color: #A32D2D; line-height: 1.6;">Due <strong>Sunday at 11:59 PM</strong> — submit via Canvas Assignments.</span>
</div>
```

---

## 4. Card Grid

Three-column responsive card grid. Cards collapse gracefully via `flex-wrap`.

```html
<div style="display: flex; flex-wrap: wrap; margin-right: -14px; margin-bottom: 14px;">

  <div style="flex: 1; min-width: 220px; margin-right: 14px; margin-bottom: 14px; background: #fff; border: 1px solid #e0e0d8; border-radius: 10px; padding: 18px 20px;">
    <div style="width: 36px; height: 36px; border-radius: 8px; background: #e1f5ee; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; font-size: 16px;">🧠</div>
    <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 6px; color: #1A1A1A;">Card Title 1</h4>
    <p style="font-size: 13px; color: #666; line-height: 1.55; margin: 0;">Short description of this feature, topic, or item. 2–3 sentences max.</p>
    <a href="#" style="font-size: 12px; color: #0F6E56; font-weight: 500; display: inline-block; margin-top: 10px; text-decoration: none;">→ Learn more</a>
  </div>

  <div style="flex: 1; min-width: 220px; margin-right: 14px; margin-bottom: 14px; background: #fff; border: 1px solid #e0e0d8; border-radius: 10px; padding: 18px 20px;">
    <div style="width: 36px; height: 36px; border-radius: 8px; background: #E6F1FB; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; font-size: 16px;">🔗</div>
    <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 6px; color: #1A1A1A;">Card Title 2</h4>
    <p style="font-size: 13px; color: #666; line-height: 1.55; margin: 0;">Short description. Keep consistent length across cards for visual balance.</p>
    <a href="#" style="font-size: 12px; color: #0F6E56; font-weight: 500; display: inline-block; margin-top: 10px; text-decoration: none;">→ Learn more</a>
  </div>

  <div style="flex: 1; min-width: 220px; margin-right: 14px; margin-bottom: 14px; background: #fff; border: 1px solid #e0e0d8; border-radius: 10px; padding: 18px 20px;">
    <div style="width: 36px; height: 36px; border-radius: 8px; background: #FAEEDA; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; font-size: 16px;">📊</div>
    <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 6px; color: #1A1A1A;">Card Title 3</h4>
    <p style="font-size: 13px; color: #666; line-height: 1.55; margin: 0;">Short description. Adjust icon background color to vary visual rhythm.</p>
    <a href="#" style="font-size: 12px; color: #0F6E56; font-weight: 500; display: inline-block; margin-top: 10px; text-decoration: none;">→ Learn more</a>
  </div>

</div>
```

---

## 5. Week Row (Schedule Component)

Used for course schedule on the home page. Three states: complete, current, upcoming.

### Complete (Past Week)
```html
<div style="display: flex; border: 1px solid #e0e0d8; border-radius: 10px; overflow: hidden; margin-bottom: 12px;">
  <div style="background: #0F6E56; color: #fff; font-size: 10px; font-weight: 600; padding: 14px 12px; display: flex; align-items: center; justify-content: center; min-width: 48px; writing-mode: vertical-rl; transform: none; letter-spacing: 0.06em; text-transform: uppercase;">Wk 12</div>
  <div style="padding: 14px 18px; flex: 1; background: #fff;">
    <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 4px; color: #1A1A1A;">Prompt Engineering at Scale</h4>
    <p style="font-size: 13px; color: #666; margin: 0 0 8px; line-height: 1.5;">System prompts, chain-of-thought patterns, few-shot design, and output parsing.</p>
    <span style="font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 20px; background: #EAF3DE; color: #3B6D11;">✓ Complete</span>
    <span style="font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 20px; background: #E6F1FB; color: #185FA5; margin-left: 6px;">Lecture</span>
    <span style="font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 20px; background: #E6F1FB; color: #185FA5; margin-left: 6px;">Lab</span>
  </div>
</div>
```

### Current Week (Highlighted)
```html
<div style="display: flex; border: 2px solid #0F6E56; border-radius: 10px; overflow: hidden; margin-bottom: 12px;">
  <div style="background: #0F6E56; color: #fff; font-size: 10px; font-weight: 600; padding: 14px 12px; display: flex; align-items: center; justify-content: center; min-width: 48px; writing-mode: vertical-rl; letter-spacing: 0.06em; text-transform: uppercase;">Wk 14</div>
  <div style="padding: 14px 18px; flex: 1; background: #fff;">
    <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 4px; color: #1A1A1A;">Agentic Workflows ← <em style="color: #0F6E56;">Current</em></h4>
    <p style="font-size: 13px; color: #666; margin: 0 0 8px; line-height: 1.5;">Tool use, function calling, multi-agent coordination, and human-in-the-loop design.</p>
    <span style="font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 20px; background: #FCEBEB; color: #A32D2D;">Due Sun 11:59 PM</span>
    <span style="font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 20px; background: #E6F1FB; color: #185FA5; margin-left: 6px;">Lecture</span>
    <span style="font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 20px; background: #E6F1FB; color: #185FA5; margin-left: 6px;">Lab</span>
  </div>
</div>
```

### Upcoming Week (Muted)
```html
<div style="display: flex; border: 1px solid #e0e0d8; border-radius: 10px; overflow: hidden; margin-bottom: 12px;">
  <div style="background: #b4b2a9; color: #fff; font-size: 10px; font-weight: 600; padding: 14px 12px; display: flex; align-items: center; justify-content: center; min-width: 48px; writing-mode: vertical-rl; letter-spacing: 0.06em; text-transform: uppercase;">Wk 15</div>
  <div style="padding: 14px 18px; flex: 1; background: #fff;">
    <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 4px; color: #1A1A1A;">Capstone Presentations</h4>
    <p style="font-size: 13px; color: #666; margin: 0 0 8px; line-height: 1.5;">Final demos, peer review, and reflection on semester-long build.</p>
    <span style="font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 20px; background: #FAEEDA; color: #854F0B;">Upcoming</span>
    <span style="font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 20px; background: #E6F1FB; color: #185FA5; margin-left: 6px;">Presentation</span>
  </div>
</div>
```

---

## 6. Navigation Bar

Horizontal course navigation bar. Active link in primary color, others neutral.

```html
<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 24px;">
  <a href="#" style="font-size: 13px; font-weight: 600; padding: 7px 16px; border-radius: 7px; text-decoration: none; color: #fff; background: #0F6E56;">Home</a>
  <a href="#" style="font-size: 13px; font-weight: 500; padding: 7px 16px; border-radius: 7px; text-decoration: none; color: #444; background: #F4F3EF;">Modules</a>
  <a href="#" style="font-size: 13px; font-weight: 500; padding: 7px 16px; border-radius: 7px; text-decoration: none; color: #444; background: #F4F3EF;">Assignments</a>
  <a href="#" style="font-size: 13px; font-weight: 500; padding: 7px 16px; border-radius: 7px; text-decoration: none; color: #444; background: #F4F3EF;">Discussions</a>
  <a href="#" style="font-size: 13px; font-weight: 500; padding: 7px 16px; border-radius: 7px; text-decoration: none; color: #444; background: #F4F3EF;">Grades</a>
</div>
```

> **Note:** `gap` in a `flex` container is not reliably allowed. Use this pattern instead — remove the `gap: 6px` and add `margin-right: 6px` to each `<a>` if links are wrapping incorrectly.

---

## 7. Two-Column Split Layout

```html
<div style="display: flex; flex-wrap: wrap; margin-right: -14px; margin-bottom: 24px;">

  <!-- Left: Learning Objectives -->
  <div style="flex: 1; min-width: 240px; margin-right: 14px; margin-bottom: 14px; background: #fff; border: 1px solid #e0e0d8; border-radius: 10px; padding: 18px 20px;">
    <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 12px; color: #1A1A1A;">Learning Objectives</h4>
    <div style="display: flex; align-items: flex-start; margin-bottom: 10px;">
      <div style="width: 18px; height: 18px; border-radius: 50%; background: #0F6E56; flex-shrink: 0; margin-top: 1px; margin-right: 10px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; font-weight: bold;">✓</div>
      <span style="font-size: 13px; color: #444; line-height: 1.5;">Design AI harnesses for real business workflows</span>
    </div>
    <div style="display: flex; align-items: flex-start; margin-bottom: 10px;">
      <div style="width: 18px; height: 18px; border-radius: 50%; background: #0F6E56; flex-shrink: 0; margin-top: 1px; margin-right: 10px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; font-weight: bold;">✓</div>
      <span style="font-size: 13px; color: #444; line-height: 1.5;">Evaluate and select appropriate AI tools by use case</span>
    </div>
    <div style="display: flex; align-items: flex-start; margin-bottom: 0;">
      <div style="width: 18px; height: 18px; border-radius: 50%; background: #0F6E56; flex-shrink: 0; margin-top: 1px; margin-right: 10px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; font-weight: bold;">✓</div>
      <span style="font-size: 13px; color: #444; line-height: 1.5;">Build and deploy automation pipelines</span>
    </div>
  </div>

  <!-- Right: Deadlines -->
  <div style="flex: 1; min-width: 240px; margin-right: 14px; margin-bottom: 14px; background: #fff; border: 1px solid #e0e0d8; border-radius: 10px; padding: 18px 20px;">
    <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 12px; color: #1A1A1A;">Upcoming Deadlines</h4>
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0ea; font-size: 13px;">
      <span style="color: #333;">Lab 14 — Agents</span>
      <span style="color: #854F0B; font-weight: 500; font-size: 12px; background: #FAEEDA; padding: 3px 9px; border-radius: 20px;">Apr 27</span>
    </div>
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0ea; font-size: 13px;">
      <span style="color: #333;">Reflection 4</span>
      <span style="color: #854F0B; font-weight: 500; font-size: 12px; background: #FAEEDA; padding: 3px 9px; border-radius: 20px;">Apr 29</span>
    </div>
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; font-size: 13px;">
      <span style="color: #333;">Capstone Draft</span>
      <span style="color: #854F0B; font-weight: 500; font-size: 12px; background: #FAEEDA; padding: 3px 9px; border-radius: 20px;">May 3</span>
    </div>
  </div>

</div>
```

---

## 8. Footer Bar

```html
<div style="background: #085041; border-radius: 12px; padding: 20px 28px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-top: 8px;">
  <p style="color: rgba(255,255,255,0.75); font-size: 13px; margin: 0 16px 0 0;">Questions? Office hours Mon/Wed 2–3 pm · Zoom link in Canvas</p>
  <a href="mailto:you@institution.edu" style="color: #5DCAA5; font-size: 13px; font-weight: 500; text-decoration: none;">Email Prof. Name →</a>
</div>
```

---

## 9. Accordion (details/summary)

Native HTML5 — no JavaScript required. Canvas typically allows these tags even though they're not on the official allowlist.

```html
<details style="border: 1px solid #e0e0d8; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px;">
  <summary style="font-weight: 600; font-size: 14px; cursor: pointer; color: #1A1A1A; padding: 4px 0;">
    Week 3 — Supplemental Resources (click to expand)
  </summary>
  <div style="padding: 12px 0 4px;">
    <p style="font-size: 14px; color: #444; line-height: 1.6;">Content inside the accordion. Add links, text, or any allowed HTML here.</p>
  </div>
</details>
```

> ⚠️ Use with awareness — `<details>` is not on the official allowlist. Test before deploying.

---

## 10. Section Divider with Label

```html
<div style="margin: 28px 0 16px;">
  <p style="font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #0F6E56; margin: 0 0 6px;">Section Label</p>
  <h2 style="font-size: 1.5rem; font-weight: 600; margin: 0 0 4px; color: #1A1A1A;">Section Heading</h2>
  <p style="font-size: 14px; color: #666; margin: 0 0 16px;">Brief descriptor or tagline for this section.</p>
</div>
```

---

## 11. Styled Button Links

```html
<!-- Primary button -->
<a href="#" style="display: inline-block; background: #0F6E56; color: #ffffff; font-size: 13px; font-weight: 600; padding: 10px 22px; border-radius: 8px; text-decoration: none; margin-right: 10px;">Primary Action</a>

<!-- Secondary / ghost button -->
<a href="#" style="display: inline-block; border: 1.5px solid #0F6E56; color: #0F6E56; font-size: 13px; font-weight: 500; padding: 9px 22px; border-radius: 8px; text-decoration: none;">Secondary Action</a>

<!-- Danger / warning button -->
<a href="#" style="display: inline-block; background: #A32D2D; color: #ffffff; font-size: 13px; font-weight: 600; padding: 10px 22px; border-radius: 8px; text-decoration: none;">Urgent Action</a>
```

---

## See Also

- [HTML Allowlist](../01-canvas-rce/HTML-Allowlist.md) — What CSS properties can be used
- [CSS Inline Strategy](../01-canvas-rce/CSS-Inline-Strategy.md) — How inline CSS works in Canvas
- [Course Home Page](../05-patterns/Course-Home-Page.md) — Full assembled page using these components
- [Component Library callouts](./Component-Library.md) — More callout patterns
