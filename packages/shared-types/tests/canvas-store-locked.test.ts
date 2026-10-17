import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// #151 R7 review fix 9: Windows fails a rename over a file an indexer, antivirus
// or another MCP host has open with EPERM/EBUSY. The store writer retries those
// briefly, and a persistent failure gets a clear, actionable error instead of a
// raw fs exception — and never leaves its temp file behind.
const state = vi.hoisted(() => ({ failTimes: 0, calls: 0, code: 'EBUSY' }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: (from: string, to: string) => {
      state.calls++;
      if (state.calls <= state.failTimes) {
        throw Object.assign(new Error('rename refused'), { code: state.code });
      }
      return actual.renameSync(from, to);
    },
  };
});

const { writeCanvasConfig } = await import('../src/canvas-store.js');

let ccHome: string;
const tmpFiles = (): string[] => readdirSync(ccHome).filter((name) => name.endsWith('.tmp'));

beforeEach(() => {
  state.failTimes = 0;
  state.calls = 0;
  state.code = 'EBUSY';
  ccHome = mkdtempSync(join(tmpdir(), 'canvas-store-busy-'));
  process.env.CC_HOME = ccHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(ccHome, { recursive: true, force: true });
});

describe('writing a Canvas store over a locked file', () => {
  it('retries a transient EPERM/EBUSY until the rename goes through', () => {
    state.failTimes = 2;

    writeCanvasConfig({ host: 'example.instructure.com', token: 'tok' });

    expect(state.calls).toBe(3);
    expect(tmpFiles()).toEqual([]);
  });

  it('reports a persistent lock clearly, with no temp file left behind', () => {
    state.code = 'EPERM';
    state.failTimes = 99;

    expect(() => writeCanvasConfig({ host: 'example.instructure.com', token: 'tok' }))
      .toThrow(/CANVAS_STORE_WRITE_BLOCKED/);
    expect(tmpFiles()).toEqual([]);
  });

  it('does not retry (or claim a lock) for a failure of another kind', () => {
    state.code = 'ENOSPC';
    state.failTimes = 99;

    expect(() => writeCanvasConfig({ host: 'example.instructure.com', token: 'tok' }))
      .toThrow(/CANVAS_STORE_WRITE_FAILED/);
    expect(state.calls).toBe(1);
    expect(tmpFiles()).toEqual([]);
  });
});
