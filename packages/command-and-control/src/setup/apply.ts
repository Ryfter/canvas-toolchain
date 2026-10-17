/**
 * `ct_setup` action `apply` (#151 R8b): one patch, many setup steps.
 *
 * A professor's first chat is a list of small setup calls — the courses root,
 * Canvas, a model provider, a transcript source, the archive config. Doing them
 * one at a time is fine until the third one fails and the rest are silently
 * skipped. This module runs the whole list in one call, in an order that keeps
 * each step's preconditions true, keeps going past a failure, and finishes by
 * asking the doctor what is actually ready.
 *
 * Two rules shape it:
 *   1. Every section delegates to the setup function that already owns that
 *      write. There is no second implementation of any config file here, and no
 *      section ever echoes a credential back.
 *   2. A section's arguments ARE the delegated operation's arguments: the patch
 *      type is built from that operation's input interface and the operation's
 *      inputSchema is built from that operation's inputSchema, so a field added
 *      to `setup_canvas` reaches `apply_setup` without anyone remembering to
 *      copy it. `buildApplySetupOperation` fails at load time if that stops
 *      being true.
 */
import { existsSync, statSync } from 'node:fs';
import type { Operation } from '../surface/operation.js';
import { passthroughHandler } from '../passthrough/ci_tools.js';
import { DOWNLOADER_TOOLS } from '../passthrough/downloader_tools.js';
import type { CanvasBackupPrefs } from '../passthrough/canvas_backup_config.js';
import { setCoursesRoot, type SetCoursesRootInput } from '../tools/set_courses_root.js';
import { setupCanvas, type SetupCanvasInput } from '../tools/setup_canvas.js';
import { setupAnthropic, type SetupAnthropicInput } from '../tools/setup_anthropic.js';
import { setupOllama, type SetupOllamaInput } from '../tools/setup_ollama.js';
import { setupLmStudio, type SetupLmStudioInput } from '../tools/setup_lmstudio.js';
import { setupLlmProvider } from '../tools/setup_llm_provider.js';
import { setupTranscriptSource, type SetupTranscriptSourceInput } from '../tools/setup_transcript_source.js';
import type { SetupSpotCheckInput } from '../tools/shell_ready/types.js';
import { setupLectureAnswers, type SetupLectureAnswersInput } from '../tools/workflows/setup_lecture_answers.js';
import { setupSpotCheck } from '../tools/workflows/setup_spot_check.js';
import { runDoctor } from './doctor.js';
import type { ActiveProvider, DoctorCheck, DoctorReport } from './types.js';

/** The sections of the patch, in the order apply runs them. */
export type ApplySectionId =
  | 'coursesRoot'
  | 'canvas'
  | 'anthropic'
  | 'ollama'
  | 'lmstudio'
  | 'llmProvider'
  | 'transcripts'
  | 'lectureAnswers'
  | 'spotCheck'
  | 'backup';

/**
 * The whole patch. Every section is optional, and every section's arguments are
 * the arguments of the operation that performs it — `transcripts` drops the
 * operation's own `action`, which apply always calls as 'set'.
 */
export interface ApplySetupInput {
  coursesRoot?: SetCoursesRootInput['coursesRoot'];
  canvas?: SetupCanvasInput;
  anthropic?: SetupAnthropicInput;
  ollama?: SetupOllamaInput;
  lmstudio?: SetupLmStudioInput;
  /** Activate a provider whose config is already on disk. Runs after the config sections. */
  llmProvider?: ActiveProvider;
  transcripts?: Omit<SetupTranscriptSourceInput, 'action'>;
  lectureAnswers?: SetupLectureAnswersInput;
  spotCheck?: SetupSpotCheckInput;
  backup?: CanvasBackupPrefs;
  /** Validate and report what would change, without writing anything. */
  dryRun?: boolean;
}

export interface ApplySectionResult {
  section: ApplySectionId;
  /** The operation that performed the write, for the professor's audit trail. */
  op: string;
  ok: boolean;
  /** A machine code from the failing step, or MISSING_FIELD / INVALID_SECTION. */
  code?: string;
  message: string;
  /** What to do about a failure. Never carries a value the professor supplied. */
  fix?: string[];
}

export interface ApplySetupResult {
  /** True only when every requested section was applied. */
  ok: boolean;
  dryRun: boolean;
  sections: ApplySectionResult[];
  /** Set when the patch itself is malformed, or named a key that is not a section. */
  error?: 'UNKNOWN_SECTION' | 'INVALID_INPUT';
  /** Set alongside `error`, to show the patch the caller probably meant. */
  message?: string;
  fix?: string[];
  /** The doctor's verdict after the writes. Absent on a dry run. */
  readyJourneys?: DoctorReport['readyJourneys'];
  /** The doctor's warn/fail checks after the writes. Absent on a dry run. */
  remaining?: DoctorCheck[];
}

