// packages/command-and-control/src/lib/front_matter.ts
//
// Minimal YAML front-matter parser built on the maintained `yaml` package
// (the library the rest of the toolchain already standardizes on). Replaces
// gray-matter, which pinned the vulnerable js-yaml@3 (issue #103 / Dependabot
// GHSA-h67p-54hq-rp68). Surface kept tiny on purpose: parse only — the answers
// chunkers never re-serialize.
//
// Behavior mirrors the gray-matter usage it replaces: a leading `---` fenced
// block is parsed into `data`; everything after the closing fence is `content`.
// No front matter (or a malformed / non-object block) yields empty data and the
// original input unchanged, so non-design keys are preserved and parse failures
// degrade gracefully rather than throwing.

import { parse as parseYaml } from 'yaml';

export interface ParsedFrontMatter {
  data: Record<string, unknown>;
  content: string;
}

// Opening fence must be the first line; capture an optional YAML block lazily up
// to the next `---` fence line, then the remainder is the body. The block is
// optional so an empty front matter (`---\n---\n`) is still recognized.
// Tolerates CRLF.
const FM_PATTERN = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n([\s\S]*))?$/;

export function parseFrontMatter(input: string): ParsedFrontMatter {
  const str = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const match = FM_PATTERN.exec(str);
  if (!match) {
    return { data: {}, content: input };
  }

  const block = match[1];
  const content = match[2] ?? '';
  if (!block || block.trim() === '') {
    return { data: {}, content };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(block);
  } catch {
    return { data: {}, content };
  }

  const data =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  return { data, content };
}
