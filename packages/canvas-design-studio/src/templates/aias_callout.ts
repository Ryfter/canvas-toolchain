import type { PageAias } from '@canvas-toolchain/shared-types';
import { CANONICAL_AIAS_NAMES } from '../course/aias_canonical.js';

export interface RenderAiasCalloutInput {
  aias: PageAias;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderAiasCallout(input: RenderAiasCalloutInput): string {
  const { level, note } = input.aias;
  const name = CANONICAL_AIAS_NAMES[level];
  return `<div style="background:#FAEEDA; border-left:4px solid #854F0B; padding:1em 1.25em; margin-bottom:1.25em; border-radius:0 4px 4px 0;">
  <p style="margin:0; color:#854F0B;">
    <strong>AI Use Policy — Level ${level} (${escapeHtml(name)})</strong>
  </p>
  <p style="margin:0.5em 0 0 0;">${escapeHtml(note)}</p>
</div>
`;
}
