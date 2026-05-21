# Contributing to This KB

> **Parent:** [README](../README.md) | **Related:** [KB Overview](./KB-Overview.md), [Changelog](./Changelog.md)

---

## How to Add Notes

### Adding a New Pattern

1. Create a new file in `05-patterns/` named descriptively: `Assignment-Page.md`, `Reading-Page.md`, etc.
2. Include the standard front matter: `> **Parent:** [README](../README.md) | **Related:** ...`
3. Add the anatomy, full HTML template, and customization checklist
4. Link from [README](../README.md) in the appropriate section
5. Add to [Changelog](./Changelog.md)

### Adding a New Component to the Library

1. Open [Component Library](../03-design-systems/Component-Library.md)
2. Add a numbered section with the component name
3. Include the ready-to-paste HTML
4. Add a note about any Canvas-specific gotchas
5. Update [Changelog](./Changelog.md)

### Updating an Existing Note

When Canvas changes behavior or a tool releases a new version:
1. Update the relevant file(s)
2. Add a dated entry to [Changelog](./Changelog.md)
3. If a link has changed, update the URL and note the change

---

## Formatting Conventions

- **Parent link** at top of every file
- **Related** links to closely connected files
- **Source** links to external authoritative references
- **⚠️** for warnings or "use with caution" notes
- **✅/❌** for allowed/not-allowed comparisons
- HTML code blocks use triple backticks with `html` language tag
- Inline code uses single backticks for HTML tags and CSS properties

---

## What to Check Before Publishing a Pattern

- [ ] All HTML tested in Canvas RCE (paste into HTML view, save, verify nothing stripped)
- [ ] Checked in student view
- [ ] Tested on mobile (or Canvas mobile app)
- [ ] Color contrast checked against WCAG AA
- [ ] Heading hierarchy correct (H2 → H3 → H4)
- [ ] All images have `alt` attributes
- [ ] Links have descriptive text

---

*[KB Overview](./KB-Overview.md) | [Changelog](./Changelog.md)*
