import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectGitState, gitCommitPrePublish, gitTagSuccess } from '../../../src/tools/publish/git_state.js';

function gitAvailable(): boolean {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

const itGit = gitAvailable() ? it : it.skip;

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gs-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('detectGitState', () => {
  it('reports non-repo when directory has no git', () => {
    expect(detectGitState(dir)).toEqual({ isRepo: false, nudge: 'init-suggested' });
  });

  itGit('reports clean repo with no remote', () => {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir });
    writeFileSync(join(dir, 'a.txt'), 'x');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
    const s = detectGitState(dir);
    expect(s.isRepo).toBe(true);
    expect(s.clean).toBe(true);
    expect(s.remote).toBeUndefined();
  });

  itGit('reports dirty tree with warn nudge', () => {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir });
    writeFileSync(join(dir, 'a.txt'), 'x');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
    writeFileSync(join(dir, 'a.txt'), 'y');
    const s = detectGitState(dir);
    expect(s.clean).toBe(false);
    expect(s.nudge).toBe('dirty-tree-warning');
  });

  itGit('gitCommitPrePublish creates a commit then gitTagSuccess applies a tag', () => {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir });
    writeFileSync(join(dir, 'a.txt'), 'x');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
    writeFileSync(join(dir, 'a.txt'), 'y');
    gitCommitPrePublish(dir, 'publish_course: pre-publish snapshot');
    const log = execFileSync('git', ['log', '--oneline'], { cwd: dir }).toString();
    expect(log).toContain('pre-publish snapshot');
    gitTagSuccess(dir, 'published-test');
    const tags = execFileSync('git', ['tag'], { cwd: dir }).toString();
    expect(tags).toContain('published-test');
  });
});
