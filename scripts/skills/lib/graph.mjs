/**
 * Pure projections of the operation list onto the graph: which MOC owns an
 * operation, and which operations are seeded as `related`.
 *
 * Everything here is a function of its arguments — no filesystem, no registry
 * import — so the rules are directly testable and the CLIs stay thin.
 */

/** The sidecar tool's MOC id. Advanced operations have no intent tool to file under. */
export const ADVANCED_MOC_ID = 'ct_advanced';

/**
 * The MOCs an operation belongs to, in emission order. Total by construction:
 * every operation has a section, so nothing can be an orphan.
 */
export function mocIdsFor(op) {
  if (op.exposure === 'intent' && op.intentTool) return [op.intentTool, op.section];
  if (op.exposure === 'advanced') return [ADVANCED_MOC_ID, op.section];
  return [op.section];
}

/**
 * Build every MOC: one per intent tool, one for ct_advanced, one per section.
 * Declared-but-empty MOCs are kept — a section with no operations yet is still
 * a place an agent looks.
 */
export function assignMocs(source) {
  const { operations, sections, intentTools } = source;

  const intentMocs = intentTools.map((tool) => ({
    id: tool.id,
    kind: 'intent',
    description: tool.summary,
    related: [tool.extendedBy],
  }));

  const advancedMoc = {
    id: ADVANCED_MOC_ID,
    kind: 'advanced',
    description: 'Less common operations, reached through ct_advanced describe/run.',
    related: sections
      .filter((s) => operations.some((o) => o.exposure === 'advanced' && o.section === s.id))
      .map((s) => s.id),
  };

  const sectionMocs = sections.map((section) => {
    const reachableBy = intentTools
      .filter((tool) => operations.some((o) => o.exposure === 'intent' && o.intentTool === tool.id && o.section === section.id))
      .map((tool) => tool.id);
    const hasAdvanced = operations.some((o) => o.exposure === 'advanced' && o.section === section.id);
    return {
      id: section.id,
      kind: 'section',
      description: section.description,
      related: hasAdvanced ? [...reachableBy, ADVANCED_MOC_ID] : reachableBy,
    };
  });

  const mocs = [...intentMocs, advancedMoc, ...sectionMocs];
  for (const moc of mocs) {
    moc.opIds = operations
      .filter((op) => mocIdsFor(op).includes(moc.id))
      .map((op) => op.id);
  }
  return mocs;
}

/**
 * Seed `related` deterministically: same intent tool first (the "what else can
 * I do from here" edge), else the same section. Capped so a 34-operation
 * section cannot produce an unusable link farm, and never includes self.
 */
export function seedRelated(operations, { max = 8 } = {}) {
  const related = new Map();
  for (const op of operations) {
    const pool = op.intentTool
      ? operations.filter((o) => o.intentTool === op.intentTool)
      : operations.filter((o) => o.section === op.section);
    related.set(op.id, pool.filter((o) => o.id !== op.id).map((o) => o.id).slice(0, max));
  }
  return related;
}
