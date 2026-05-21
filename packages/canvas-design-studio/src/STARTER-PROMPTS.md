# Starter Prompts for Canvas Design Studio

Copy these into a Claude Code session to get started fast.

---

## Generate a Course Home Page

```
Read docs/canvas-design-kb/05-patterns/Course-Home-Page.md and 
docs/canvas-design-kb/02-design-md/DESIGN-MD-Canvas-Template.md.

Generate a Canvas-ready home page for:
- Course: [COURSE NAME]
- Semester: [SEMESTER] 
- Current week: [WEEK NUMBER + TOPIC]
- Deadline in current week: [DATE]
- Feature cards: [3 TOPICS/CAPABILITIES]
- Instructor contact: [EMAIL]
- Office hours: [DAYS/TIMES]

Save the result to output/[course-code]-home.html
```

---

## Generate a Module Overview Page

```
Read docs/canvas-design-kb/03-design-systems/Component-Library.md.

Generate a Canvas module overview page for:
- Module: Week [N]: [TOPIC]
- Learning objectives: [3-4 objectives]
- Activities: Lecture, Lab, Discussion (or customize)
- Key reading/resource: [TITLE + URL]
- Lab due: [DATE]

Save to output/week-[N]-overview.html
```

---

## Generate a Callout Box Set

```
Read docs/canvas-design-kb/03-design-systems/Component-Library.md section 3.

Generate all four callout variants (info, success, warning, danger) with 
placeholder text relevant to [COURSE TOPIC]. Output as a single HTML snippet 
I can paste into Canvas.
```

---

## Generate a Week Schedule Section

```
Read docs/canvas-design-kb/03-design-systems/Component-Library.md section 5.

Generate a 4-week schedule section (weeks 12-15) for [COURSE NAME].
Week 12: [TOPIC] — complete
Week 13: [TOPIC] — complete  
Week 14: [TOPIC] — current, due [DATE]
Week 15: [TOPIC] — upcoming

Output as a standalone HTML snippet.
```

---

## Update the Design System Colors

```
Read DESIGN.md and CLAUDE.md.

Update the design system to use Boise State's official colors:
- Primary: #0033A0 (BSU Blue)
- Secondary: #D64309 (BSU Orange)
- Adjust any component tokens that reference primary colors.
- Update the corresponding values in CLAUDE.md Design Tokens section.
- Show me a before/after summary of what changed.
```

---

## Validate a Page for Canvas Compliance

```
Read docs/canvas-design-kb/01-canvas-rce/HTML-Allowlist.md and 
docs/canvas-design-kb/06-accessibility/Accessibility-Overview.md.

Review the HTML in [FILE PATH] and check:
1. Any disallowed CSS properties (box-shadow, filter, transform, etc.)
2. Any <style> blocks or <script> tags
3. Any <h1> elements in body content
4. Images missing alt attributes
5. Links with non-descriptive text
6. Heading hierarchy violations

Report issues with line references and suggested fixes.
```

---

## Add a New Pattern to the KB

```
I've built a useful [PATTERN TYPE] page. Here's the HTML: [PASTE HTML]

Create a new file docs/canvas-design-kb/05-patterns/[PATTERN-NAME].md 
following the format of docs/canvas-design-kb/05-patterns/Course-Home-Page.md.

Include: purpose, anatomy, full HTML template, and customization checklist.
Then add it to docs/canvas-design-kb/README.md and update the Changelog.
```
