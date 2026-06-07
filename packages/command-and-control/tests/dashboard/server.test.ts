import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDashboardServer } from '../../src/dashboard/server.js';

let coursesRoot: string;
let stopFn: (() => Promise<void>) | null = null;

beforeEach(() => { coursesRoot = mkdtempSync(join(tmpdir(), 'srv-')); });
afterEach(async () => {
  if (stopFn) { await stopFn(); stopFn = null; }
  rmSync(coursesRoot, { recursive: true, force: true });
});

describe('startDashboardServer', () => {
  it('starts the server on an auto-assigned port and serves the course health page', async () => {
    const { url, stop } = await startDashboardServer({ coursesRoot });
    stopFn = stop;

    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Course Health');
    expect(body).toContain('No courses found');
  });

  it('returns 404 for unknown paths', async () => {
    const { url, stop } = await startDashboardServer({ coursesRoot });
    stopFn = stop;
    const res = await fetch(`${url}nonexistent`);
    expect(res.status).toBe(404);
  });

  it('stops cleanly when stop() called', async () => {
    const { url, stop } = await startDashboardServer({ coursesRoot });
    await stop();
    stopFn = null;
    await expect(fetch(url)).rejects.toThrow();
  });
});