/** One failed local check. `code` mirrors the delegated operation where there is one. */
interface SectionFailure {
  code: string;
  message: string;
  fix?: string[];
}

/** The delegated setup functions' results, reduced to the one verdict apply reports. */
interface SectionOutcome {
  ok: boolean;
  message: string;
  code?: string;
  fix?: string[];
}

/** How the patch names the change, for a dry run's "would" sentence. */
const SECTION_EFFECT: Record<ApplySectionId, string> = {
  coursesRoot: 'set the courses root',
  canvas: 'write canvas-config.json',
  anthropic: 'write anthropic-config.json',
  ollama: 'write ollama-config.json',
  lmstudio: 'write lmstudio-config.json',
  llmProvider: 'activate the chosen LLM provider',
  transcripts: 'update transcript-config.json',
  lectureAnswers: 'write the lecture-answers embeddings config',
  spotCheck: 'update the weekly spot-check preference',
  backup: 'write the Canvas Backup config',
};

interface SectionSpec {
  section: ApplySectionId;
  /** The registered operation whose input schema and writer this section reuses. */
  op: string;
  /** Scalar sections: the one operation property the patch value maps to. */
  property?: string;
  /** Operation fields a batch patch must not carry because apply decides them. */
  omit?: readonly string[];
  /**
   * The fields apply requires. Checked before delegating, and asserted against
   * the operation's own `required` when the operation is built, so a field the
   * operation requires can never be forgotten here.
   */
  required?: readonly string[];
  /**
   * A check apply can make locally, with no write — what makes a dry run worth
   * running. `coursesRoot` mirrors set_courses_root's own codes and messages so
   * a dry run predicts the real run's answer.
   */
  validate?: (value: unknown) => SectionFailure | null;
  run: (value: unknown) => unknown | Promise<unknown>;
}

/**
 * The sections in execution order. The order is the one that keeps every
 * precondition true:
 *   - the courses root first, because the doctor's local-authoring verdict and
 *     every course-scoped operation depend on it;
 *   - Canvas next, because the store bridge it runs feeds Canvas Design Studio's
 *     own tools and the archive config at the end;
 *   - the LLM configs next, and activating the chosen provider LAST of that
 *     group: configuring a provider auto-activates the first one, so the
 *     professor's explicit choice has to be written after it, not before;
 *   - then the rest, which only read what the earlier sections wrote.
 */
const SECTION_SPECS: readonly SectionSpec[] = [
  {
    section: 'coursesRoot',
    op: 'set_courses_root',
    property: 'coursesRoot',
    validate: (value) => {
      const path = value as string;
      if (!existsSync(path)) {
        return {
          code: 'PATH_NOT_FOUND',
          message: `Path does not exist: ${path}`,
          fix: ['Check that the path exists and re-run with the correct absolute path'],
        };
      }
      if (!statSync(path).isDirectory()) {
        return {
          code: 'NOT_A_DIRECTORY',
          message: `Path is not a directory: ${path}`,
          fix: ['Provide a folder path, not a file path'],
        };
      }
      return null;
    },
    run: (value) => setCoursesRoot({ coursesRoot: value as string }),
  },
  {
    section: 'canvas',
    op: 'setup_canvas',
    required: ['host', 'token'],
    run: (value) => setupCanvas(value as SetupCanvasInput),
  },
  {
    section: 'anthropic',
    op: 'setup_anthropic',
    required: ['apiKey'],
    run: (value) => setupAnthropic(value as SetupAnthropicInput),
  },
  {
    section: 'ollama',
    op: 'setup_ollama',
    // apply always commits: a model-less call would only probe and write nothing.
    required: ['model'],
    run: (value) => setupOllama(value as SetupOllamaInput),
  },
  {
    section: 'lmstudio',
    op: 'setup_lmstudio',
    required: ['model'],
    run: (value) => setupLmStudio(value as SetupLmStudioInput),
  },
  {
    section: 'llmProvider',
    op: 'setup_llm_provider',
    property: 'provider',
    run: (provider) => setupLlmProvider({ provider: provider as ActiveProvider }),
  },
  {
    section: 'transcripts',
    op: 'setup_transcript_source',
    // The patch carries the fields to set; apply is always the 'set' path.
    omit: ['action'],
    run: (value) =>
      setupTranscriptSource({ ...(value as Omit<SetupTranscriptSourceInput, 'action'>), action: 'set' }),
  },
  {
    section: 'lectureAnswers',
    op: 'setup_lecture_answers',
    run: (value) => setupLectureAnswers(value as SetupLectureAnswersInput),
  },
  {
    section: 'spotCheck',
    op: 'setup_spot_check',
    required: ['enabled'],
    run: (value) => setupSpotCheck(value as SetupSpotCheckInput),
  },
  {
    section: 'backup',
    op: 'setup_canvas_backup',
    required: ['semester'],
    // The same writer the `ct_setup` action `backup` calls, by reference.
    run: (value) => passthroughHandler(DOWNLOADER_TOOLS, 'setup_canvas_backup')(value as CanvasBackupPrefs),
  },
];

