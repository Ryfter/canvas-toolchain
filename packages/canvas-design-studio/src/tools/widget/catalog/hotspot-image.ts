// packages/canvas-design-studio/src/tools/widget/catalog/hotspot-image.ts

import { z } from 'zod';
import type { Renderer, Result, InteractiveSpec } from '../types.js';

const Hotspot = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  label: z.string().min(1),
  info: z.string().min(1),
});

const HotspotContent = z.object({
  imageUrl: z.string().min(1),
  imageAlt: z.string().min(1),
  hotspots: z.array(Hotspot).min(1),
});

type HotspotContent = z.infer<typeof HotspotContent>;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const hotspotImageRenderer: Renderer<HotspotContent> = {
  kind: 'hotspot-image',
  contentSchema: HotspotContent,

  validateContent(content): Result<HotspotContent> {
    const parsed = HotspotContent.safeParse(content);
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  },

  render(content, _spec: InteractiveSpec) {
    const total = content.hotspots.length;
    const hotspotsHtml = content.hotspots.map((h, i) => `
    <button
      type="button"
      class="hotspot touch-target"
      data-hotspot-id="${i}"
      data-info="${escapeHtml(h.info)}"
      style="left: ${h.x}px; top: ${h.y}px; width: ${h.width}px; height: ${h.height}px;"
      aria-label="Hotspot ${i + 1} of ${total}: ${escapeHtml(h.label)}"
    >${escapeHtml(h.label)}</button>`).join('');

    const body = `<div class="hs-wrapper">
  <div class="image-container">
    <img src="${escapeHtml(content.imageUrl)}" alt="${escapeHtml(content.imageAlt)}" aria-describedby="hs-help">
    <div class="hs-layer">${hotspotsHtml}
    </div>
  </div>
  <div id="hs-help" class="sr-only">This image has ${total} clickable hotspots. Tab through them and press Enter to reveal information.</div>
  <div class="hs-info" role="status" aria-live="polite">Select a hotspot to see details.</div>
</div>`;

    const css = `
.hs-wrapper { padding: 16px; }
.image-container { position: relative; display: inline-block; }
.image-container img { display: block; max-width: 100%; height: auto; }
.hs-layer { position: absolute; inset: 0; }
.hotspot {
  position: absolute;
  background: rgba(0, 51, 160, 0.4);
  border: 2px solid #0033A0;
  border-radius: 4px;
  color: #ffffff;
  font-weight: bold;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
}
.hotspot:hover, .hotspot:focus { background: rgba(0, 51, 160, 0.7); }
.hotspot.active { background: rgba(0, 51, 160, 0.9); }
.hs-info {
  background: #E6F1FB;
  color: #185FA5;
  border: 1px solid #185FA5;
  border-radius: 4px;
  padding: 12px;
  margin-top: 12px;
  min-height: 40px;
}
`.trim();

    const js = `
(function() {
  var infoEl = document.querySelector('.hs-info');
  var hotspots = document.querySelectorAll('.hotspot');
  hotspots.forEach(function(h) {
    h.addEventListener('click', function() {
      hotspots.forEach(function(other) { other.classList.remove('active'); });
      h.classList.add('active');
      var info = h.getAttribute('data-info');
      var label = h.getAttribute('aria-label');
      infoEl.textContent = info;
      window.__announce(label + ': ' + info);
    });
  });
})();
`.trim();

    return { body, css, js };
  },
};
