import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModuleContext } from '@canvas-toolchain/module-contract';
import videoModule from '../src/index.js';
import { setVideoContext } from '../src/tools.js';

const SECRET = 'super-secret-client-secret';
const CRED = {
  domain: 'example.hosted.panopto.com',
  clientId: 'cid',
  clientSecret: SECRET,
  iframeWhitelisted: null,
  configuredAt: '',
  lastValidatedAt: '',
};

let root: string;
let ctx: ModuleContext;
const tool = (name: string) => videoModule.tools.find((t) => t.schema.name === name)!;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'video-ctx-'));
  ctx = {
    moduleId: 'video',
    paths: {
      config: join(root, 'config'),
      data: join(root, 'data'),
      designStudioData: join(root, 'cds'),
      secrets: join(root, 'secrets'),
    },
    credentials: {
      get: vi.fn(async () => CRED),
      tryGet: vi.fn(async () => CRED),
    } as unknown as ModuleContext['credentials'],
  };
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  setVideoContext(undefined);
  vi.unstubAllGlobals();
  rmSync(root, { recursive: true, force: true });
});

describe('video module contract v2', () => {
  it('declares a required panopto credential', () => {
    expect(videoModule.contractVersion).toBe(2);
    expect(videoModule.credentials).toEqual([
      expect.objectContaining({ kind: 'panopto', required: true }),
    ]);
  });

  it.each(['video_search', 'video_embed', 'video_fetch_captions', 'setup_panopto', 'setup_panopto_vocab'])(
    '%s fails with MODULE_NOT_INITIALIZED before init',
    async (name) => {
      await expect(
        tool(name).handler({
          videoId: 'v', placement: 'inline', action: 'list', domain: 'd', clientId: 'c', clientSecret: 's',
        }),
      ).rejects.toThrow('MODULE_NOT_INITIALIZED');
    },
  );

  it('video_fetch_captions saves transcripts under ctx.paths.designStudioData and never leaks the secret', async () => {
    await videoModule.init!(ctx);
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ Language: 'en', FileUrl: 'https://example.hosted.panopto.com/c.vtt', IsDefault: true }],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello.\n',
      } as Response);
    const res = await tool('video_fetch_captions').handler({ videoId: 'vid-1', title: 'T' });
    const out = JSON.stringify(res);
    expect(out).toContain(join(root, 'cds', 'transcripts'));
    expect(readdirSync(join(root, 'cds', 'transcripts')).length).toBe(1);
    expect(out).not.toContain(SECRET);
  });

  it('setup_panopto writes the shared credential file under ctx.paths.secrets and does not echo the secret', async () => {
    await videoModule.init!(ctx);
    const res = await tool('setup_panopto').handler({
      domain: CRED.domain, clientId: 'cid', clientSecret: SECRET, test: false,
    });
    expect(JSON.stringify(res)).not.toContain(SECRET);
    const file = join(root, 'secrets', 'panopto-config.json');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf-8')).toContain(SECRET);
  });

  it('setup_panopto_vocab stores vocab under ctx.paths.config', async () => {
    await videoModule.init!(ctx);
    await tool('setup_panopto_vocab').handler({ action: 'add-filler', word: 'basically' });
    expect(existsSync(join(root, 'config', 'panopto-vocab.json'))).toBe(true);
  });
});
