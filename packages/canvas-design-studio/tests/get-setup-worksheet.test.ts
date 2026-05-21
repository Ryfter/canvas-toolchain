import { describe, expect, it } from 'vitest';
import { getSetupWorksheet } from '../src/tools/get-setup-worksheet.js';

describe('getSetupWorksheet', () => {
  it('returns content containing the Institution Name section', () => {
    expect(getSetupWorksheet()).toContain('## Institution Name');
  });

  it('returns content containing the Teaching Philosophy section', () => {
    expect(getSetupWorksheet()).toContain('## Teaching Philosophy');
  });

  it('returns content containing the AI-host instruction prefix', () => {
    expect(getSetupWorksheet()).toContain('For AI hosts:');
  });
});
