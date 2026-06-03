// packages/canvas-design-studio/src/tools/widget/catalog/card-flip-reveal.ts

import { z } from 'zod';
import type { Renderer, Result, InteractiveSpec } from '../types.js';

const Card = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
});

const CardFlipContent = z.object({
  cards: z.array(Card).min(1),
});

type CardFlipContent = z.infer<typeof CardFlipContent>;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const cardFlipRevealRenderer: Renderer<CardFlipContent> = {
  kind: 'card-flip-reveal',
  contentSchema: CardFlipContent,

  validateContent(content): Result<CardFlipContent> {
    const parsed = CardFlipContent.safeParse(content);
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  },

  render(content, _spec: InteractiveSpec) {
    const total = content.cards.length;
    const body = `<div class="card-grid" role="list">${content.cards.map((c, i) => `
  <button
    type="button"
    role="button"
    class="card touch-target"
    aria-pressed="false"
    aria-label="Card ${i + 1} of ${total}, showing front: ${escapeHtml(c.front)}"
    data-front="${escapeHtml(c.front)}"
    data-back="${escapeHtml(c.back)}"
    data-position="${i + 1}"
  ><span class="card-face">${escapeHtml(c.front)}</span></button>`).join('')}
</div>`;

    const css = `
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  padding: 16px;
}
.card-grid > * { margin: 8px; }
.card {
  background: #ffffff;
  border: 2px solid #0033A0;
  border-radius: 8px;
  padding: 24px 16px;
  font-family: inherit;
  font-size: 18px;
  cursor: pointer;
  text-align: center;
  min-height: 100px;
}
.card[aria-pressed="true"] {
  background: #E6ECF9;
}
`.trim();

    const js = `
(function() {
  var cards = document.querySelectorAll('.card');
  var total = cards.length;
  for (var i = 0; i < cards.length; i++) {
    (function(card, idx) {
      function flip() {
        var pressed = card.getAttribute('aria-pressed') === 'true';
        var newState = !pressed;
        card.setAttribute('aria-pressed', String(newState));
        var face = card.querySelector('.card-face');
        var front = card.getAttribute('data-front');
        var back = card.getAttribute('data-back');
        face.textContent = newState ? back : front;
        card.setAttribute('aria-label',
          'Card ' + (idx + 1) + ' of ' + total +
          (newState ? ', showing back: ' + back : ', showing front: ' + front));
        window.__announce('Card ' + (idx + 1) + ' ' + (newState ? 'flipped to back: ' + back : 'flipped to front: ' + front));
      }
      card.addEventListener('click', flip);
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
          e.preventDefault();
          flip();
        }
      });
    })(cards[i], i);
  }
})();
`.trim();

    return { body, css, js };
  },
};
