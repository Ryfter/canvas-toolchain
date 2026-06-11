import { describe, expect, it } from 'vitest';
import { validateWorksheetTool } from '../src/tools/validate-worksheet.js';

describe('validateWorksheetTool', () => {
  it('returns valid message for a worksheet with no errors', () => {
    const worksheet = [
      '## Primary Brand Color',
      '',
      'Your answer (6-digit hex): #0033A0',
      '',
      '## Canvas Base URL',
      '',
      'Your answer: https://example.instructure.com',
    ].join('\n');
    expect(validateWorksheetTool(worksheet)).toContain('✓ Worksheet valid');
  });

  it('returns error message containing the bad value when hex is invalid', () => {
    const worksheet = [
      '## Primary Brand Color',
      '',
      'Your answer (6-digit hex): GGGGGG',
    ].join('\n');
    const result = validateWorksheetTool(worksheet);
    expect(result).toContain('❌');
    expect(result).toContain('GGGGGG');
  });

  it('returns valid with 0 field(s) parsed for empty worksheet', () => {
    expect(validateWorksheetTool('')).toContain('✓ Worksheet valid — 0 field(s) parsed');
  });

  it('returns 2 error(s) count and both bad values for a worksheet with two errors', () => {
    const worksheet = [
      '## Primary Brand Color',
      '',
      'Your answer (6-digit hex): GGGGGG',
      '',
      '## Canvas Base URL',
      '',
      'Your answer: example.instructure.com',
    ].join('\n');
    const result = validateWorksheetTool(worksheet);
    expect(result).toContain('2 error(s)');
    expect(result).toContain('GGGGGG');
    expect(result).toContain('example.instructure.com');
  });
});
