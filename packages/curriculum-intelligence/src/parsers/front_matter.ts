// packages/curriculum-intelligence/src/parsers/front_matter.ts
//
// YAML front-matter parse + serialize built on the maintained `yaml` package
// (already a CI dependency and the toolchain's standard YAML lib). Replaces
// gray-matter, which pinned the vulnerable js-yaml@3 (issue #103 / Dependabot
// GHSA-h67p-54hq-rp68). Behavior preserved: unknown/namespaced keys are kept,
// parse failures degrade to empty data rather than throwing, and serialize
// round-trips through parse.

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface ParsedBrief {
  data: Record<string, unknown>;
  body: string;
}

// Opening fence on the first line; optional YAML block (so `---\n---\n` is
// valid) up to the closing `---` fence line; remainder is the body. CRLF-safe.
const FM_PATTERN = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n([\s\S]*))?$/;

export function parseBriefFile(content: string): ParsedBrief {
  const str = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const match = FM_PATTERN.exec(str);
  if (!match) {
    return { data: {}, body: content };
  }

  const block = match[1];
  const body = match[2] ?? '';
  if (!block || block.trim() === '') {
    return { data: {}, body };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(block);
  } catch {
    return { data: {}, body };
  }

  const data =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  return { data, body };
}

export function serializeBriefFile(data: Record<string, unknown>, body: string): string {
  const yaml = stringifyYaml(data); // ends with a trailing newline
  const separator = body.startsWith('\n') ? '' : '\n';
  return `---\n${yaml}---${separator}${body}`;
}
