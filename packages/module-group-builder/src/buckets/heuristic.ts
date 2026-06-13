export type Bucket = 'technical' | 'quantitative' | 'creative' | 'business' | 'other';

const RULES: Array<{ bucket: Bucket; patterns: RegExp[] }> = [
  { bucket: 'technical', patterns: [/\bit\b/i, /information (systems|technology)/i, /\banalytics\b/i, /data\b/i, /computer/i] },
  { bucket: 'quantitative', patterns: [/account/i, /financ/i, /econ/i, /statistic/i] },
  { bucket: 'creative', patterns: [/market/i, /communicat/i, /design/i, /media/i, /art/i] },
  { bucket: 'business', patterns: [/general business/i, /\bmanagement\b/i, /\bbusiness\b/i, /entrepreneur/i] },
];

export function bucketForMajor(major: string): Bucket {
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(major))) return rule.bucket;
  }
  return 'other';
}

export function proposeMajorBuckets(majors: string[]): { map: Record<string, Bucket>; other: string[] } {
  const distinct = [...new Set(majors.map((m) => m.trim()).filter(Boolean))];
  const map: Record<string, Bucket> = {};
  const other: string[] = [];
  for (const m of distinct) {
    const b = bucketForMajor(m);
    map[m] = b;
    if (b === 'other') other.push(m);
  }
  return { map, other };
}
