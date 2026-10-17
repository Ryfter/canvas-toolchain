import { stringifyFrontMatter } from './frontmatter.mjs';
import { ADVANCED_MOC_ID } from './graph.mjs';

export const INDEX_ID = 'index';

/** Guarantee the "one line per operation" contract even if a future
 *  description arrives containing a newline. */
function oneLine(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

export function indexStubBody() {
  return [
    '',
    '',
    '# Notes',
    '',
    '<!-- Hand-written. The generator regenerates everything above the marker. -->',
    '',
  ].join('\n');
}

export function opStubBody(op) {
  return [
    '',
    '',
    `# ${op.id}`,
    '',
    '## When to use',
    '',
    '<!-- Hand-written guidance starts here. The generator only rewrites the frontmatter above the marker. -->',
    '',
    '## Pitfalls',
    '',
  ].join('\n');
}

export function mocStubBody() {
  return [
    '',
    '',
    '# Notes',
    '',
    '<!-- Hand-written. The generator regenerates everything above the marker. -->',
    '',
  ].join('\n');
}

export function renderOpFile(op, related = []) {
  return stringifyFrontMatter({
    id: op.id,
    description: op.description,
    section: op.section,
    intent_tool: op.intentTool ?? '',
    intent_action: op.intentAction ?? '',
    exposure: op.exposure,
    related,
  });
}

/**
 * How long a concept line's description may be, in characters.
 *
 * A concept line is a *pointer*, not the note. The map is the routed first read,
 * so the line carries the id an agent follows plus a scannable hint — not the
 * note's full (up to 200-character) description, which is read again in the
 * concept file itself. Measured against the 18 benchmark asks in J9: the full
 * descriptions cost ~146 tokens on the routed path, the capped ones ~69.
 */
export const CONCEPT_LINE_CAP = 60;

/** One compact map line for a concept: the wikilink, then a short description. */
export function conceptLine(concept) {
  const description = oneLine(concept.description);
  const short = description.length <= CONCEPT_LINE_CAP
    ? description
    : `${description.slice(0, CONCEPT_LINE_CAP - 3)}...`;
  return `- [[${concept.id}]] — ${short}`;
}

/**
 * The concept section a map file carries, or nothing when the map owns none.
 * Omitted rather than emitted empty: a MOC is the routed first read, and a
 * `(none)` heading is read every time for no information.
 */
function conceptSection(concepts) {
  if (!concepts.length) return [];
  // Sorted here rather than left to the caller: the index reads concepts off
  // `readdirSync` while the MOCs get them from `conceptsForMoc`, and the two must
  // emit the same bytes. Code-unit order, so the sort decides the file and
  // `--check` agrees everywhere.
  const ordered = [...concepts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return [
    `## Concepts (${ordered.length})`, '',
    ...ordered.map(conceptLine),
    '',
  ];
}

/**
 * The full-catalog fallback, not the first read: an agent that has already
 * chosen its `ct_*` tool starts at `moc/<intent tool>.md` (path C), and only
 * falls back to this full operation list when it does not yet know which tool it
 * is in. Both route to the same `ops/<id>.md` files.
 */
export function renderIndexFile(source, concepts = []) {
  const frontMatter = stringifyFrontMatter({
    id: INDEX_ID,
    kind: 'index',
    description: `Full catalog: one line per operation (${source.operations.length} total), grouped by section. To act, start from moc/<intent tool>.md (e.g. moc/ct_build.md), then open ops/<id>.md for the one you picked.`,
    ops: source.operations.length,
    related: source.sections.map((s) => s.id),
  });

  const body = [`# Operation index`, '', `Sections: ${source.sections.map((s) => `[[${s.id}]]`).join(' ')}`, ''];
  for (const section of source.sections) {
    const inSection = source.operations.filter((o) => o.section === section.id);
    if (!inSection.length) continue;
    body.push(`## ${section.id} — ${oneLine(section.description)}`, '');
    for (const op of inSection) body.push(`- [[${op.id}]] — ${oneLine(op.description)}`);
    body.push('');
  }
  body.push(...conceptSection(concepts));
  return frontMatter + body.join('\n');
}

export function renderMocFile(moc, source, concepts = []) {
  const frontMatter = stringifyFrontMatter({
    id: moc.id,
    kind: moc.kind,
    description: moc.description,
    ops: moc.opIds.length,
    related: moc.related,
  });

  const heading = moc.kind === 'section'
    ? `# ${moc.id} section`
    : moc.id === ADVANCED_MOC_ID ? '# ct_advanced' : `# ${moc.id} (intent tool)`;

  const body = [heading, '', oneLine(moc.description), '', `## Operations (${moc.opIds.length})`, ''];
  if (!moc.opIds.length) {
    body.push('- (none yet)', '');
  } else {
    for (const id of moc.opIds) {
      const op = source.operations.find((o) => o.id === id);
      body.push(`- [[${id}]] — ${oneLine(op?.description)}`);
    }
    body.push('');
  }
  body.push(...conceptSection(concepts));
  return frontMatter + body.join('\n');
}
