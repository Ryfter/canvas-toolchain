// src/tools/quiz/validate.ts
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import type {
  DifficultyMix,
  LiveQuizPayload,
  QuizFinding,
  QuizHorizonPass,
  QuizItem,
  QuizValidateSource,
  QuizValidationReport,
  QuizValidationVerdict,
  WeekProvenance,
} from './types.js';
import { realizeMixFromItems } from './mix.js';
import { dateInWeekWindow } from './weeks_bridge.js';
import { QUIZ_TRIAGE_SYSTEM_PROMPT, buildQuizTriageUserPrompt } from './prompts.js';

export interface ValidateQuizItemsInput {
  source: QuizValidateSource;
  courseId?: string;
  quizId?: string;
  path?: string;
  live?: LiveQuizPayload;
  items?: QuizItem[];
  horizonPass?: QuizHorizonPass;
  asOfDate?: string;
  weekNumber?: number;
  weekStartMonday?: string;
  weekProvenance?: WeekProvenance;
  expectedMix?: DifficultyMix;
  topicHints?: string[];
  llmTriage?: boolean;
}

export interface ValidateQuizItemsDeps {
  llm?: LlmClient;
}

function normalizeStem(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function letterChoicesOk(item: QuizItem): boolean {
  if (!item.type?.includes('multiple_choice')) return true;
  const n = item.choices?.length ?? 0;
  return n === 4;
}

function keyValid(item: QuizItem): boolean {
  if (item.key == null || item.key === '') return false;
  if (Array.isArray(item.key)) return item.key.length > 0;
  if (item.type?.includes('true_false')) {
    const k = String(item.key).toLowerCase();
    return k === 'true' || k === 'false';
  }
  if (item.choices?.length) {
    const letters = item.choices.map((_, i) => String.fromCharCode(65 + i));
    return letters.includes(String(item.key).toUpperCase());
  }
  return true;
}

export function deterministicFindings(input: ValidateQuizItemsInput): QuizFinding[] {
  const findings: QuizFinding[] = [];
  const live = input.live;
  const items = input.items ?? live?.items ?? [];
  const meta = live?.meta;

  if (live?.newQuizzesLimited) {
    findings.push({
      code: 'NEW_QUIZZES_LIMITED',
      severity: 'suggestion',
      message: 'This quiz appears to be New Quizzes or otherwise limited — item bodies may be incomplete.',
      fixHint: 'Review the quiz in Canvas UI; Classic Quizzes expose questions via the API.',
    });
  }

  // Inverse of NEW_QUIZZES_LIMITED: Classic-only advisory about Canvas auto-migration.
  if (live && !live.newQuizzesLimited) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      const qid = it.id ?? String(i + 1);
      if (it.type === 'multiple_dropdowns_question') {
        findings.push({
          code: 'MIGRATION_RISK',
          severity: 'warning',
          questionId: qid,
          message: `Question ${qid} is Multiple Dropdowns. After Canvas migrates this quiz to New Quizzes, it will display as Fill in the Blank.`,
          fixHint: 'Rebuild this question as Fill in the Blank before migrating.',
        });
      }
      if (it.type === 'fill_in_multiple_blanks_question') {
        findings.push({
          code: 'MIGRATION_RISK',
          severity: 'warning',
          questionId: qid,
          message: `Question ${qid} is Fill in Multiple Blanks. Third-party reports (not Instructure's official guide) say this becomes Fill in the Blank after migration — less certain than Multiple Dropdowns.`,
          fixHint: 'Rebuild this question as Fill in the Blank before migrating if you need to keep control of the wording.',
        });
      }
    }
    if ((meta?.quizType ?? '').toLowerCase() === 'practice_quiz') {
      findings.push({
        code: 'MIGRATION_RISK',
        severity: 'warning',
        message: 'This is a practice quiz. After migration to New Quizzes it becomes zero points possible and is hidden from the Gradebook and Grades page.',
        fixHint: 'If students need to see scores in Grades, change it to a graded quiz before migrating.',
      });
    }
  }

  if (live && !live.itemsAvailable) {
    findings.push({
      code: 'ITEMS_UNAVAILABLE',
      severity: 'suggestion',
      message: 'Canvas returned no question bodies for this quiz.',
      fixHint: 'Confirm Classic Quizzes API access, or review items manually in Canvas.',
    });
  }

  const count = meta?.questionCount ?? items.length;
  if ((meta?.published || (meta?.dueAt != null)) && count === 0 && items.length === 0) {
    findings.push({
      code: 'EMPTY_QUIZ',
      severity: 'error',
      message: 'Quiz has zero questions but is published or has a due date.',
      fixHint: 'Add questions in Canvas before students open the quiz.',
    });
  }

  const stems = new Map<string, string>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const qid = it.id ?? String(i + 1);
    if (!it.stem?.trim()) {
      findings.push({
        code: 'EMPTY_STEM',
        severity: 'error',
        questionId: qid,
        message: `Question ${qid} has an empty stem.`,
      });
    }
    if (it.choices?.some((c) => !String(c).trim())) {
      findings.push({
        code: 'EMPTY_CHOICE',
        severity: 'error',
        questionId: qid,
        message: `Question ${qid} has an empty choice.`,
      });
    }
    if (!keyValid(it)) {
      findings.push({
        code: 'MISSING_KEY',
        severity: 'error',
        questionId: qid,
        message: `Question ${qid} is missing a valid answer key.`,
        fixHint: 'Set a correct answer in Canvas.',
      });
    }
    if (!letterChoicesOk(it)) {
      findings.push({
        code: 'CHOICE_COUNT',
        severity: 'warning',
        questionId: qid,
        message: `Question ${qid} MCQ does not have 4 choices (found ${it.choices?.length ?? 0}).`,
      });
    }
    const norm = normalizeStem(it.stem ?? '');
    if (norm) {
      const prev = stems.get(norm);
      if (prev) {
        findings.push({
          code: 'DUPLICATE_STEM',
          severity: 'error',
          questionId: qid,
          message: `Question ${qid} stem duplicates question ${prev}.`,
        });
      } else {
        stems.set(norm, qid);
      }
    }
  }

  if (meta?.pointsPossible != null && items.length > 0) {
    const sum = items.reduce((acc, it) => acc + (typeof it.points === 'number' ? it.points : 0), 0);
    if (sum > 0 && Math.abs(sum - meta.pointsPossible) > 0.01) {
      findings.push({
        code: 'POINTS_MISMATCH',
        severity: 'warning',
        message: `Quiz points_possible (${meta.pointsPossible}) ≠ sum of item points (${sum}).`,
      });
    }
  }

  if (meta) {
    const due = meta.dueAt?.slice(0, 10);
    const unlock = meta.unlockAt?.slice(0, 10);
    const lock = meta.lockAt?.slice(0, 10);
    if (due && unlock && due < unlock) {
      findings.push({
        code: 'SCHEDULE_INCONSISTENT',
        severity: 'warning',
        message: `Quiz due_at (${due}) is before unlock_at (${unlock}).`,
        fixHint: 'Fix unlock/due order in Canvas.',
      });
    }
    if (due && lock && lock < due) {
      findings.push({
        code: 'SCHEDULE_INCONSISTENT',
        severity: 'warning',
        message: `Quiz lock_at (${lock}) is before due_at (${due}).`,
        fixHint: 'Fix lock/due order in Canvas.',
      });
    }
    if (meta.dueAt && meta.published === false) {
      findings.push({
        code: 'PUBLISH_STATE',
        severity: 'warning',
        message: 'Quiz has a due date but is unpublished.',
        fixHint: 'Publish the quiz before students need it, or clear the due date.',
      });
    }
  }

  if (input.weekStartMonday && meta) {
    for (const [label, iso] of [
      ['due_at', meta.dueAt],
      ['unlock_at', meta.unlockAt],
      ['lock_at', meta.lockAt],
    ] as const) {
      if (iso && !dateInWeekWindow(iso, input.weekStartMonday)) {
        findings.push({
          code: 'WEEK_MAP_MISMATCH',
          severity: 'warning',
          message: `Quiz ${label} (${iso.slice(0, 10)}) falls outside professor week Mon–Sun starting ${input.weekStartMonday}.`,
          fixHint: 'Align Canvas dates with the week map, or adjust weekMapOverrides.',
        });
      }
    }
  }

  if (input.horizonPass === 'secondary') {
    findings.push({
      code: 'HORIZON_SECONDARY',
      severity: 'suggestion',
      message: 'Lighter second-look pass (secondaryWeek) — deep LLM triage skipped by default.',
    });
  }

  return findings;
}

