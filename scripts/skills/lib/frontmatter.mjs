/**
 * A frontmatter parser for the small, generator-owned subset of YAML used by
 * the skill graph: double-quoted scalars, bare numbers, empty values, and flow
 * sequences of plain ids. Deliberately not a general YAML parser — the writer
 * here is the only producer, so the two stay in lockstep and the repo needs no
 * new dependency.
 */

const FENCE = '---';

function escapeScalar(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ');
}

function unescapeQuoted(value) {
  return value.replace(/\\(["\\])/g, '$1');
}

export function stringifyFrontMatter(data) {
  const lines = [FENCE];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) lines.push(`${key}: [${value.join(', ')}]`);
    else if (typeof value === 'number') lines.push(`${key}: ${value}`);
    else lines.push(`${key}: "${escapeScalar(value ?? '')}"`);
  }
  lines.push(FENCE);
  return `${lines.join('\n')}\n`;
}

function parseValue(raw) {
  const value = raw.trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map((v) => v.trim()).filter(Boolean);
  }
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return unescapeQuoted(value.slice(1, -1));
  }
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

function parseBlock(block) {
  const data = {};
  for (const line of block.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    data[line.slice(0, sep).trim()] = parseValue(line.slice(sep + 1));
  }
  return data;
}

/**
 * @returns {{ data: Record<string, unknown> | null, hasFence: boolean, body: string }}
 *   `data` is null when there is no terminated frontmatter block, in which case
 *   `body` is the whole input. `hasFence` distinguishes "declared no frontmatter"
 *   (false) from "declared one that never terminated" (true, data null), which
 *   the concept rule needs to tell a plain note from a broken one.
 */
export function parseFrontMatter(text) {
  if (!text.startsWith(`${FENCE}\n`) && !text.startsWith(`${FENCE}\r\n`)) {
    return { data: null, hasFence: false, body: text };
  }
  const firstBreak = text.indexOf('\n');
  const end = text.indexOf(`\n${FENCE}`, firstBreak);
  if (end === -1) return { data: null, hasFence: true, body: text };

  const block = text.slice(firstBreak + 1, end);
  const rest = text.slice(end + 1 + FENCE.length);
  return { data: parseBlock(block), hasFence: true, body: rest.startsWith('\n') ? rest.slice(1) : rest };
}
