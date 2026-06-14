import { describe, it, expect } from 'vitest';
import { parseCsv, rowsFromCsv } from '../src/peoplesoft/parse.js';
import type { ColumnMapping } from '../src/types.js';

const map: ColumnMapping = {
  studentNumber: 'Student ID', email: 'Email', userId: 'NetID', name: 'Name',
  major: 'Plan', secondMajor: 'Plan 2',
};

const csv = [
  'Student ID,Email,NetID,Name,Plan,Plan 2',
  '100,a@x.edu,jdoe,"Doe, Jane",Bus Admin: Marketing,',
  '101,b@x.edu,bsmith,"Smith, Bob",Business Analytics,Accounting',
].join('\n');

describe('peoplesoft parse', () => {
  it('parseCsv splits rows and honors quoted commas', () => {
    const { headers, records } = parseCsv(csv);
    expect(headers).toEqual(['Student ID', 'Email', 'NetID', 'Name', 'Plan', 'Plan 2']);
    expect(records[0]['Name']).toBe('Doe, Jane');
    expect(records).toHaveLength(2);
  });

  it('rowsFromCsv maps columns to PeopleSoftRow', () => {
    const rows = rowsFromCsv(csv, map);
    expect(rows[0]).toEqual({
      studentNumber: '100', email: 'a@x.edu', userId: 'jdoe', name: 'Doe, Jane',
      rawMajor: 'Bus Admin: Marketing', secondMajor: undefined,
    });
    expect(rows[1].secondMajor).toBe('Accounting');
  });

  it('throws a clear error when a required mapped column is absent', () => {
    const bad: ColumnMapping = { ...map, studentNumber: 'Missing' };
    expect(() => rowsFromCsv(csv, bad)).toThrow(/Missing/);
  });
});
