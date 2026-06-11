# Canvas Design Studio — Visual Design Principles

## Visual Hierarchy
- Hero banner anchors the page: full-width, primary color, generous padding (48px top/bottom)
- H2 > H3 > H4 weight progression: 28px bold → 18px semibold → 15px semibold
- Most important content (assignment brief, weekly objectives) belongs in the first visible card
- Use size, weight, and color together — not independently — to signal importance

## Whitespace
- 24px margin between major sections
- 20–24px internal card padding
- 8px margin between inline elements (badges, pills)
- Dense pages read as overwhelming — breathing room is a design choice, not wasted space

## Color
- Primary (#0033A0 for University): hero banners, active states, primary buttons, section labels
- Secondary (#D64309 for University): accent arrows, pill badges, decorative borders only
- Neutral (#F4F3EF): page background; white (#ffffff): card backgrounds
- Semantic colors (info blue, success green, warning amber, danger red): status callouts only
- Maximum 6–7 distinct colors per page — more creates visual noise

## Typography
- Body text: 14–15px, line-height 1.65, color #1A1A1A
- Section labels: 11px, font-weight 700, letter-spacing 0.08em, text-transform uppercase
- Minimum font size: 13px — anything smaller is illegible on mobile
- Font family: Lato, sans-serif throughout — no @font-face or @import

## Components
- Cards (white bg, 1px #e0e0d8 border, 10px radius, 24px top/bottom + 20px left/right padding): structured content sections
- Callouts (3px colored left border, semantic bg, right-rounded corners): tips, warnings, key notes
- Tables (ic-Table class): comparative data only — never use tables for layout
- Avoid free-floating paragraphs without a card or section wrapper

## Canvas Constraints
- Max content width: 860px; effective column width ~680px with sidebar
- All CSS must be inline in style="" attributes — no <style> blocks
- Forbidden: box-shadow, gap, opacity, transform, transition, animation, filter
- No <h1> — Canvas reserves it for the page title; always start at H2
- Use col-xs-12 col-md-6 (or col-md-8/col-md-4) for responsive columns

## Content Prominence by Page Type
- **Assignment page**: brief in card 1 or 2; submission instructions visible without scrolling at 768px viewport
- **Week overview**: week number and objectives prominent; readings and tasks scannable in 30 seconds
- **Course home**: navigation-first layout; current week pinned to top
- **Syllabus**: clearly structured sections; grading table uses ic-Table class
