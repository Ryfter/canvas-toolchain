import type { DiffSummary } from './manifest_types.js';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function wordCount(html: string): number {
  const stripped = stripHtml(html);
  if (!stripped) return 0;
  return stripped.split(/\s+/).length;
}

function countMatches(html: string, regex: RegExp): number {
  return (html.match(regex) ?? []).length;
}

function countCallouts(html: string): number {
  return countMatches(html, /class="[^"]*\bcallout\b[^"]*"/gi);
}

function imgSignatures(html: string): Set<string> {
  const out = new Set<string>();
  const re = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const src = /\bsrc="([^"]*)"/i.exec(tag)?.[1] ?? '';
    const alt = /\balt="([^"]*)"/i.exec(tag)?.[1] ?? '';
    out.add(`${src}|${alt}`);
  }
  return out;
}

function countSections(html: string): number {
  return countMatches(html, /<h[234]\b/gi);
}

export function buildDiffSummary(priorHtml: string | null, newHtml: string): DiffSummary {
  const priorWords = priorHtml === null ? null : wordCount(priorHtml);
  const newWords = wordCount(newHtml);
  const delta = priorWords === null ? newWords : newWords - priorWords;

  const priorSections = priorHtml === null ? 0 : countSections(priorHtml);
  const newSections = countSections(newHtml);
  const sectionsChanged = Math.abs(newSections - priorSections);

  const priorCallouts = priorHtml === null ? 0 : countCallouts(priorHtml);
  const newCallouts = countCallouts(newHtml);
  const calloutsAdded = Math.max(0, newCallouts - priorCallouts);
  const calloutsRemoved = Math.max(0, priorCallouts - newCallouts);

  const priorImgs = priorHtml === null ? new Set<string>() : imgSignatures(priorHtml);
  const newImgs = imgSignatures(newHtml);
  let imagesChanged = 0;
  for (const sig of newImgs) if (!priorImgs.has(sig)) imagesChanged += 1;
  for (const sig of priorImgs) if (!newImgs.has(sig)) imagesChanged += 1;

  return {
    priorWords,
    newWords,
    delta,
    sectionsChanged,
    calloutsAdded,
    calloutsRemoved,
    imagesChanged,
    hasFullDiff: true,
  };
}

export function computeUnifiedDiff(priorHtml: string | null, newHtml: string): string {
  if (priorHtml === null) {
    return `(new page — no prior content)\n+++ new\n${newHtml.split('\n').map(l => `+ ${l}`).join('\n')}`;
  }
  const a = priorHtml.split(/\r?\n/);
  const b = newHtml.split(/\r?\n/);
  const out: string[] = ['--- prior', '+++ new'];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === right) {
      out.push(`  ${left ?? ''}`);
    } else {
      if (left !== undefined) out.push(`- ${left}`);
      if (right !== undefined) out.push(`+ ${right}`);
    }
  }
  return out.join('\n');
}
