import { afterEach, describe, expect, it } from 'vitest';
import { getCanvasBackupInvocation, isCanvasBackupConfigured } from '../../src/passthrough/downloader_tools.js';

const OLD_COMMAND = process.env.CANVAS_BACKUP_COMMAND;
const OLD_REPO = process.env.CANVAS_BACKUP_REPO;

afterEach(() => {
  if (OLD_COMMAND === undefined) delete process.env.CANVAS_BACKUP_COMMAND;
  else process.env.CANVAS_BACKUP_COMMAND = OLD_COMMAND;

  if (OLD_REPO === undefined) delete process.env.CANVAS_BACKUP_REPO;
  else process.env.CANVAS_BACKUP_REPO = OLD_REPO;
});

describe('Canvas Backup bridge', () => {
  it('uses CANVAS_BACKUP_COMMAND when configured', () => {
    process.env.CANVAS_BACKUP_COMMAND = 'custom-canvas-backup';
    const invocation = getCanvasBackupInvocation();
    expect(invocation.command).toBe('custom-canvas-backup');
    expect(invocation.baseArgs).toEqual([]);
    expect(isCanvasBackupConfigured()).toBe(true);
  });
});
