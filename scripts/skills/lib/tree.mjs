import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontMatter } from './frontmatter.mjs';

function listMarkdown(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.md')).sort();
}

function readDocument(dir, name, prefix) {
  const text = readFileSync(join(dir, name), 'utf8');
  const { data, hasFence, body } = parseFrontMatter(text);
  return {
    id: name.replace(/\.md$/, ''),
    path: prefix ? `${prefix}/${name}` : name,
    frontMatter: data ?? {},
    /** Declared a frontmatter fence that never terminated — see parseFrontMatter. */
    frontMatterUnparsed: hasFence && data === null,
    body,
    text,
  };
}

/**
 * Read a skills tree into the shape the rules consume. One filesystem seam, so
 * the rules stay pure and a fixture directory is as good an input as the real
 * tree.
 */
export function readSkillsTree(root) {
  const ops = listMarkdown(join(root, 'ops')).map((name) => readDocument(join(root, 'ops'), name, 'ops'));
  const mocs = listMarkdown(join(root, 'moc')).map((name) => readDocument(join(root, 'moc'), name, 'moc'));
  const concepts = listMarkdown(join(root, 'concepts')).map((name) => readDocument(join(root, 'concepts'), name, 'concepts'));
  const index = existsSync(join(root, 'index.md')) ? readDocument(root, 'index.md', '') : null;

  return {
    ops,
    mocs,
    concepts,
    index,
    files: [...ops, ...mocs, ...concepts, ...(index ? [index] : [])],
  };
}

/** Every `[[id]]` in a document, in order of appearance. */
export function wikilinks(text) {
  return [...text.matchAll(/\[\[([^\]|]+)\]\]/g)].map((match) => match[1].trim());
}

/**
 * A frontmatter `related:` list as ids. Concept notes are hand-written, so a
 * scalar (`related: generate_quiz`) is read as a one-element list rather than
 * iterated character by character — the same tolerance the lint and the MOC
 * generator need, in one place.
 */
export function relatedList(frontMatter) {
  const value = frontMatter?.related;
  if (Array.isArray(value)) return value.map(String);
  return value === undefined || value === null || value === '' ? [] : [String(value)];
}

/**
 * The concept fields the graph projections consume: the file-stem id, the
 * description an agent scans, and the operations the concept is about.
 */
export function plainConcept(doc) {
  return {
    id: doc.id,
    description: String(doc.frontMatter.description ?? ''),
    related: relatedList(doc.frontMatter),
  };
}
