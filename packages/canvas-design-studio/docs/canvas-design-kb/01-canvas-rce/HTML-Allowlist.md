# Canvas HTML Editor Allowlist

> **Parent:** [README](../README.md) | **Source:** [Instructure Community — Canvas HTML Editor Allowlist](https://community.instructure.com/en/kb/articles/387066-canvas-html-editor-allowlist) *(verify periodically — updated by Instructure)*
>
> **Related:** [RCE Overview](./RCE-Overview.md), [CSS Inline Strategy](./CSS-Inline-Strategy.md)

---

## Critical Rules

1. **All elements allow `style`, `class`, `id`, `title`, `role`, `lang`, `dir`** — these are the "global" attributes
2. **`<style>` blocks are stripped** — all CSS must be inline via the `style=""` attribute
3. **`<script>` is stripped** — no JavaScript via RCE
4. **Event attributes stripped** — `onclick`, `onload`, `oninput`, etc. are all removed
5. **Only specific CSS properties are allowed** in inline styles — see the allowed properties section below

---

## Allowed HTML Tags

```
a, acronym, address, area, article, aside, audio, b, bdo, big, blockquote, br,
caption, cite, code, col, colgroup, dd, del, details, dfn, div, dl, dt, em,
embed, footer, h2, h3, h4, h5, h6, header, hr, i, img, ins, iframe, kbd,
legend, li, map, nav, object, ol, p, param, picture, pre, q, ruby, rp, rt,
samp, section, small, span, strike, strong, sub, summary, sup, table, tbody,
td, tfoot, th, thead, time, tr, track, tt, u, ul, var, video
```

> ⚠️ **Note:** `<h1>` is NOT on the list. Canvas uses H1 for the page title. Use H2–H6 for content hierarchy.
>
> ⚠️ **Note:** `<figure>` and `<figcaption>` are not officially listed but may pass through. Do not rely on them.

---

## MathML Tags (Allowed)

```
annotation, annotation-xml, maction, maligngroup, malignmark, math, menclose,
merror, mfenced, mfrac, mglyph, mi, mlabeledtr, mlongdiv, mmultiscripts, mn,
mo, mover, mpadded, mphantom, mprescripts, mroot, mrow, ms, mscarries, mscarry,
msgroup, msline, mspace, msqrt, msrow, mstack, mstyle, msub, msubsup, msup,
mtable, mtd, mtext, mtr, munder, munderover, none, semantics, mark
```

---

## Allowed Attributes by Element

| Element | Additional Allowed Attributes |
|---|---|
| `a` | `href`, `target`, `name` |
| `abbr` | `title` |
| `area` | `alt`, `coords`, `href`, `shape`, `target` |
| `audio` | `name`, `src`, `muted`, `controls` |
| `blockquote` | `cite` |
| `col` | `span`, `width` |
| `colgroup` | `span`, `width` |
| `embed` | `name`, `src`, `type`, `allowfullscreen`, `pluginspage`, `wmode`, `allowscriptaccess`, `width`, `height` |
| `font` | `face`, `color`, `size` |
| `img` | `align`, `alt`, `height`, `src`, `title`, `usemap`, `width` |
| `iframe` | `src`, `width`, `height`, `name`, `align`, `allowfullscreen` |
| `map` | `name` |
| `object` | `width`, `height`, `style`, `data`, `type`, `classid`, `codebase` |
| `ol` | `start`, `type` |
| `param` | `name`, `value` |
| `q` | `cite` |
| `source` | `height`, `media`, `sizes`, `src`, `srcset`, `type`, `width` |
| `table` | `summary`, `width`, `border`, `cellpadding`, `cellspacing`, `center`, `frame`, `rules` |
| `tr` | `align`, `valign`, `dir` |
| `td` | `abbr`, `axis`, `colspan`, `rowspan`, `width`, `align`, `valign`, `dir` |
| `th` | `abbr`, `axis`, `colspan`, `rowspan`, `width`, `align`, `valign`, `dir`, `scope` |
| `ul` | `type` |
| `video` | `name`, `src`, `allowfullscreen`, `muted`, `poster`, `width`, `height`, `controls`, `playsinline` |

**ARIA attributes** (on all elements): `labelledby`, `atomic`, `busy`, `controls`, `describedby`, `disabled`, `dropeffect`, `flowto`, `grabbed`, `haspopup`, `hidden`, `invalid`, `label`, `labelledby`, `live`, `owns`, `relevant`, `autocomplete`, `checked`, `expanded`, `level`, `multiline`, `multiselectable`, `orientation`, `pressed`, `readonly`, `required`, `selected`, `sort`, `valuemax`, `valuemin`, `valuenow`, `valuetext`

---

## Allowed Protocols

| Context | Protocols |
|---|---|
| `a href`, `iframe src`, `embed src` | `ftp`, `http`, `https`, `mailto`, `skype` |
| `img src`, `object data`, `blockquote cite`, `q cite`, `style any` | `http`, `https` |

---

## Allowed CSS Style Properties (Inline Only)

These can be used in `style=""` attributes. All others are stripped.

```
background
border
border-radius
clear
color
cursor
direction
display
flex
float
font
grid
height
left
line-height
list-style
margin
max-height
max-width
min-height
min-width
overflow
overflow-x
overflow-y
padding
position
right
text-align
table-layout
text-decoration
text-indent
top
vertical-align
visibility
white-space
width
z-index
zoom
```

### Commonly Desired but NOT Allowed

| Property | Status | Workaround |
|---|---|---|
| `box-shadow` | ❌ Stripped | Use `border` for visual separation; or use account-level CSS |
| `border-radius` (complex) | ⚠️ Allowed as shorthand | Simple values work: `border-radius: 8px` |
| `filter` | ❌ Stripped | None in RCE |
| `transform` | ❌ Stripped | None in RCE |
| `transition` / `animation` | ❌ Stripped | None in RCE |
| `opacity` | ❌ Stripped | Use rgba colors for transparency |
| `background-image` (data URI) | ⚠️ Partial | Hosted image URLs work |
| `gap` (flexbox/grid) | ❌ Not listed | Use `margin` on child elements |
| `calc()` | ⚠️ Mixed | Some instances work, not reliable |

---

## Notes on `display`, `flex`, and `grid`

The allowlist includes `display`, `flex`, and `grid` as property names. This means:

- `display: flex` — **works**
- `display: grid` — **works**
- `flex: 1` shorthand — **works** (shorthand)
- `flex-direction`, `flex-wrap`, `align-items`, `justify-content` — **NOT listed individually** and may be stripped
- `grid-template-columns`, `grid-gap`, etc. — **NOT listed** and will be stripped

**Practical implication:** Use `display: flex` or `display: grid` for layout, but control spacing with `margin` and `padding` rather than `gap` or `grid-template-*`.

---

## Canvas Built-In CSS Classes (No Admin Required)

Beyond the allowlist, Canvas ships with its own internal stylesheet that exposes **reusable utility classes** you can reference in `class=""` attributes. These are NOT documented in the official allowlist but are widely used by the Canvas design community.

**Key classes:**

| Class | Effect |
|---|---|
| `border` | Applies a border |
| `border-trbl` | Border on all four sides |
| `border-round` | Rounds border corners |
| `content-box` | Wrapper for the responsive grid system |
| `grid-row` | Row container for grid columns |
| `col-xs-12` | Full width on all screens |
| `col-md-6` | Half width on medium+ screens |
| `col-md-4` | One-third width on medium+ screens |
| `col-md-3` | One-quarter width on medium+ screens |
| `ic-Table` | Canvas-styled table |
| `ic-Table--hover-row` | Table with hover highlight on rows |
| `ic-Table--striped` | Alternating row colors |

**Quick example — responsive 2-column layout:**
```html
<div class="content-box">
  <div class="grid-row">
    <div class="col-xs-12 col-md-6">Left column (full width on mobile)</div>
    <div class="col-xs-12 col-md-6">Right column</div>
  </div>
</div>
```

> Full documentation: [Canvas Built In CSS Classes](./Canvas-Built-In-CSS-Classes.md)

---

## See Also

- [CSS Inline Strategy](./CSS-Inline-Strategy.md) — How to write reliable inline CSS
- [Canvas Built In CSS Classes](./Canvas-Built-In-CSS-Classes.md) — Full reference for Canvas's built-in utility classes
- [RCE Limitations And Workarounds](./RCE-Limitations-and-Workarounds.md) — When allowlist isn't enough
- [Component Library](../03-design-systems/Component-Library.md) — Ready-to-use components built within these constraints