function verdictFrom(findings: QuizFinding[]): QuizValidationVerdict {
  if (findings.some((f) => f.severity === 'error')) return 'needs-fixes';
  // New Quizzes / missing bodies → professor must review in Canvas UI
  if (findings.some((f) => f.code === 'NEW_QUIZZES_LIMITED' || f.code === 'ITEMS_UNAVAILABLE')) {
    return 'needs-review';
  }
  if (findings.some((f) => f.severity === 'warning')) return 'needs-review';
  // suggestions alone → ok (advisory polish)
  return 'ok';
}

function parseTriageFindings(raw: string): QuizFinding[] {
  let t = raw.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  const arr = (parsed as { findings?: unknown }).findings;
  if (!Array.isArray(arr)) return [];
  const allowed = new Set(['AMBIGUOUS_KEY', 'WEAK_DISTRACTOR', 'COVERAGE_GAP']);
  return arr.flatMap((f) => {
    if (!f || typeof f !== 'object') return [];
    const o = f as Record<string, unknown>;
    const code = String(o.code ?? '');
    if (!allowed.has(code)) return [];
    return [{
      code,
      severity: (o.severity === 'suggestion' ? 'suggestion' : 'warning') as QuizFinding['severity'],
      questionId: o.questionId != null ? String(o.questionId) : undefined,
      message: String(o.message ?? code),
      fixHint: o.fixHint != null ? String(o.fixHint) : undefined,
    }];
  });
}

