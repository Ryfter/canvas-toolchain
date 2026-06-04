import { execFileSync } from 'node:child_process';
import { detectGitState } from './git_state.js';
import type { BackupStatus, SyncedFolderType } from './manifest_types.js';

/** Pattern-match the absolute path to a known sync folder. Case-insensitive
 *  substring with separator boundaries so "MyOneDriveExport" doesn't false-positive. */
export function detectSyncedFolder(courseDir: string): { type: SyncedFolderType } | null {
  const lower = courseDir.toLowerCase();
  const bounded = (s: string, term: string): boolean => {
    const t = term.toLowerCase();
    const idx = s.indexOf(t);
    if (idx === -1) return false;
    const before = idx === 0 ? '' : s[idx - 1];
    const after = s[idx + t.length] ?? '';
    const isBoundary = (c: string) => c === '' || c === '/' || c === '\\' || c === ':';
    return isBoundary(before) && isBoundary(after);
  };

  if (bounded(lower, 'onedrive')) return { type: 'OneDrive' };

  if (lower.includes('mobile documents/com~apple~clouddocs') ||
      lower.includes('mobile documents\\com~apple~clouddocs')) {
    return { type: 'iCloud' };
  }
  if (bounded(lower, 'icloud drive')) return { type: 'iCloud' };

  if (bounded(lower, 'dropbox')) return { type: 'Dropbox' };

  if (bounded(lower, 'google drive')) return { type: 'GoogleDrive' };
  if (bounded(lower, 'googledrive')) return { type: 'GoogleDrive' };

  if (courseDir.startsWith('\\\\')) return { type: 'NetworkShare' };

  if (courseDir.startsWith('/Volumes/')) return { type: 'ExternalMount' };

  if (courseDir.startsWith('/mnt/') || courseDir.startsWith('/media/')) {
    return { type: 'ExternalMount' };
  }

  return null;
}

/** Best-effort: returns true when local HEAD commit is also on a remote. */
function gitPushed(courseDir: string): boolean {
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: courseDir, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    const remoteRefs = execFileSync('git', ['branch', '-r', '--contains', head], { cwd: courseDir, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    return remoteRefs.length > 0;
  } catch {
    return false;
  }
}

export function detectBackupState(courseDir: string): BackupStatus {
  const git = detectGitState(courseDir);
  if (git.isRepo && git.remote) {
    if (git.clean && gitPushed(courseDir)) {
      return {
        status: 'git-pushed',
        message: `Backup verified: git commits pushed to ${git.remote}`,
        detected: { gitRemote: git.remote },
      };
    }
    if (git.clean) {
      return {
        status: 'git-committed',
        message: 'Local git is clean but unpushed. Run `git push` to back up off-machine.',
        detected: { gitRemote: git.remote },
      };
    }
    return {
      status: 'git-committed',
      message: 'Uncommitted changes in course folder. Commit and push before publishing.',
      detected: { gitRemote: git.remote },
    };
  }
  if (git.isRepo) {
    return {
      status: 'git-no-remote',
      message: 'Git initialized but no remote. Add a GitHub remote: `gh repo create`.',
      detected: {},
    };
  }

  const synced = detectSyncedFolder(courseDir);
  if (synced) {
    return {
      status: 'synced-folder',
      message: `Backup verified: course folder is inside ${synced.type} (auto-syncs).`,
      detected: { syncedFolderType: synced.type },
    };
  }

  return {
    status: 'none',
    message: 'No backup detected. Recommended: `git init` + push to GitHub, OR move course folder into OneDrive / iCloud / Dropbox / Google Drive / network share.',
    detected: {},
  };
}
