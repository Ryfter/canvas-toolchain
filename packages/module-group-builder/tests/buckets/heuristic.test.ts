import { describe, it, expect } from 'vitest';
import { proposeMajorBuckets, bucketForMajor } from '../../src/buckets/heuristic.js';

describe('major bucket heuristic (Kevin\'s seed rules)', () => {
  it('classifies known majors', () => {
    expect(bucketForMajor('IT Management')).toBe('technical');
    expect(bucketForMajor('Business Analytics')).toBe('technical');
    expect(bucketForMajor('Information Systems')).toBe('technical');
    expect(bucketForMajor('Accounting')).toBe('quantitative');
    expect(bucketForMajor('Finance')).toBe('quantitative');
    expect(bucketForMajor('Economics')).toBe('quantitative');
    expect(bucketForMajor('Marketing')).toBe('creative');
    expect(bucketForMajor('General Business')).toBe('business');
    expect(bucketForMajor('Underwater Basket Weaving')).toBe('other');
  });
  it('proposeMajorBuckets returns a map + the "other" list over distinct majors', () => {
    const { map, other } = proposeMajorBuckets(['IT Management', 'Marketing', 'Philosophy', 'Marketing']);
    expect(map).toEqual({ 'IT Management': 'technical', Marketing: 'creative', Philosophy: 'other' });
    expect(other).toEqual(['Philosophy']);
  });
});
