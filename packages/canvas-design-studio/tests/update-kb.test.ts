import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import os from 'os';

const TMP_KB = join(os.tmpdir(), 'canvas-mcp-test-kb-' + process.pid);

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return { ...actual, default: { ...actual, homedir: () => TMP_KB } };
});

const MOCK_SANITIZE_SOURCE = `
ALLOWED_ELEMENTS = %w[
  a abbr address article aside b blockquote br caption
  cite code col colgroup dd del details dfn div dl dt
  em figcaption figure footer h2 h3 h4 h5 h6 hr i
  img ins kbd li mark nav ol p pre q rp rt ruby s
  samp section small span strong sub summary sup table
  tbody td tfoot th thead time tr u ul var wbr
].freeze

ALLOWED_CSS_PROPERTIES = %w[
  background-color border border-color border-radius border-style
  border-width color display font-family font-size font-style
  font-weight height line-height list-style-type margin margin-bottom
  margin-left margin-right margin-top max-width min-height min-width
  padding padding-bottom padding-left padding-right padding-top
  text-align text-decoration text-indent text-transform vertical-align
  white-space width word-break
].freeze
`;

describe('updateCanvasKb', () => {
  beforeEach(() => {
    mkdirSync(TMP_KB, { recursive: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => MOCK_SANITIZE_SOURCE,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (existsSync(TMP_KB)) rmSync(TMP_KB, { recursive: true, force: true });
  });

  it('fetches and parses allowlist on first run', async () => {
    const { updateCanvasKb } = await import('../src/tools/update-kb.js');
    const result = await updateCanvasKb(true);
    expect(result.updated).toBe(true);
    expect(result.cssPropsCount).toBeGreaterThan(0);
    expect(result.htmlTagsCount).toBeGreaterThan(0);
    expect(result.parseWarning).toBeUndefined();
  });

  it('detects no changes on second run with same source', async () => {
    const { updateCanvasKb } = await import('../src/tools/update-kb.js');
    await updateCanvasKb(true);
    const result = await updateCanvasKb(true);
    expect(result.changes).toHaveLength(0);
  });

  it('skips fetch if checked within 24h and not forced', async () => {
    const { updateCanvasKb } = await import('../src/tools/update-kb.js');
    await updateCanvasKb(true);
    const result = await updateCanvasKb(false);
    expect(result.updated).toBe(false);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('handles fetch failure gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' }));
    const { updateCanvasKb } = await import('../src/tools/update-kb.js');
    await expect(updateCanvasKb(true)).rejects.toThrow('HTTP 503');
  });

  it('returns parseWarning when source format is unrecognized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '# unrecognized format\nno ruby arrays here',
    }));
    const { updateCanvasKb } = await import('../src/tools/update-kb.js');
    const result = await updateCanvasKb(true);
    expect(result.parseWarning).toBeDefined();
  });
});
