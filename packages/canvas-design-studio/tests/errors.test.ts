import { describe, expect, it } from 'vitest';
import { makeHelpUrl, formatError } from '../src/utils/errors.js';

describe('makeHelpUrl', () => {
  it('returns a chatgpt.com URL', () => {
    const url = makeHelpUrl('test error');
    expect(url).toMatch(/^https:\/\/chatgpt\.com\/\?q=/);
  });

  it('URL-encodes the context string', () => {
    const url = makeHelpUrl('401 Unauthorized');
    expect(url).toContain(encodeURIComponent('Canvas Design Studio error: 401 Unauthorized'));
  });

  it('prefixes context with "Canvas Design Studio error:"', () => {
    const url = makeHelpUrl('some problem');
    const decoded = decodeURIComponent(url.split('?q=')[1]);
    expect(decoded).toContain('Canvas Design Studio error:');
    expect(decoded).toContain('some problem');
  });
});

describe('formatError', () => {
  const params = {
    title: 'Canvas API — 401 Unauthorized',
    message: 'Your API token was rejected by Canvas.',
    cause: 'The token in institution.json is invalid, expired, or revoked.',
    fix: [
      'Log into Canvas → Account → Settings → Approved Integrations',
      'Delete the old token and generate a new one',
      'Run setup_institution and paste the new token',
    ],
    context: '401 Unauthorized Canvas API token rejected',
  };

  it('starts with ❌ and the title', () => {
    expect(formatError(params)).toMatch(/^❌ Canvas API — 401 Unauthorized/);
  });

  it('includes the message', () => {
    expect(formatError(params)).toContain('Your API token was rejected by Canvas.');
  });

  it('includes the cause line', () => {
    expect(formatError(params)).toContain('Cause: The token in institution.json is invalid');
  });

  it('numbers the fix steps starting at 1', () => {
    const output = formatError(params);
    expect(output).toContain('  1. Log into Canvas');
    expect(output).toContain('  2. Delete the old token');
    expect(output).toContain('  3. Run setup_institution');
  });

  it('includes the ChatGPT help URL', () => {
    expect(formatError(params)).toContain('▶ Get help: https://chatgpt.com/?q=');
  });

  it('includes the copy-prompt note', () => {
    expect(formatError(params)).toContain('Copy the prompt to use with any AI assistant.');
  });
});
