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

// Real gh runner is wired in a later task. Until then this stub is never reached (all tests inject gh).
const notWired: GhRunner = {
  available: async () => false,
  createIssue: async () => {
    throw new Error('gh runner not wired');
  },
};

const defaultDeps: SubmitDeps = {
  load: () => loadProfile(),
  gh: notWired,
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
