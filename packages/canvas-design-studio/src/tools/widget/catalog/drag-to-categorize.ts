// packages/canvas-design-studio/src/tools/widget/catalog/drag-to-categorize.ts

import { z } from 'zod';
import type { Renderer, Result, InteractiveSpec } from '../types.js';

const Item = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  correctBin: z.string().min(1),
});

const Bin = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

const CategorizeContent = z.object({
  items: z.array(Item).min(1),
  bins: z.array(Bin).min(2),
}).refine(
  (v) => v.items.every((it) => v.bins.some((b) => b.id === it.correctBin)),
  { message: 'item.correctBin must reference a bin id' },
);

type CategorizeContent = z.infer<typeof CategorizeContent>;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const dragToCategorizeRenderer: Renderer<CategorizeContent> = {
  kind: 'drag-to-categorize',
  contentSchema: CategorizeContent,

  validateContent(content): Result<CategorizeContent> {
    const parsed = CategorizeContent.safeParse(content);
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  },

  render(content, _spec: InteractiveSpec) {
    const binOptions = content.bins.map(b => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.label)}</option>`).join('');
    const itemsHtml = content.items.map((it) => `
  <li class="cat-item" data-item-id="${escapeHtml(it.id)}" data-correct-bin="${escapeHtml(it.correctBin)}">
    <span class="item-label">${escapeHtml(it.label)}</span>
    <label class="item-bin-label" for="bin-for-${escapeHtml(it.id)}">Move to bin: </label>
    <select id="bin-for-${escapeHtml(it.id)}" class="touch-target" data-action="move-to-bin" aria-label="Move ${escapeHtml(it.label)} to bin">
      <option value="">(unassigned)</option>
      ${binOptions}
    </select>
  </li>`).join('');

    const binsHtml = content.bins.map(b => `
  <div class="cat-bin" data-bin-id="${escapeHtml(b.id)}" aria-label="Bin: ${escapeHtml(b.label)}">
    <h3 class="bin-label">${escapeHtml(b.label)}</h3>
    <ul class="bin-contents" role="list" aria-label="${escapeHtml(b.label)} bin contents"></ul>
  </div>`).join('');

    const body = `<div class="cat-wrapper">
  <h2 class="cat-heading">Items</h2>
  <ul class="cat-items" role="list">${itemsHtml}
  </ul>
  <h2 class="cat-heading">Bins</h2>
  <div class="cat-bins">${binsHtml}
  </div>
  <button type="button" class="touch-target submit-btn" data-action="submit" aria-label="Submit your categorization">Submit</button>
  <div class="result" role="status"></div>
</div>`;

    const css = `
.cat-wrapper { padding: 16px; }
.cat-heading { font-size: 18px; margin: 12px 0 8px; }
.cat-items { list-style: none; padding: 0; }
.cat-item {
  background: #ffffff;
  border: 2px solid #0033A0;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}
.item-label { font-weight: bold; margin-right: 12px; }
.item-bin-label { margin-right: 4px; }
.cat-bins { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.cat-bins > * { margin: 8px; }
.cat-bin {
  background: #F4F3EF;
  border: 2px solid #e0e0d8;
  border-radius: 8px;
  padding: 12px;
  min-height: 100px;
}
.bin-label { margin: 0 0 8px; font-size: 16px; }
.bin-contents { list-style: none; padding: 0; margin: 0; min-height: 60px; }
.bin-contents li { background: #ffffff; padding: 8px; margin: 4px 0; border-radius: 4px; border: 1px solid #0033A0; }
.submit-btn { background: #0033A0; color: #ffffff; border: none; border-radius: 4px; padding: 10px 20px; font-weight: bold; cursor: pointer; margin-top: 12px; }
.cat-item.correct { border-color: #3B6D11; background: #EAF3DE; }
.cat-item.wrong { border-color: #A32D2D; background: #FCEBEB; }
.result { margin-top: 12px; font-weight: bold; }
`.trim();

    const js = `
(function() {
  var assignments = {}; // itemId -> binId
  var items = document.querySelectorAll('.cat-item');
  items.forEach(function(item) {
    var sel = item.querySelector('[data-action="move-to-bin"]');
    sel.addEventListener('change', function() {
      var itemId = item.getAttribute('data-item-id');
      var binId = sel.value;
      assignments[itemId] = binId;
      var label = item.querySelector('.item-label').textContent;
      var binLabel = binId
        ? (document.querySelector('.cat-bin[data-bin-id="' + binId + '"] .bin-label').textContent)
        : 'unassigned';
      // Move the visible chip into the bin
      document.querySelectorAll('.bin-contents li[data-from-item="' + itemId + '"]').forEach(function(li){ li.remove(); });
      if (binId) {
        var chip = document.createElement('li');
        chip.setAttribute('data-from-item', itemId);
        chip.textContent = label;
        document.querySelector('.cat-bin[data-bin-id="' + binId + '"] .bin-contents').appendChild(chip);
      }
      window.__announce(label + ' moved to ' + binLabel + '.');
    });
  });
  document.querySelector('[data-action="submit"]').addEventListener('click', function() {
    var correct = 0;
    items.forEach(function(item) {
      var itemId = item.getAttribute('data-item-id');
      var correctBin = item.getAttribute('data-correct-bin');
      var assigned = assignments[itemId];
      item.classList.remove('correct', 'wrong');
      if (assigned === correctBin) { item.classList.add('correct'); correct++; }
      else { item.classList.add('wrong'); }
    });
    var msg = correct + ' of ' + items.length + ' items in the correct bin.';
    document.querySelector('.result').textContent = msg;
    window.__announce(msg);
  });
})();
`.trim();

    return { body, css, js };
  },
};
