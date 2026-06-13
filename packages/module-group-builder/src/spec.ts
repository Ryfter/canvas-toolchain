import type { GroupSpec, ResolvedGroupSpec } from './types.js';

export function resolveGroupSpec(spec: GroupSpec, studentCount: number): ResolvedGroupSpec {
  if (studentCount <= 0) throw new Error('Cannot form groups: no students.');
  const hasSize = typeof spec.groupSize === 'number';
  const hasCount = typeof spec.groupCount === 'number';
  if (hasSize === hasCount) throw new Error('Provide exactly one of groupSize or groupCount.');

  const groupCount = hasCount
    ? (spec.groupCount as number)
    : Math.max(1, Math.ceil(studentCount / (spec.groupSize as number)));
  if (groupCount > studentCount) throw new Error('More groups requested than students.');

  const base = Math.floor(studentCount / groupCount);
  const extra = studentCount % groupCount;
  const targetSizes = Array.from({ length: groupCount }, (_, i) => base + (i < extra ? 1 : 0));
  return { groupCount, targetSizes };
}
