# Canvas Page Types

Parent: [Canvas Design Knowledge Base](../README.md)
Related: [RCE Overview](RCE-Overview.md), [Course Home Page](../05-patterns/Course-Home-Page.md)

---

## Pages

The most flexible content type. Pages can be:
- The course home page
- Module overview pages
- Lecture notes / reading pages
- Resource hubs
- Any free-form content

Full RCE access. HTML view available. Any allowed tag and CSS property can be used.

**Course Link pattern:** `/courses/COURSE_ID/pages/page-url-slug`

---

## Assignments

The instructions field uses the full RCE. Same HTML capabilities as Pages. Design tip: use a clear header, a summary callout, and a rubric preview for best student experience.

**Note:** The "Title," "Points," "Due Date," and submission settings are Canvas UI — not editable via HTML.

---

## Discussions

The discussion prompt uses the full RCE. Good for: setting context with a designed banner, structured prompt with callout boxes, embedded resources.

---

## Announcements

RCE available in the body field. Design tip: use a dated "update" style with a brief bold title and clear action items.

---

## Syllabus

The Syllabus Description field uses the RCE. The auto-generated assignment calendar below it is Canvas-controlled and cannot be styled. Useful for: a top-of-syllabus designed header, instructor info card, key policies in callout boxes.

---

## Module Text Headers

These are plain text only: no HTML and no rich formatting. They appear as simple headers inside module item lists.

---

## See Also

- [RCE Overview](RCE-Overview.md) - how the editor works
- [HTML Allowlist](HTML-Allowlist.md) - what is allowed in any RCE area
- [Course Home Page](../05-patterns/Course-Home-Page.md) - current page-level pattern