export async function runQuizTriage(
  items: QuizItem[],
  deps: ValidateQuizItemsDeps,
  topicHints?: string[],
): Promise<QuizFinding[]> {
  if (!deps.llm || items.length === 0) return [];
  const user = buildQuizTriageUserPrompt(items, topicHints);
  const response = await deps.llm.complete(QUIZ_TRIAGE_SYSTEM_PROMPT, user, { maxTokens: 2048 });
  return parseTriageFindings(response.text);
}

export async function validateQuizItems(
  input: ValidateQuizItemsInput,
  deps: ValidateQuizItemsDeps = {},
): Promise<QuizValidationReport> {
  const items = input.items ?? input.live?.items ?? [];
  const findings = deterministicFindings(input);

  const wantTriage =
    input.llmTriage === true ||
    (input.llmTriage !== false && (input.horizonPass ?? 'primary') === 'primary');

  if (wantTriage && input.live?.itemsAvailable !== false) {
    const triaged = await runQuizTriage(items, deps, input.topicHints);
    findings.push(...triaged);
  }

  const realizedMix = items.some((i) => i.difficulty) ? realizeMixFromItems(items) : undefined;
  const verdict = verdictFrom(findings);
  const errN = findings.filter((f) => f.severity === 'error').length;
  const warnN = findings.filter((f) => f.severity === 'warning').length;
  const summary =
    verdict === 'ok'
      ? `Quiz looks fine (${findings.length} suggestion(s)).`
      : `Quiz ${verdict}: ${errN} error(s), ${warnN} warning(s).`;

  return {
    source: input.source,
    courseId: input.courseId,
    quizId: input.quizId,
    path: input.path,
    horizonPass: input.horizonPass,
    asOfDate: input.asOfDate,
    weekNumber: input.weekNumber,
    weekStartMonday: input.weekStartMonday,
    weekProvenance: input.weekProvenance,
    verdict,
    findings,
    realizedMix,
    summary,
  };
}
