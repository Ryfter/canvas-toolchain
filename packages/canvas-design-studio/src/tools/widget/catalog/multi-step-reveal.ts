// packages/canvas-design-studio/src/tools/widget/catalog/multi-step-reveal.ts

import { z } from 'zod';
import type { Renderer, Result, InteractiveSpec } from '../types.js';

const Step = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

const MultiStepContent = z.object({
  steps: z.array(Step).min(1),
});

type MultiStepContent = z.infer<typeof MultiStepContent>;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const multiStepRevealRenderer: Renderer<MultiStepContent> = {
  kind: 'multi-step-reveal',
  contentSchema: MultiStepContent,

  validateContent(content): Result<MultiStepContent> {
    const parsed = MultiStepContent.safeParse(content);
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  },

  render(content, _spec: InteractiveSpec) {
    const total = content.steps.length;
    const first = content.steps[0]!;

    const body = `<div class="walk-wrapper" role="region" aria-label="Step-by-step walkthrough">
  <div class="walk-counter" aria-live="polite">Step 1 of ${total}</div>
  <h2 class="walk-title" id="walk-title">${escapeHtml(first.title)}</h2>
  <div class="walk-body" id="walk-body">${escapeHtml(first.body)}</div>
  <div class="walk-controls">
    <button type="button" class="touch-target walk-btn" data-action="prev" aria-label="Previous step" disabled>&#9664; Previous</button>
    <button type="button" class="touch-target walk-btn" data-action="next" aria-label="Next step">Next &#9654;</button>
  </div>
</div>`;

    const css = `
.walk-wrapper { padding: 16px; max-width: 720px; }
.walk-counter { font-size: 14px; color: #555550; margin-bottom: 8px; }
.walk-title { font-size: 20px; margin: 0 0 8px; color: #0033A0; }
.walk-body {
  background: #ffffff;
  border: 2px solid #0033A0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  min-height: 80px;
}
.walk-controls { display: flex; }
.walk-controls > * { margin-right: 8px; }
.walk-btn {
  background: #0033A0;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  padding: 10px 16px;
  font-family: inherit;
}
.walk-btn[disabled] { background: #cccccc; cursor: not-allowed; }
`.trim();

    const stepsJson = JSON.stringify(content.steps);
    const js = `
(function() {
  var steps = ${stepsJson};
  var idx = 0;
  var titleEl = document.getElementById('walk-title');
  var bodyEl = document.getElementById('walk-body');
  var counterEl = document.querySelector('.walk-counter');
  var prevBtn = document.querySelector('[data-action="prev"]');
  var nextBtn = document.querySelector('[data-action="next"]');
  function render() {
    titleEl.textContent = steps[idx].title;
    bodyEl.textContent = steps[idx].body;
    counterEl.textContent = 'Step ' + (idx + 1) + ' of ' + steps.length;
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === steps.length - 1;
    window.__announce('Step ' + (idx + 1) + ' of ' + steps.length + ': ' + steps[idx].title + '. ' + steps[idx].body);
  }
  prevBtn.addEventListener('click', function() { if (idx > 0) { idx--; render(); } });
  nextBtn.addEventListener('click', function() { if (idx < steps.length - 1) { idx++; render(); } });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight' && idx < steps.length - 1) { e.preventDefault(); idx++; render(); }
    if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); idx--; render(); }
  });
})();
`.trim();

    return { body, css, js };
  },
};
