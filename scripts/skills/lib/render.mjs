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
 * The only thing an agent reads first: every operation, one line each, grouped
 * by section so the scan has landmarks.
 */
export function renderIndexFile(source) {
  const frontMatter = stringifyFrontMatter({
    id: INDEX_ID,
    kind: 'index',
    description: `One line per operation (${source.operations.length} total). Read this first, then open ops/<id>.md for the one you picked.`,
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
  return frontMatter + body.join('\n');
}

export function renderMocFile(moc, source) {
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
  return frontMatter + body.join('\n');
}
