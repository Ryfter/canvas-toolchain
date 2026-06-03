/** CSS injected into every rendered widget's <style> block. Provides:
 *  - .sr-only visually-hidden pattern (for screen-reader-only content)
 *  - prefers-reduced-motion override (disables transitions/animations universally)
 *  - .touch-target utility (44×44px minimum hit area per spec.accessibility.minTouchTarget)
 *  - :focus-visible reset to ensure focus rings remain visible */
export const WRAPPER_A11Y_CSS = `
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.touch-target {
  min-width: 44px;
  min-height: 44px;
}
*:focus-visible {
  outline: 2px solid #0033A0;
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
  }
}
`.trim();

/** JS bootstrap injected into every widget's <script> block. Exposes a global
 *  __announce(text) helper that renderers call to update the screen-reader live
 *  region. Renderers MUST call __announce after every user-visible state change. */
export const WRAPPER_BOOTSTRAP_JS = `
window.__announce = function(text) {
  var el = document.getElementById('widget-status');
  if (el) { el.textContent = String(text); }
};
`.trim();

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render the visually-hidden live region seeded with the spec's screen-reader summary.
 *  Renderer JS updates this region via window.__announce() as state changes. */
export function SR_REGION_HTML(summary: string): string {
  return `<div class="sr-only" aria-live="polite" id="widget-status">${escapeHtml(summary)}</div>`;
}