const APPLY_SETUP_DESCRIPTION =
  'Run several setup steps from one patch (courses root, Canvas, LLM provider, ' +
  'activation, transcripts, embeddings, spot check, backup), continuing past a ' +
  'failed step, then report the doctor.';

/**
 * The operation's input schema, derived section by section from the operations
 * apply delegates to. Called with the core operation list at registry build
 * time, so the two can never drift: a property added to `setup_canvas` shows up
 * in the `canvas` section, and a required field the section does not declare
 * throws here rather than reaching a professor as a half-applied patch.
 */
export function buildApplySetupOperation(
  ops: Iterable<{ id: string; inputSchema: Record<string, unknown> }>,
): Operation {
  const byId = new Map<string, { id: string; inputSchema: Record<string, unknown> }>();
  for (const op of ops) byId.set(op.id, op);

  const properties: Record<string, unknown> = {};
  for (const spec of SECTION_SPECS) {
    const op = byId.get(spec.op);
    if (!op) {
      throw new Error(`apply_setup: no operation "${spec.op}" to derive the ${spec.section} section from`);
    }
    properties[spec.section] = deriveSectionSchema(spec, op.inputSchema);
  }
  properties.dryRun = {
    type: 'boolean',
    description: 'Validate the patch and report what would change, without writing anything (default false).',
  };

  return {
    id: 'apply_setup',
    section: 'admin',
    description: APPLY_SETUP_DESCRIPTION,
    inputSchema: { type: 'object', properties },
    handler: (args) => applySetup(args as ApplySetupInput),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'apply',
  };
}

function deriveSectionSchema(spec: SectionSpec, opSchema: Record<string, unknown>): unknown {
  const properties = (opSchema.properties ?? {}) as Record<string, unknown>;

  if (spec.property) {
    const scalar = properties[spec.property];
    if (!scalar) {
      throw new Error(
        `apply_setup: ${spec.op} has no "${spec.property}" property to derive the ${spec.section} section from`,
      );
    }
    return scalar;
  }

  const omitted = new Set(spec.omit ?? []);
  const required = (spec.required ?? []).filter((field) => !omitted.has(field));
  const opRequired = Array.isArray(opSchema.required) ? (opSchema.required as string[]) : [];
  const forgotten = opRequired.filter((field) => !omitted.has(field) && !required.includes(field));
  if (forgotten.length > 0) {
    throw new Error(
      `apply_setup: the ${spec.section} section must require ${forgotten.join(', ')} — ${spec.op} requires them`,
    );
  }

  const sectionProperties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!omitted.has(key)) sectionProperties[key] = value;
  }

  return {
    type: 'object',
    properties: sectionProperties,
    ...(required.length > 0 && { required }),
  };
}

/** The delegated results that mean the step did not happen. */
function normalizeOutcome(result: unknown): SectionOutcome {
  const record = (result ?? {}) as Record<string, unknown>;
  const code = typeof record.error === 'string' ? record.error : undefined;
  const fix = Array.isArray(record.fix)
    ? record.fix.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const ok = record.ok !== false && record.configured !== false && code === undefined;
  const message = typeof record.message === 'string' && record.message
    ? record.message
    : ok ? 'Step applied.' : 'Step failed.';
  return { ok, message, ...(code !== undefined && { code }), ...(fix.length > 0 && { fix }) };
}

/** The fields the patch is missing, from the section's own derived schema. */
function missingFields(spec: SectionSpec, value: unknown): string[] {
  const record = (value ?? {}) as Record<string, unknown>;
  return (spec.required ?? []).filter((field) => {
    const provided = record[field];
    return provided === undefined || provided === null || provided === '';
  });
}

/** Counterpart of a dry run's validation: everything apply can check without writing. */
function validateSectionArgs(spec: SectionSpec, value: unknown): SectionFailure | null {
  if (spec.property) {
    if (typeof value !== 'string' || value.trim() === '') {
      return {
        code: 'MISSING_FIELD',
        message: `The ${spec.section} section must be a non-empty string.`,
        fix: [`Pass ${spec.section} with the value to apply.`],
      };
    }
    return spec.validate?.(value) ?? null;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      code: 'INVALID_SECTION',
      message: `The ${spec.section} section must be an object.`,
      fix: [`Ask ct_setup action describe for the ${spec.section} arguments.`],
    };
  }

  const missing = missingFields(spec, value);
  if (missing.length > 0) {
    return {
      code: 'MISSING_FIELD',
      message: `The ${spec.section} section is missing ${missing.join(', ')}.`,
      fix: [`Add ${missing.join(', ')} to the ${spec.section} section of the patch.`],
    };
  }
  return spec.validate?.(value) ?? null;
}

