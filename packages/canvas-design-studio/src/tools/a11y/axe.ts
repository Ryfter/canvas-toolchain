import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { scMeta, type AccessibilityFinding, type FindingSeverity } from '@canvas-toolchain/shared-types';
import type { AccessibilityEngine, EngineResult } from './engine.js';

const require_ = createRequire(import.meta.url);
let axeSource: string | undefined;

function loadAxeSource(): string {
  axeSource ??= readFileSync(require_.resolve('axe-core/axe.min.js'), 'utf-8');
  return axeSource;
}

/**
 * SCs axe has jsdom-safe rules for. Layout-dependent rules (color-contrast,
 * target-size) are disabled — jsdom performs no layout; the in-house contrast
 * check is authoritative for 1.4.3 (spec §2).
 */
export const AXE_COVERED_SC: string[] = [
  '1.1.1', '1.3.1', '1.3.5', '1.4.1', '1.4.2',
  '2.2.1', '2.2.2', '2.4.4', '2.4.6', '2.5.3',
  '3.1.2', '4.1.2', '4.1.3',
];

const IMPACT_TO_SEVERITY: Record<string, FindingSeverity> = {
  critical: 'critical', serious: 'serious', moderate: 'moderate', minor: 'minor',
};

const WCAG_TAG = /^wcag(\d)(\d)(\d{1,2})$/;

function scFromTags(tags: string[]): string | undefined {
  for (const tag of tags) {
    const m = WCAG_TAG.exec(tag);
    if (m) return `${m[1]}.${m[2]}.${parseInt(m[3], 10)}`;
  }
  return undefined;
}

function truncate(s: string): string {
  return s.length > 60 ? s.slice(0, 60) + '...' : s;
}

interface AxeNode { html: string; failureSummary?: string }
interface AxeViolation { id: string; impact?: string; tags: string[]; help: string; nodes: AxeNode[] }

export const axeEngine: AccessibilityEngine = {
  name: 'axe',
  async check(html): Promise<EngineResult> {
    // Wrap the Canvas fragment in a well-formed document so document-level
    // rules (html-has-lang, document-title) — Canvas chrome, NA for fragments —
    // are satisfied rather than falsely flagged.
    const doc = `<!doctype html><html lang="en"><head><title>fragment</title></head><body>${html}</body></html>`;
    let violations: AxeViolation[];
    try {
      const dom = new JSDOM(doc, { runScripts: 'outside-only' });
      dom.window.eval(loadAxeSource());
      const axe = (dom.window as unknown as { axe: { run: Function } }).axe;
      const results = (await axe.run(dom.window.document.body, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        rules: {
          'color-contrast': { enabled: false },  // no layout in jsdom; in-house owns 1.4.3
          'target-size': { enabled: false },     // no layout in jsdom
        },
        resultTypes: ['violations'],
      })) as { violations: AxeViolation[] };
      violations = results.violations;
      dom.window.close();
    } catch (err) {
      // Engine failure must never break an advisory pipeline: report nothing
      // covered so criteria honestly fall back to needs-human-review.
      console.error(`[a11y] axe engine failed: ${err instanceof Error ? err.message : String(err)}`);
      return { findings: [], criteriaCovered: [] };
    }

    const findings: AccessibilityFinding[] = [];
    for (const v of violations) {
      const sc = scFromTags(v.tags);
      if (!sc) continue;                 // best-practice rule without a WCAG SC tag
      const meta = scMeta(sc);
      if (!meta) continue;               // AAA or unknown — outside the A/AA catalog
      const severity = IMPACT_TO_SEVERITY[v.impact ?? 'moderate'] ?? 'moderate';
      for (const node of v.nodes) {
        findings.push({
          sc: meta.sc,
          scName: meta.scName,
          scVersion: meta.scVersion,
          level: meta.level,
          severity,
          engine: 'axe',
          message: `${v.help} (axe rule: ${v.id})`,
          context: truncate(node.html),
        });
      }
    }
    return { findings, criteriaCovered: AXE_COVERED_SC };
  },
};
