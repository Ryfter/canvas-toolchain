import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';

const KB_DIR = join(homedir(), '.canvas-design-mcp', 'kb');
const CANVAS_SANITIZE_URL =
  'https://raw.githubusercontent.com/instructure/canvas-lms/master/gems/canvas_sanitize/lib/canvas_sanitize/canvas_sanitize.rb';

export interface KbUpdateResult {
  updated: boolean;
  changes: string[];
  lastChecked: string;
  cssPropsCount: number;
  htmlTagsCount: number;
  parseWarning?: string;
}

interface KbAllowlist {
  cssProps: string[];
  htmlTags: string[];
  fetchedAt: string;
}

interface KbMeta {
  lastChecked: string;
}

function parseRubyPercentW(source: string, varPattern: RegExp): string[] {
  const m = source.match(varPattern);
  if (!m) return [];
  return m[1].trim().split(/\s+/).filter(Boolean);
}

function parseCanvasSanitize(source: string): { cssProps: string[]; htmlTags: string[]; parseWarning?: string } {
  // Canvas uses %w[...] arrays for allowed elements and CSS properties
  const cssProps = parseRubyPercentW(source, /ALLOWED_CSS_PROPERTIES\s*=\s*%w\[([\s\S]*?)\]/);
  const htmlTagsA = parseRubyPercentW(source, /ALLOWED_ELEMENTS\s*=\s*%w\[([\s\S]*?)\]/);
  // Fallback: some versions use ALLOWED_TAGS
  const htmlTagsB = htmlTagsA.length === 0
    ? parseRubyPercentW(source, /ALLOWED_TAGS\s*=\s*%w\[([\s\S]*?)\]/)
    : htmlTagsA;

  const parseWarning =
    cssProps.length === 0 && htmlTagsB.length === 0
      ? 'Could not parse allowlist arrays — Canvas source format may have changed. KB not updated.'
      : undefined;

  return { cssProps, htmlTags: htmlTagsB, parseWarning };
}

function diff(prev: string[], next: string[]): { added: string[]; removed: string[] } {
  return {
    added: next.filter(x => !prev.includes(x)),
    removed: prev.filter(x => !next.includes(x)),
  };
}

export async function updateCanvasKb(force = false): Promise<KbUpdateResult> {
  mkdirSync(KB_DIR, { recursive: true });

  const metaPath = join(KB_DIR, 'meta.json');
  const allowlistPath = join(KB_DIR, 'allowlist.json');

  const meta: KbMeta = existsSync(metaPath)
    ? (JSON.parse(readFileSync(metaPath, 'utf-8')) as KbMeta)
    : { lastChecked: '' };

  if (!force && meta.lastChecked) {
    const ageMs = Date.now() - new Date(meta.lastChecked).getTime();
    if (ageMs < 24 * 60 * 60 * 1000) {
      const prev: KbAllowlist = existsSync(allowlistPath)
        ? JSON.parse(readFileSync(allowlistPath, 'utf-8'))
        : { cssProps: [], htmlTags: [], fetchedAt: '' };
      return {
        updated: false,
        changes: [],
        lastChecked: meta.lastChecked,
        cssPropsCount: prev.cssProps.length,
        htmlTagsCount: prev.htmlTags.length,
      };
    }
  }

  const response = await fetch(CANVAS_SANITIZE_URL, {
    headers: { 'User-Agent': '@canvas-toolchain/canvas-design-studio/0.1.0' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Canvas sanitizer source: HTTP ${response.status}`);
  }
  const source = await response.text();

  const { cssProps, htmlTags, parseWarning } = parseCanvasSanitize(source);
  if (parseWarning) {
    return {
      updated: false,
      changes: [],
      lastChecked: meta.lastChecked || 'never',
      cssPropsCount: 0,
      htmlTagsCount: 0,
      parseWarning,
    };
  }

  const prev: KbAllowlist = existsSync(allowlistPath)
    ? JSON.parse(readFileSync(allowlistPath, 'utf-8'))
    : { cssProps: [], htmlTags: [], fetchedAt: '' };

  const cssDiff = diff(prev.cssProps, cssProps);
  const tagDiff = diff(prev.htmlTags, htmlTags);

  const changes: string[] = [
    ...cssDiff.added.map(p => `+ CSS: ${p}`),
    ...cssDiff.removed.map(p => `- CSS: ${p}`),
    ...tagDiff.added.map(t => `+ tag: <${t}>`),
    ...tagDiff.removed.map(t => `- tag: <${t}>`),
  ];

  const now = new Date().toISOString();
  writeFileSync(allowlistPath, JSON.stringify({ cssProps, htmlTags, fetchedAt: now } satisfies KbAllowlist, null, 2));
  writeFileSync(metaPath, JSON.stringify({ lastChecked: now } satisfies KbMeta, null, 2));

  return {
    updated: true,
    changes,
    lastChecked: now,
    cssPropsCount: cssProps.length,
    htmlTagsCount: htmlTags.length,
  };
}
