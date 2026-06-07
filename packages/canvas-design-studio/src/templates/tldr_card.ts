import type { PageTiers, PageClos } from '@canvas-toolchain/shared-types';

export interface RenderTldrCardInput {
  tiers?: PageTiers;
  clos?: PageClos;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderTldrCard(input: RenderTldrCardInput): string {
  const tier1 = input.tiers?.sections.filter((s) => s.tier === 1) ?? [];
  const clos = input.clos?.resolved ?? [];

  if (tier1.length === 0 && clos.length === 0) return '';

  const items = tier1
    .map((s) => `    <li><strong>${escapeHtml(s.heading)}:</strong> ${escapeHtml(s.summary)}</li>`)
    .join('\n');

  const itemsBlock = tier1.length > 0
    ? `  <ul style="margin:0.5em 0; padding-left:1.25em;">
${items}
  </ul>`
    : '';

  const closLine = clos.length > 0
    ? `  <p style="margin:0.5em 0 0 0; font-size:0.9em; color:#555550;"><strong>Supports CLOs:</strong> ${clos.map((c) => `CLO ${escapeHtml(c.id)} — ${escapeHtml(c.name)}`).join(' · ')}</p>`
    : '';

  return `<div style="background:#E6ECF9; border-left:4px solid #0033A0; padding:1em 1.25em; margin-bottom:1.5em; border-radius:0 4px 4px 0;">
  <h3 style="margin-top:0; color:#0033A0;">📌 Quick Reference</h3>
${itemsBlock}
${closLine}
</div>
`;
}
