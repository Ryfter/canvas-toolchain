export interface StudentRecord {
  canvasId: string;
  pseudonym: string;
  major?: string;
  majorBucket?: string;
  metrics: Record<string, number>; // overallGrade, attendance, assignmentsCompleted, priorReview, ...
}

export type StrategyId =
  | 'random' | 'alphabetical' | 'weighted' | 'heterogeneous' | 'homogeneous' | 'major-diversity';

/** A grouping is an ordered list of groups; each group is a list of canvasId. */
export type Grouping = string[][];

export interface GroupSpec {
  groupSize?: number;   // target members per group
  groupCount?: number;  // OR target number of groups (exactly one of the two)
}

export interface ResolvedGroupSpec {
  groupCount: number;
  /** target size per group index; sizes differ by at most one */
  targetSizes: number[];
}

export interface Diagnostics {
  strategy: StrategyId;
  groupCount: number;
  sizes: number[];
  repeatPairs: Array<[string, string]>; // canvasId pairs that recurred from history
  unmappedMajors?: string[];
  missingPseudonyms?: string[];          // canvasIds with no roster pseudonym
  seed: number;
}
