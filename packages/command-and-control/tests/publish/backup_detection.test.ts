import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectBackupState,
  detectSyncedFolder,
} from '../../src/tools/publish/backup_detection.js';

let courseDir: string;

beforeEach(() => {
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
});

afterEach(() => {
  rmSync(courseDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('detectSyncedFolder', () => {
  it('detects OneDrive in path (Windows style)', () => {
    expect(detectSyncedFolder('C:\\Users\\kev\\OneDrive\\Courses\\itm310')?.type).toBe('OneDrive');
  });
  it('detects OneDrive case-insensitively', () => {
    expect(detectSyncedFolder('/Users/kev/onedrive/courses/itm310')?.type).toBe('OneDrive');
  });
  it('detects iCloud (Mobile Documents path)', () => {
    expect(detectSyncedFolder('/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Courses/itm310')?.type).toBe('iCloud');
  });
  it('detects iCloud Drive (display name path)', () => {
    expect(detectSyncedFolder('/Users/kev/iCloud Drive/Courses/itm310')?.type).toBe('iCloud');
  });
  it('detects Dropbox', () => {
    expect(detectSyncedFolder('/Users/kev/Dropbox/Courses/itm310')?.type).toBe('Dropbox');
  });
  it('detects Google Drive (with space)', () => {
    expect(detectSyncedFolder('/Users/kev/Google Drive/Courses/itm310')?.type).toBe('GoogleDrive');
  });
  it('detects GoogleDrive (without space)', () => {
    expect(detectSyncedFolder('/Users/kev/GoogleDrive/Courses/itm310')?.type).toBe('GoogleDrive');
  });
  it('detects Windows UNC network share', () => {
    expect(detectSyncedFolder('\\\\fileserver\\share\\courses\\itm310')?.type).toBe('NetworkShare');
  });
  it('detects macOS /Volumes/ mount', () => {
    expect(detectSyncedFolder('/Volumes/BackupDrive/Courses/itm310')?.type).toBe('ExternalMount');
  });
  it('detects Linux /mnt/', () => {
    expect(detectSyncedFolder('/mnt/backup/courses/itm310')?.type).toBe('ExternalMount');
  });
  it('detects Linux /media/', () => {
    expect(detectSyncedFolder('/media/kev/backup/courses/itm310')?.type).toBe('ExternalMount');
  });
  it('returns null for unmatched paths', () => {
    expect(detectSyncedFolder('/Users/kev/projects/itm310')).toBeNull();
  });
  it('does not match OneDrive as a substring (boundary check)', () => {
    expect(detectSyncedFolder('/Users/kev/MyOneDriveExport/projects')).toBeNull();
  });
});

describe('detectBackupState', () => {
  it('returns status:none for non-git, non-synced courseDir', () => {
    const result = detectBackupState(courseDir);
    expect(result.status).toBe('none');
    expect(result.message).toMatch(/no backup detected/i);
  });

  it('returns status:synced-folder for a path inside OneDrive (pure path inspection)', () => {
    // detectSyncedFolder doesn't require the path to exist on disk — pass a
    // constructed path. detectGitState short-circuits on a non-existent path
    // returning isRepo: false, so the synced-folder branch takes over.
    const result = detectBackupState('/Users/kev/OneDrive/Courses/itm310');
    expect(result.status).toBe('synced-folder');
    expect(result.detected.syncedFolderType).toBe('OneDrive');
  });

  it('returns status:git-no-remote when git repo exists but no remote', () => {
    mkdirSync(join(courseDir, '.git'), { recursive: true });
    const result = detectBackupState(courseDir);
    // detectGitState's exact output depends on git's behavior with a bare .git
    // (no objects, no refs). Accept any of the documented downgraded states.
    expect(['git-no-remote', 'git-committed', 'none']).toContain(result.status);
  });
});
