import { wikilinks } from './tree.mjs';

/**
 * The lint rules, as pure functions of a skills tree and the registry it was
 * generated from. No filesystem, no CLI, no LLM: `lintSkills` is testable
 * against a fixture directory and the same code decides CI's exit code.
 */

export const DEFAULT_LINT_OPTIONS = { maxDescription: 200, similarity: 0.8 };

export const RULES = [
  'missing-description', 'too-long', 'duplicate', 'near-duplicate',
  'broken-wikilink', 'orphan', 'drift',
];

/** Lowercase, drop the co-package prefix several pass-through descriptions
 *  carry, keep tokens of two or more characters. */
export function normalizeDescription(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token.length >= 2)
    .join(' ')
    .trim();
}

function trigrams(text) {
  const set = new Set();
  for (let i = 0; i + 3 <= text.length; i += 1) set.add(text.slice(i, i + 3));
  return set;
}

/** Jaccard similarity over character trigrams; 0 when either side is empty. */
export function trigramSimilarity(a, b) {
  const left = trigrams(a);
  const right = trigrams(b);
  if (!left.size || !right.size) return 0;

  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / (left.size + right.size - shared);
}

export function lintSkills(tree, operations, options = {}) {
  const opts = { ...DEFAULT_LINT_OPTIONS, ...options };
  const violations = [];
  const add = (rule, file, id, message, extra = {}) => {
    violations.push({ rule, file, id, message, ...extra });
  };

  const registry = new Map(operations.map((op) => [op.id, op]));
  const opIds = new Set(tree.ops.map((op) => op.id));
  const knownIds = new Set([
    ...opIds,
    ...tree.mocs.map((moc) => moc.id),
    ...tree.concepts.map((concept) => concept.id),
    'index',
  ]);

  for (const operation of operations) {
    if (!opIds.has(operation.id)) {
      add('drift', `ops/${operation.id}.md`, operation.id, 'no file for this registry operation');
    }
  }

  for (const op of tree.ops) {
    const description = String(op.frontMatter.description ?? '').trim();
    const hasDescription = description.length > 0;

    if (!hasDescription) {
      // The description rules stop here, but nothing else does: an empty
      // description must not hide id drift, an unregistered op, or a broken
      // `related` target.
      add('missing-description', op.path, op.id, 'no description in frontmatter');
    } else if (description.length > opts.maxDescription) {
      add('too-long', op.path, op.id, `${description.length} characters (max ${opts.maxDescription})`);
    }

    const declaredId = String(op.frontMatter.id ?? '');
    if (declaredId !== op.id) {
      add('drift', op.path, op.id, `frontmatter id "${declaredId}" does not match the file name`);
    }

    const registered = registry.get(op.id);
    if (!registered) {
      add('drift', op.path, op.id, 'no operation with this id in the registry');
    } else if (hasDescription && String(registered.description ?? '') !== String(op.frontMatter.description ?? '')) {
      add('drift', op.path, op.id, 'frontmatter description differs from the registry');
    }
  }

  for (const concept of tree.concepts) {
    if (concept.frontMatterUnparsed) {
      add('drift', concept.path, concept.id, 'frontmatter block does not parse');
    }
    if (opIds.has(concept.id)) {
      add('drift', concept.path, concept.id, `concept id "${concept.id}" collides with an operation id`);
    }
  }

  // `related:` is the machine-readable twin of a body wikilink, so an op, a MOC,
  // and a concept all resolve it against the same id set.
  for (const document of [...tree.ops, ...tree.mocs, ...tree.concepts]) {
    for (const target of document.frontMatter.related ?? []) {
      if (!knownIds.has(String(target))) {
        add('broken-wikilink', document.path, document.id, `related:[${target}] resolves to nothing`, { target });
      }
    }
  }

  const described = tree.ops.filter((op) => String(op.frontMatter.description ?? '').trim());
  const normalized = described.map((op) => [op, normalizeDescription(op.frontMatter.description)]);
  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      const [left, leftText] = normalized[i];
      const [right, rightText] = normalized[j];
      if (!leftText || !rightText) continue;

      if (leftText === rightText) {
        add('duplicate', left.path, left.id, 'same description as another operation', { other: right.path });
        continue;
      }
      const similarity = trigramSimilarity(leftText, rightText);
      if (similarity >= opts.similarity) {
        add('near-duplicate', left.path, left.id, 'description is nearly the same as another operation', {
          other: right.path,
          similarity: Number(similarity.toFixed(3)),
        });
      }
    }
  }

  for (const file of tree.files) {
    for (const target of wikilinks(file.text)) {
      if (!knownIds.has(target)) {
        add('broken-wikilink', file.path, file.id, `[[${target}]] resolves to nothing`, { target });
      }
    }
  }

  const inSomeMoc = new Set(tree.mocs.flatMap((moc) => wikilinks(moc.text)));
  for (const op of tree.ops) {
    if (!inSomeMoc.has(op.id)) add('orphan', op.path, op.id, 'no MOC links this operation');
  }

  return violations;
}

/** Counts per rule, with every rule present so a report never hides a rule. */
export function summarizeViolations(violations) {
  const byRule = Object.fromEntries(RULES.map((rule) => [rule, 0]));
  for (const violation of violations) {
    byRule[violation.rule] = (byRule[violation.rule] ?? 0) + 1;
  }
  return { total: violations.length, byRule };
}
