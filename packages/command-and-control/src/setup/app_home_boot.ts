import {
  migrateLegacyAppHome,
  type AppId,
  type MigrationJournal,
  type MigrationOutcome,
  type PathEnv,
} from '@canvas-toolchain/shared-types';

/**
 * Run the Windows app-home migration (#200) once per process, before any
 * config read (spec section 5.1, job CT200-07). Callers: the C&C server at
 * startup and `runDoctor()`. Canvas Design Studio and Curriculum Intelligence
 * do not depend on C&C, so their entrypoints call `migrateLegacyAppHome`
 * directly through the same process-wide memo key.
 *
 * Fail-safe by construction:
 *  - never throws and never rejects (a throwing engine, a throwing logger, an
 *    unwritable home all become an outcome);
 *  - never blocks boot indefinitely: past `timeoutMs` the boot continues and
 *    the migration finishes in the background. That is safe because the
 *    engine stages into temp folders and creates the config home last, and
 *    until then the resolver keeps every reader on the legacy folder;
 *  - logs one stderr line of outcomes and counts. No paths, no messages, no
 *    file contents, so no secret can reach the log.
 *
 * macOS/Linux and any env override are `nothing-to-do` (the engine's rule).
 */

export const ALL_APP_HOMES: readonly AppId[] = ['cc', 'cds', 'ci'];

export interface AppHomeBootOutcome {
  app: AppId;
  outcome: MigrationOutcome | 'timed-out';
  copied: number;
  identical: number;
  conflicts: number;
  skipped: number;
  /** An error code only, never a message. */
  error?: string;
}

export interface BootAppHomesOptions {
  /** Test seam: the migration engine. */
  migrate?: (app: AppId, o?: PathEnv) => Promise<MigrationJournal>;
  /** Test seam: forwarded to the engine (platform, env, homedir). */
  pathEnv?: PathEnv;
  /** How long boot waits for the migration before moving on. */
  timeoutMs?: number;
  /** Where the one stderr line goes. */
  log?: (line: string) => void;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/** Process-wide, shared with the CDS and CI entrypoints. */
const MEMO_KEY = Symbol.for('canvas-toolchain.app-home-boot');

function memo(): Map<AppId, Promise<MigrationJournal>> {
  const g = globalThis as Record<symbol, unknown>;
  let m = g[MEMO_KEY] as Map<AppId, Promise<MigrationJournal>> | undefined;
  if (!(m instanceof Map)) {
    m = new Map();
    g[MEMO_KEY] = m;
  }
  return m;
}

/** Tests only: forget which apps this process already migrated. */
export function resetAppHomeBootForTests(): void {
  memo().clear();
}

function errorCode(e: unknown): string {
  const c = (e as { code?: unknown } | null | undefined)?.code;
  return typeof c === 'string' && /^[A-Z0-9_]{1,40}$/.test(c) ? c : 'UNKNOWN';
}

function failed(app: AppId, e: unknown): MigrationJournal {
  return {
    app, at: new Date().toISOString(), outcome: 'failed',
    copied: 0, identical: 0, conflicts: [], skipped: [], error: errorCode(e),
  };
}

function summarize(app: AppId, j: MigrationJournal | 'timed-out'): AppHomeBootOutcome {
  if (j === 'timed-out') {
    return { app, outcome: 'timed-out', copied: 0, identical: 0, conflicts: 0, skipped: 0 };
  }
  const out: AppHomeBootOutcome = {
    app,
    outcome: j.outcome,
    copied: Number(j.copied) || 0,
    identical: Number(j.identical) || 0,
    conflicts: Array.isArray(j.conflicts) ? j.conflicts.length : 0,
    skipped: Array.isArray(j.skipped) ? j.skipped.length : 0,
  };
  if (j.error) out.error = errorCode({ code: j.error });
  return out;
}

function describeOutcome(o: AppHomeBootOutcome): string {
  if (o.outcome === 'nothing-to-do' || o.outcome === 'timed-out') return `${o.app}=${o.outcome}`;
  const counts = `copied=${o.copied},identical=${o.identical},conflicts=${o.conflicts},skipped=${o.skipped}`;
  return `${o.app}=${o.outcome}(${counts}${o.error ? `,error=${o.error}` : ''})`;
}

export async function bootAppHomes(
  apps: readonly AppId[],
  opts: BootAppHomesOptions = {},
): Promise<Partial<Record<AppId, AppHomeBootOutcome>>> {
  const result: Partial<Record<AppId, AppHomeBootOutcome>> = {};
  try {
    const migrate = opts.migrate ?? migrateLegacyAppHome;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const m = memo();
    const started: AppId[] = [];

    for (const app of apps) {
      let run = m.get(app);
      if (!run) {
        // Sequential on purpose: one app at a time keeps disk contention and
        // Windows sharing violations down. `.catch` turns even a synchronous
        // throw into an outcome.
        run = Promise.resolve()
          .then(() => migrate(app, opts.pathEnv))
          .catch((e: unknown) => failed(app, e));
        m.set(app, run);
        started.push(app);
      }
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<'timed-out'>((r) => {
        timer = setTimeout(() => r('timed-out'), timeoutMs);
        timer.unref?.();
      });
      const settled = await Promise.race([run, timeout]);
      if (timer) clearTimeout(timer);
      result[app] = summarize(app, settled);
    }

    // Only the caller that actually started a migration logs, so a second
    // server or the doctor in the same process adds no noise.
    if (started.length > 0) {
      const line = `[app-home] ${started.map((a) => describeOutcome(result[a]!)).join(' ')}`;
      try {
        (opts.log ?? ((l: string) => console.error(l)))(line);
      } catch {
        /* stderr closed: never fatal */
      }
    }
  } catch {
    /* never throws to the caller; whatever was resolved is returned */
  }
  return result;
}
