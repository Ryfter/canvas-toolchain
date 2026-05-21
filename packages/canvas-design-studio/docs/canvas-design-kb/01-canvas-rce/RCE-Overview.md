# RCE Overview — Canvas Rich Content Editor

> **Parent:** [README](../README.md) | **Related:** [HTML Allowlist](./HTML-Allowlist.md), [CSS Inline Strategy](./CSS-Inline-Strategy.md), [RCE Limitations And Workarounds](./RCE-Limitations-and-Workarounds.md)

---

## What Is the RCE?

The Canvas Rich Content Editor (RCE) is the WYSIWYG editor used across all content-bearing areas of Canvas: Pages, Assignments, Discussions, Announcements, Quiz instructions, and the Syllabus. It is powered by **TinyMCE** (a widely-used open-source editor), with significant customization and sanitization applied by Instructure on top.

**Official Guide:** [How do I use the HTML view in the Rich Content Editor?](https://community.instructure.com/t5/Canvas-Basics-Guide/How-do-I-use-the-HTML-view-in-the-Rich-Content-Editor/ta-p/618225)

---

## Accessing HTML Mode

To edit raw HTML in any RCE area:

1. Enter edit mode on the page, assignment, etc.
2. Click the `</>` icon in the toolbar (far right of the RCE toolbar, or in the "more options" overflow)
3. The editor switches to a code view showing the raw HTML
4. Paste or write HTML directly
5. Click `</>` again (or the visual editor button) to return to WYSIWYG

> ⚠️ **Critical:** Canvas sanitizes HTML **on the server side when you save**, not just in preview. If a tag or property isn't on the allowlist, it will be stripped silently.

---

## What the RCE Does to Your HTML

When you save content, Canvas runs it through a **server-side sanitizer** (based on the Ruby `sanitize` gem). The sanitizer:

- Keeps all tags on the [HTML Allowlist](./HTML-Allowlist.md)
- Strips tags not on the allowlist entirely (content may be preserved as plain text or removed)
- Keeps inline `style=""` attributes, but only for CSS properties on the allowlist
- Strips `<style>` block tags entirely
- Strips `<script>` tags entirely
- Strips event attributes (`onclick`, `onload`, etc.)
- Strips JavaScript `href` values (`href="javascript:..."`)

The sanitization runs **again** any time content is re-saved through the API or copied between courses.

---

## RCE Toolbar Capabilities (Visual Mode)

The default RCE toolbar includes:
- Text formatting: bold, italic, underline, strikethrough
- Paragraph styles: heading levels (H2–H6), blockquote, paragraph
- Lists: ordered, unordered
- Alignment: left, center, right
- Links: internal course links, external URLs
- Media: images (via Files), video/audio (via Canvas Studio or external URL)
- Tables: basic table builder
- Accessibility checker (built-in since Canvas 2021)
- Math equations (LaTex via MathJax)
- Instructor preview

---

## Where the RCE Appears

| Canvas Area | RCE Available? | Notes |
|---|---|---|
| Pages | ✅ Full | Most flexible content area |
| Assignments | ✅ Full | Instructions field only; grades/rubrics separate |
| Discussions | ✅ Full | Prompt/description field |
| Announcements | ✅ Full | Body content |
| Syllabus | ✅ Partial | Description field only |
| Quiz instructions | ✅ Full | Classic Quizzes only |
| New Quizzes | ⚠️ Limited | Different editor; some HTML may not transfer |
| Module item text headers | ❌ Plain text | No HTML allowed |

---

## Mobile Behavior

Canvas mobile apps (Student and Teacher) render RCE HTML content but:
- Do not support interactive JavaScript behaviors
- May render complex CSS layouts differently
- Iframes may not render or may show limited functionality

Design principle: **mobile-first fallback** — ensure content is readable even if complex layout collapses.

---

## See Also

- [HTML Allowlist](./HTML-Allowlist.md) — Complete list of allowed tags and CSS properties
- [CSS Inline Strategy](./CSS-Inline-Strategy.md) — How to write CSS that survives sanitization
- [Canvas Page Types](./Canvas-Page-Types.md) — Differences between Pages, Assignments, etc.
- [RCE Limitations And Workarounds](./RCE-Limitations-and-Workarounds.md) — Known limitations and practical solutions
