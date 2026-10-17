import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontMatter } from './frontmatter.mjs';

function listMarkdown(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.md')).sort();
}

function readDocument(dir, name, prefix) {
  const text = readFileSync(join(dir, name), 'utf8');
  const { data, body } = parseFrontMatter(text);
  return {
    id: name.replace(/\.md$/, ''),
    path: prefix ? `${prefix}/${name}` : name,
    frontMatter: data ?? {},
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
