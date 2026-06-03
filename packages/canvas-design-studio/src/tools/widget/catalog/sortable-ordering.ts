// packages/canvas-design-studio/src/tools/widget/catalog/sortable-ordering.ts

import { z } from 'zod';
import type { Renderer, Result, InteractiveSpec } from '../types.js';

const Item = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

const SortableContent = z.object({
  items: z.array(Item).min(2),
  correctOrder: z.array(z.string().min(1)).min(2),
}).refine(
  (v) => v.correctOrder.length === v.items.length,
  { message: 'correctOrder.length must equal items.length' },
).refine(
  (v) => v.correctOrder.every((id) => v.items.some((it) => it.id === id)),
  { message: 'correctOrder contains an id not present in items' },
);

type SortableContent = z.infer<typeof SortableContent>;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const sortableOrderingRenderer: Renderer<SortableContent> = {
  kind: 'sortable-ordering',
  contentSchema: SortableContent,

  validateContent(content): Result<SortableContent> {
    const parsed = SortableContent.safeParse(content);
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  },

  render(content, _spec: InteractiveSpec) {
    const total = content.items.length;
    const itemsHtml = content.items.map((it, i) => `
  <li
    class="sortable-item"
    data-id="${escapeHtml(it.id)}"
    aria-label="Item ${i + 1} of ${total}: ${escapeHtml(it.label)}, currently at position ${i + 1}"
    tabindex="0"
  >
    <span class="item-label">${escapeHtml(it.label)}</span>
    <span class="item-controls">
      <button type="button" class="touch-target move-btn" data-action="up" aria-label="Move ${escapeHtml(it.label)} up">&#9650;</button>
      <button type="button" class="touch-target move-btn" data-action="down" aria-label="Move ${escapeHtml(it.label)} down">&#9660;</button>
    </span>
  </li>`).join('');

    const body = `<div class="sortable-wrapper">
  <ol class="sortable-list" role="list">${itemsHtml}
  </ol>
  <button type="button" class="touch-target submit-btn" data-action="submit" aria-label="Submit your ordering">Submit</button>
  <div class="result" role="status"></div>
</div>`;

    const css = `
.sortable-wrapper { padding: 16px; }
.sortable-list { list-style: decimal inside; padding: 0; margin: 0 0 16px; }
.sortable-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  border: 2px solid #0033A0;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 8px;
}
.sortable-item:focus-within { background: #E6ECF9; }
.item-controls { display: flex; }
.item-controls > * { margin-left: 4px; }
.move-btn, .submit-btn {
  background: #ffffff;
  border: 1px solid #0033A0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  padding: 4px 12px;
}
.submit-btn { background: #0033A0; color: #ffffff; padding: 10px 20px; font-weight: bold; }
.sortable-item.correct { border-color: #3B6D11; background: #EAF3DE; }
.sortable-item.wrong { border-color: #A32D2D; background: #FCEBEB; }
.result { margin-top: 12px; font-weight: bold; }
`.trim();

    const correctOrderJson = JSON.stringify(content.correctOrder);
    const js = `
(function() {
  var list = document.querySelector('.sortable-list');
  var items = function() { return Array.prototype.slice.call(list.querySelectorAll('.sortable-item')); };
  var correctOrder = ${correctOrderJson};
  function relabel() {
    var arr = items();
    var total = arr.length;
    for (var i = 0; i < arr.length; i++) {
      var label = arr[i].querySelector('.item-label').textContent;
      arr[i].setAttribute('aria-label', 'Item ' + (i + 1) + ' of ' + total + ': ' + label + ', currently at position ' + (i + 1));
    }
  }
  function move(item, direction) {
    var arr = items();
    var idx = arr.indexOf(item);
    if (direction === 'up' && idx > 0) {
      list.insertBefore(item, arr[idx - 1]);
      relabel();
      window.__announce(item.querySelector('.item-label').textContent + ' moved up to position ' + idx + ' of ' + arr.length);
    } else if (direction === 'down' && idx < arr.length - 1) {
      list.insertBefore(arr[idx + 1], item);
      relabel();
      window.__announce(item.querySelector('.item-label').textContent + ' moved down to position ' + (idx + 2) + ' of ' + arr.length);
    }
  }
  list.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var item = btn.closest('.sortable-item');
    if (item && (btn.getAttribute('data-action') === 'up' || btn.getAttribute('data-action') === 'down')) {
      move(item, btn.getAttribute('data-action'));
    }
  });
  document.querySelector('[data-action="submit"]').addEventListener('click', function() {
    var arr = items();
    var correctCount = 0;
    for (var i = 0; i < arr.length; i++) {
      var ok = arr[i].getAttribute('data-id') === correctOrder[i];
      arr[i].classList.remove('correct', 'wrong');
      arr[i].classList.add(ok ? 'correct' : 'wrong');
      if (ok) correctCount++;
    }
    var msg = correctCount + ' of ' + arr.length + ' items are in the correct position.';
    document.querySelector('.result').textContent = msg;
    window.__announce(msg);
  });
})();
`.trim();

    return { body, css, js };
  },
};