/**
 * The setup loaders' own error convention: `CODE: what to do`. Only a message
 * shaped like this is passed through from a thrown error, because it is text this
 * repo wrote.
 */
const OWN_ERROR_MESSAGE = /^[A-Z][A-Z0-9_]*:/;

/**
 * A section that threw before returning a result.
 *
 * SECURITY: the error's own text is deliberately not reported unless it is one of
 * the loaders' `CODE: guidance` strings. A raw `JSON.parse` message can quote the
 * bytes around the fault, and the file it was parsing can hold a token — the
 * doctor below reports the corrupt file and its fix by path instead of by content.
 */
function thrownFailure(err: unknown): SectionFailure {
  const message = err instanceof Error ? err.message : '';
  return {
    code: 'STEP_FAILED',
    message: OWN_ERROR_MESSAGE.test(message)
      ? message
      : 'The step failed before it could complete. The doctor below names what this machine still needs.',
    fix: ['Run this step on its own with its own ct_setup action to see the full error.'],
  };
}

async function runSection(spec: SectionSpec, value: unknown): Promise<ApplySectionResult> {
  // The local check is inside the guard on purpose: `spec.validate` stats the
  // filesystem, so a throw (EACCES, say) is one section's failure, not the patch's.
  try {
    const failure = validateSectionArgs(spec, value);
    if (failure) return { section: spec.section, op: spec.op, ok: false, ...failure };
    return { section: spec.section, op: spec.op, ...normalizeOutcome(await spec.run(value)) };
  } catch (err) {
    // One section's failure is not the patch's: report it and let the rest run.
    return { section: spec.section, op: spec.op, ok: false, ...thrownFailure(err) };
  }
}

function validateSection(spec: SectionSpec, value: unknown): ApplySectionResult {
  try {
    const failure = validateSectionArgs(spec, value);
    if (failure) return { section: spec.section, op: spec.op, ok: false, ...failure };
    return {
      section: spec.section,
      op: spec.op,
      ok: true,
      message: `Would ${SECTION_EFFECT[spec.section]}.`,
    };
  } catch (err) {
    return { section: spec.section, op: spec.op, ok: false, ...thrownFailure(err) };
  }
}

/**
 * Apply every section present in the patch, in `SECTION_SPECS` order.
 *
 * A section that fails is reported and skipped; the ones after it still run.
 * With `dryRun` nothing is written at all — the sections are validated against
 * the same required fields the real run uses, plus the local checks apply can
 * make without writing (a courses root that does not exist, say) — and the
 * doctor is not consulted, because it would only describe the unchanged disk.
 */
export async function applySetup(input: ApplySetupInput = {}): Promise<ApplySetupResult> {
  // A missing patch is a status read; a null, array, or primitive one is a caller
  // bug. Report it instead of throwing a TypeError out of `Object.keys` below.
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      dryRun: false,
      sections: [],
      error: 'INVALID_INPUT',
      message: 'The apply patch must be an object of setup sections.',
      fix: [
        `Pass an object — valid sections: ${SECTION_SPECS.map((spec) => spec.section).join(', ')}, and dryRun.`,
      ],
    };
  }

  const dryRun = input.dryRun === true;
  const patch = input as Record<string, unknown>;
  const known = new Set<string>([...SECTION_SPECS.map((spec) => spec.section), 'dryRun']);
  const unknown = Object.keys(patch).filter((key) => !known.has(key));

  // A misspelled section would otherwise be dropped in silence, and the caller
  // would believe it was applied. Refuse the whole patch before writing anything.
  if (unknown.length > 0) {
    return {
      ok: false,
      dryRun,
      sections: [],
      error: 'UNKNOWN_SECTION',
      message: `Unknown setup section(s): ${unknown.join(', ')}.`,
      fix: [`Valid sections: ${SECTION_SPECS.map((spec) => spec.section).join(', ')}, and dryRun.`],
    };
  }

  const sections: ApplySectionResult[] = [];
  for (const spec of SECTION_SPECS) {
    const value = patch[spec.section];
    if (value === undefined) continue;
    sections.push(dryRun ? validateSection(spec, value) : await runSection(spec, value));
  }

  const ok = sections.every((section) => section.ok);
  if (dryRun) return { ok, dryRun, sections };

  const report = await runDoctor({ probe: false });
  return {
    ok,
    dryRun,
    sections,
    readyJourneys: report.readyJourneys,
    remaining: report.checks.filter((check) => check.status !== 'ok'),
  };
}
