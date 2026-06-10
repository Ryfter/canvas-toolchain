import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProfile, type InstitutionProfile } from '../discovery/profile.js';
import { buildSubmissionPayload, renderIssueBody, renderIssueTitle } from '../feedback/submission.js';

export interface SubmitUsageFeedbackInput {
  named?: boolean;
  confirm?: boolean;
}

export interface GhRunner {
  /** True iff gh is installed AND authenticated. */
  available(): Promise<boolean>;
  /** Create the issue; resolve to its URL. Throws on failure. */
  createIssue(args: { title: string; body: string; label: string }): Promise<string>;
}

export interface SubmitDeps {
  load: () => InstitutionProfile;
  gh: GhRunner;
}

export type SubmitUsageFeedbackResult =
  | { ok: true; stage: 'review'; named: boolean; title: string; body: string; note: string }
  | { ok: true; stage: 'submitted'; issueUrl: string }
  | { ok: false; error: string; message: string; fix: string[] };

const FEEDBACK_LABEL = 'usage-feedback';

const execFileAsync = promisify(execFile);

/** GitHub repo the feedback issues are filed against. */
export const FEEDBACK_REPO = 'Ryfter/canvas-toolchain';

/** Build the real gh-backed runner for a given repo slug. */
export function makeGhRunner(repo: string): GhRunner {
  return {
    async available(): Promise<boolean> {
      try {
        await execFileAsync('gh', ['auth', 'status']);
        return true;
      } catch {
        return false;
      }
    },
    async createIssue({ title, body, label }): Promise<string> {
      const file = join(tmpdir(), `ctk-usage-feedback-${process.pid}-${Date.now()}.md`);
      await writeFile(file, body, { encoding: 'utf-8', mode: 0o600 });
      try {
        const { stdout } = await execFileAsync('gh', [
          'issue', 'create',
          '--repo', repo,
          '--title', title,
          '--label', label,
          '--body-file', file,
        ]);
        const url = stdout.trim().split('\n').filter(Boolean).pop() ?? '';
        if (!/^https?:\/\//.test(url)) throw new Error(`Unexpected gh output: ${stdout.trim()}`);
        return url;
      } finally {
        await unlink(file).catch(() => {});
      }
    },
  };
}

const defaultDeps: SubmitDeps = {
  load: () => loadProfile(),
  gh: makeGhRunner(FEEDBACK_REPO),
};

export async function submitUsageFeedback(
  input: SubmitUsageFeedbackInput = {},
  deps: SubmitDeps = defaultDeps,
): Promise<SubmitUsageFeedbackResult> {
  const profile = deps.load();
  if (!profile.tools || profile.tools.length === 0) {
    return {
      ok: false,
      error: 'NO_PROFILE',
      message: 'No institution profile with tools was found.',
      fix: ['Run discover_tools, then save_institution_profile, before submitting feedback.'],
    };
  }

  const payload = buildSubmissionPayload(profile, { named: input.named });
  const title = renderIssueTitle(payload);
  const body = renderIssueBody(payload);

  if (input.confirm !== true) {
    return {
      ok: true,
      stage: 'review',
      named: payload.named,
      title,
      body,
      note: 'Review the body above. Call again with confirm:true to submit it as a public GitHub issue.',
    };
  }

  if (!(await deps.gh.available())) {
    return {
      ok: false,
      error: 'GH_UNAVAILABLE',
      message: 'GitHub CLI (gh) was not found or is not authenticated.',
      fix: ['Install gh from https://cli.github.com', 'Run `gh auth login`', 'Then retry with confirm:true.'],
    };
  }

  try {
    const issueUrl = await deps.gh.createIssue({ title, body, label: FEEDBACK_LABEL });
    return { ok: true, stage: 'submitted', issueUrl };
  } catch (err) {
    return {
      ok: false,
      error: 'GH_SUBMIT_FAILED',
      message: err instanceof Error ? err.message : String(err),
      fix: ['Inspect the gh error above', 'Verify repo access', 'Retry with confirm:true.'],
    };
  }
}
