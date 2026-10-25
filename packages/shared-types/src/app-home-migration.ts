/**
 * Windows app-home migration (#200, job CT200-03).
 *
 * Moves a legacy `~/.<app>` folder into the three Windows roots resolved by
 * `appPaths()` (config in %APPDATA%, data and secrets in %LOCALAPPDATA%).
 * See docs/specs/2026-10-18-paths-and-module-credentials.md sections 3, 5.1,
 * 9 Q1a and Q6.
 *
 * Guarantees:
 *  - No overwrite: a file is placed with a no-clobber hard link from a temp
 *    copy; an existing target is compared byte for byte and never replaced.
 *  - No delete of user data: the legacy folder is renamed to
 *    `<legacy>.migrated-YYYYMMDD-HHmmss[-N]`, and only when every file is
 *    verified and there are no conflicts. The engine deletes only its own
 *    `.staging-*` folders and `.tmp-*` files.
 *  - Commit point: when the config home does not exist yet, each root is
 *    built in a staging folder and renamed into place data -> secrets ->
 *    config. Creating the config home flips the resolver's upgrade-window
 *    rule, so it happens last and only when nothing blocks it.
 *  - Idempotent and resumable: re-runs skip identical files, and orphan
 *    temps from a crashed run are removed (a temp is an orphan when its
 *    owning process is gone and no run in this process holds it).
 *  - Never throws: any failure becomes `outcome: 'failed'` with an error code.
 *  - No secrets in the journal or result: relative paths and counts only.
 *
 * macOS/Linux, and any env override, are a no-op (`nothing-to-do`).
 */
import { randomBytes } from 'node:crypto';
import { promises as fsp, type Stats } from 'node:fs';
import path from 'node:path';
import { appPaths, legacyAppHome, type AppId, type PathEnv } from './app-paths.js';

export type MigrationRoot = 'config' | 'data' | 'secrets';
export type MigrationOutcome = 'migrated' | 'partial' | 'nothing-to-do' | 'failed';
/** link: symlink/junction, not followed. not-a-file: socket, device, etc.
 *  in-use: Windows sharing violation, retried next boot.
 *  vanished: the source disappeared mid-run (another migrator finished). */
export type MigrationSkipReason = 'link' | 'not-a-file' | 'in-use' | 'vanished';

export interface MigrationJournal {
  app: AppId;
  at: string;
  outcome: MigrationOutcome;
  copied: number;
  identical: number;
  /** Relative paths (forward slashes) left untouched in both places. */
  conflicts: string[];
  skipped: Array<{ path: string; reason: MigrationSkipReason }>;
  legacyRenamedTo?: string;
  /** An error code only, never a message or value. */
  error?: string;
}

export interface MigrationOptions extends PathEnv {
  now?: () => Date;
  /** Test seam: called before each staging root is renamed into place. */
  onBeforeCommit?: (root: MigrationRoot) => void | Promise<void>;
}

export const MIGRATION_JOURNAL_FILE = 'path-migration.json';

const COMMIT_ORDER: readonly MigrationRoot[] = ['data', 'secrets', 'config'];

/** Top-level legacy names per app (§2.2 + Q1a). Unknown names go to config. */
const CLASSES: Record<AppId, { data: readonly string[]; secrets: readonly string[] }> = {
  cc: {
    data: ['modules', 'registry', 'publish-snapshots', 'showcase-previews', 'cache', 'module-catalog-cache.json'],
    secrets: [
      'config.json', 'canvas-config.json', 'anthropic-config.json', 'panopto-config.json',
      'module-credentials', 'roster-vault',
    ],
  },
  cds: { data: ['kb', 'transcripts'], secrets: ['institution.json'] },
  ci: { data: ['courses', 'panopto'], secrets: [] },
};

/** Exact match, or a sibling copy of a file entry (`canvas-config.json.tmp`).
 *  Folder entries match exactly, so `modules` never captures `modules.json`. */
function matches(name: string, entries: readonly string[]): boolean {
  const n = name.toLowerCase(); // Windows names are case-insensitive
  return entries.some((e) => n === e || (e.includes('.') && n.startsWith(`${e}.`)));
}

/**
 * Which new root a legacy top-level entry belongs to. A stray `<secret>.tmp`
 * or `<secret>.bak` stays with the secrets.
 */
export function legacyEntryRoot(app: AppId, topLevelName: string): MigrationRoot {
  const c = CLASSES[app];
  if (matches(topLevelName, c.secrets)) return 'secrets';
  if (matches(topLevelName, c.data)) return 'data';
  return 'config';
}

// ── temp ownership ──────────────────────────────────────────────────────────

/** Temps owned by a live run in this process. Shared across concurrent calls. */
const inFlight = new Set<string>();

function newTag(): string {
  return `${process.pid}-${randomBytes(4).toString('hex')}`;
}

/** `suffix` is what follows `.staging-` / `.tmp-`: `<pid>-<rand>[...]`. */
function isOrphan(fullPath: string, suffix: string): boolean {
  if (inFlight.has(fullPath)) return false;
  const m = /^(\d+)-/.exec(suffix);
  if (!m) return true;
  const pid = Number(m[1]);
  if (pid === process.pid) return true; // not in flight here, so a crashed run's
  try {
    process.kill(pid, 0);
    return false; // owner alive
  } catch (e) {
    return code(e) !== 'EPERM'; // EPERM: alive, owned by someone else
  }
}

async function sweep(dir: string, prefix: string): Promise<void> {
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    const full = path.join(dir, name);
    if (isOrphan(full, name.slice(prefix.length))) await rmQuiet(full);
  }
}

// ── small fs helpers ────────────────────────────────────────────────────────

function code(e: unknown): string {
  return (e as NodeJS.ErrnoException | undefined)?.code ?? 'UNKNOWN';
}

async function lstatOrNull(p: string): Promise<Stats | null> {
  try {
    return await fsp.lstat(p);
  } catch (e) {
    if (code(e) === 'ENOENT' || code(e) === 'ENOTDIR') return null;
    throw e;
  }
}

async function rmQuiet(p: string): Promise<void> {
  try {
    await fsp.rm(p, { recursive: true, force: true });
  } catch {
    /* next boot's sweep retries */
  }
}

/** A problem reading the legacy side: skip the file, retry next boot. */
class SourceSkip extends Error {
  constructor(readonly reason: MigrationSkipReason) {
    super(reason);
  }
}

function sourceError(e: unknown): unknown {
  const c = code(e);
  if (c === 'ENOENT') return new SourceSkip('vanished');
  if (c === 'EBUSY' || c === 'EPERM' || c === 'EACCES') return new SourceSkip('in-use');
  return e;
}

async function openSource(src: string): Promise<fsp.FileHandle> {
  try {
    return await fsp.open(src, 'r');
  } catch (e) {
    throw sourceError(e);
  }
}

const CHUNK = 1 << 20;

/** Copy to a path that must not exist yet. */
async function copyExcl(src: string, dest: string): Promise<void> {
  const from = await openSource(src);
  try {
    const to = await fsp.open(dest, 'wx');
    try {
      const buf = Buffer.allocUnsafe(CHUNK);
      for (;;) {
        let n: number;
        try {
          ({ bytesRead: n } = await from.read(buf, 0, CHUNK, null));
        } catch (e) {
          throw sourceError(e);
        }
        if (n === 0) break;
        await to.write(buf, 0, n);
      }
    } finally {
      await to.close();
    }
  } finally {
    await from.close();
  }
}

/** Byte-for-byte equality, streamed. `src` is the legacy side. */
async function sameBytes(src: string, other: string): Promise<boolean> {
  const a = await openSource(src);
  try {
    const b = await fsp.open(other, 'r');
    try {
      const [sa, sb] = await Promise.all([a.stat(), b.stat()]);
      if (sa.size !== sb.size) return false;
      const ba = Buffer.allocUnsafe(CHUNK);
      const bb = Buffer.allocUnsafe(CHUNK);
      for (;;) {
        let na: number;
        try {
          ({ bytesRead: na } = await a.read(ba, 0, CHUNK, null));
        } catch (e) {
          throw sourceError(e);
        }
        const { bytesRead: nb } = await b.read(bb, 0, CHUNK, null);
        if (na !== nb) return false;
        if (na === 0) return true;
        if (!ba.subarray(0, na).equals(bb.subarray(0, nb))) return false;
      }
    } finally {
      await b.close();
    }
  } finally {
    await a.close();
  }
}

type Placed = 'copied' | 'identical' | 'conflict';

/** Compare an existing target against the source. */
async function judge(src: string, target: string, st: Stats): Promise<Placed> {
  if (!st.isFile()) return 'conflict';
  return (await sameBytes(src, target)) ? 'identical' : 'conflict';
}

/**
 * Place `src` at `target` without ever replacing an existing file: copy to
 * `target.tmp-<tag>`, verify, then hard-link into place (atomic, fails with
 * EEXIST if anyone got there first).
 */
async function placeFile(src: string, target: string): Promise<Placed> {
  const dir = path.dirname(target);
  await fsp.mkdir(dir, { recursive: true });
  await sweep(dir, `${path.basename(target)}.tmp-`);
  const existing = await lstatOrNull(target);
  if (existing) return judge(src, target, existing);

  const tmp = `${target}.tmp-${newTag()}`;
  inFlight.add(tmp);
  try {
    await copyExcl(src, tmp);
    if (!(await sameBytes(src, tmp))) throw new SourceSkip('in-use'); // changed while copying
    try {
      await fsp.link(tmp, target);
      return 'copied';
    } catch (e) {
      const raced = await lstatOrNull(target);
      if (raced) return judge(src, target, raced);
      if (code(e) === 'EEXIST') throw e;
      // No hard-link support on this volume: check-then-rename fallback.
      await fsp.rename(tmp, target);
      return 'copied';
    }
  } finally {
    inFlight.delete(tmp);
    await rmQuiet(tmp);
  }
}

// ── legacy walk ─────────────────────────────────────────────────────────────

interface LegacyFile {
  rel: string; // forward slashes, for the journal
  parts: string[];
  abs: string;
  root: MigrationRoot;
}

async function walkLegacy(
  legacy: string,
  app: AppId,
  skipped: MigrationJournal['skipped'],
): Promise<LegacyFile[]> {
  const files: LegacyFile[] = [];
  const visit = async (dir: string, parts: string[]): Promise<void> => {
    let names: string[];
    try {
      names = await fsp.readdir(dir);
    } catch (e) {
      const s = sourceError(e);
      if (s instanceof SourceSkip) {
        skipped.push({ path: parts.join('/') || '.', reason: s.reason });
        return;
      }
      throw e;
    }
    for (const name of names.sort()) {
      const abs = path.join(dir, name);
      const p = [...parts, name];
      const rel = p.join('/');
      const st = await lstatOrNull(abs);
      if (!st) {
        skipped.push({ path: rel, reason: 'vanished' });
      } else if (st.isSymbolicLink()) {
        skipped.push({ path: rel, reason: 'link' });
      } else if (st.isDirectory()) {
        await visit(abs, p);
      } else if (st.isFile()) {
        files.push({ rel, parts: p, abs, root: legacyEntryRoot(app, p[0]) });
      } else {
        skipped.push({ path: rel, reason: 'not-a-file' });
      }
    }
  };
  await visit(legacy, []);
  return files;
}

/** Every regular file under `dir`, as path segments relative to it. */
async function listFiles(dir: string, parts: string[] = []): Promise<string[][]> {
  const out: string[][] = [];
  for (const name of await fsp.readdir(dir)) {
    const st = await fsp.lstat(path.join(dir, name));
    if (st.isDirectory()) out.push(...(await listFiles(path.join(dir, name), [...parts, name])));
    else if (st.isFile()) out.push([...parts, name]);
  }
  return out;
}

// ── engine ──────────────────────────────────────────────────────────────────

/**
 * The resolver builds win32 paths with `path.win32`. On a real Windows host
 * they are used as-is; when tests inject `platform: 'win32'` on POSIX, the
 * backslashes are turned back into the host separator so the fake home works.
 */
function hostPath(p: string): string {
  return process.platform === 'win32' ? p : p.replaceAll('\\', '/');
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

type Roots = Record<MigrationRoot, string>;

/** The outermost root containing `r` (secrets lives inside data on Windows). */
function topOf(roots: Roots, r: MigrationRoot): MigrationRoot {
  let top = r;
  for (const q of COMMIT_ORDER) {
    if (q !== r && roots[r].startsWith(roots[q] + path.sep) && roots[q].length < roots[top].length) top = q;
  }
  return top;
}

/** `<top>.staging-<tag>[.<root>]`, a sibling of the outermost root. */
function stagingPath(roots: Roots, r: MigrationRoot, tag: string): string {
  const top = topOf(roots, r);
  const t = roots[top];
  return path.join(path.dirname(t), `${path.basename(t)}.staging-${tag}${top === r ? '' : `.${r}`}`);
}

async function sweepStagings(roots: Roots): Promise<void> {
  const tops = new Set(COMMIT_ORDER.map((r) => roots[topOf(roots, r)]));
  for (const t of tops) await sweep(path.dirname(t), `${path.basename(t)}.staging-`);
}

function isBlockingSkip(s: { reason: MigrationSkipReason }): boolean {
  return s.reason === 'in-use' || s.reason === 'vanished';
}

class Run {
  readonly j: MigrationJournal;
  /** Files whose target is believed to hold their bytes, for final verification. */
  readonly placed: LegacyFile[] = [];
  readonly owned = new Set<string>();

  constructor(
    readonly app: AppId,
    readonly legacy: string,
    readonly roots: Roots,
    readonly o: MigrationOptions,
    at: Date,
  ) {
    this.j = { app, at: at.toISOString(), outcome: 'nothing-to-do', copied: 0, identical: 0, conflicts: [], skipped: [] };
  }

  target(f: LegacyFile): string {
    return path.join(this.roots[f.root], ...f.parts);
  }

  record(f: LegacyFile, result: Placed): void {
    if (result === 'conflict') {
      this.j.conflicts.push(f.rel);
      return;
    }
    if (result === 'copied') this.j.copied++;
    else this.j.identical++;
    this.placed.push(f);
  }

  async place(f: LegacyFile, target = this.target(f)): Promise<void> {
    try {
      this.record(f, await placeFile(f.abs, target));
    } catch (e) {
      if (e instanceof SourceSkip) this.j.skipped.push({ path: f.rel, reason: e.reason });
      else throw e;
    }
  }

  blocked(): boolean {
    return this.j.conflicts.length > 0 || this.j.skipped.some(isBlockingSkip);
  }

  /** Config home already exists: per-file merge into every root. */
  async merge(files: LegacyFile[]): Promise<void> {
    for (const f of files) await this.place(f);
  }

  /** Config home absent: stage, verify, then commit data -> secrets -> config. */
  async stageAndCommit(files: LegacyFile[]): Promise<void> {
    const tag = newTag();
    const staging: Partial<Record<MigrationRoot, string>> = {};
    const staged: Record<MigrationRoot, LegacyFile[]> = { config: [], data: [], secrets: [] };
    for (const r of COMMIT_ORDER) {
      // A pre-existing data/secrets root (a crash between commits) is merged into directly.
      if (r === 'config' || !(await lstatOrNull(this.roots[r]))) staging[r] = stagingPath(this.roots, r, tag);
    }
    const ensure = async (dir: string): Promise<void> => {
      if (!this.owned.has(dir)) {
        inFlight.add(dir);
        this.owned.add(dir);
      }
      await fsp.mkdir(dir, { recursive: true });
    };

    for (const f of files) {
      const s = staging[f.root];
      if (s === undefined) {
        await this.place(f);
        continue;
      }
      const dest = path.join(s, ...f.parts);
      await ensure(s);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      try {
        await copyExcl(f.abs, dest);
        if (!(await sameBytes(f.abs, dest))) throw new SourceSkip('in-use');
        staged[f.root].push(f);
      } catch (e) {
        if (e instanceof SourceSkip) this.j.skipped.push({ path: f.rel, reason: e.reason });
        else throw e;
      }
    }
    // Nothing commits while anything is unresolved: legacy stays authoritative.
    if (this.blocked()) return;

    for (const r of COMMIT_ORDER) {
      const s = staging[r];
      if (s === undefined) continue;
      if (r !== 'config' && staged[r].length === 0) continue;
      await ensure(s); // the config home is created even when empty: it is the commit point
      await this.o.onBeforeCommit?.(r);
      await fsp.mkdir(path.dirname(this.roots[r]), { recursive: true });
      try {
        await fsp.rename(s, this.roots[r]);
        inFlight.delete(s);
        this.owned.delete(s);
        for (const f of staged[r]) this.record(f, 'copied');
      } catch (e) {
        if (!(await lstatOrNull(this.roots[r]))) throw e;
        // Another migrator committed this root first: merge our copy into theirs.
        const bySegments = new Map(staged[r].map((f) => [f.parts.join('/'), f]));
        for (const parts of await listFiles(s)) {
          const f = bySegments.get(parts.join('/'));
          if (f) await this.place(f);
        }
        inFlight.delete(s);
        this.owned.delete(s);
        await rmQuiet(s);
      }
    }
  }

  /** Every placed file must equal its legacy source, byte for byte. */
  async verify(): Promise<void> {
    for (const f of this.placed) {
      try {
        if (!(await sameBytes(f.abs, this.target(f)))) this.j.conflicts.push(f.rel);
      } catch (e) {
        if (e instanceof SourceSkip) this.j.skipped.push({ path: f.rel, reason: e.reason });
        else if (code(e) === 'ENOENT') this.j.conflicts.push(f.rel);
        else throw e;
      }
    }
  }

  async renameLegacy(at: Date): Promise<void> {
    const base = `${this.legacy}.migrated-${stamp(at)}`;
    for (let i = 1; i <= 100; i++) {
      const name = i === 1 ? base : `${base}-${i}`;
      if (await lstatOrNull(name)) continue;
      try {
        await fsp.rename(this.legacy, name);
        this.j.legacyRenamedTo = name;
        return;
      } catch (e) {
        if (await lstatOrNull(name)) continue; // lost a race for this name
        return; // ENOENT (another run won) or a handle is open: partial, retried next boot
      }
    }
  }

  async writeJournal(): Promise<void> {
    const dir = this.roots.config;
    try {
      // Never create the config home just to journal: that would flip the
      // upgrade-window rule onto an empty folder.
      if (!(await lstatOrNull(dir))?.isDirectory()) return;
      // A concurrent run finished the migration: its 'migrated' journal stands.
      if (!this.j.legacyRenamedTo && !(await lstatOrNull(this.legacy))) return;
      const file = path.join(dir, MIGRATION_JOURNAL_FILE);
      await sweep(dir, `${MIGRATION_JOURNAL_FILE}.tmp-`);
      const tmp = `${file}.tmp-${newTag()}`;
      inFlight.add(tmp);
      try {
        await fsp.writeFile(tmp, `${JSON.stringify(this.j, null, 2)}\n`, { flag: 'wx' });
        await fsp.rename(tmp, file);
      } finally {
        inFlight.delete(tmp);
        await rmQuiet(tmp);
      }
    } catch {
      /* the journal is best effort; the result still carries the outcome */
    }
  }

  async cleanup(): Promise<void> {
    for (const p of this.owned) {
      inFlight.delete(p);
      await rmQuiet(p);
    }
    this.owned.clear();
  }
}

/**
 * Migrate one app's legacy home on Windows. Call before any other read of
 * that app's files. Never throws.
 */
export async function migrateLegacyAppHome(app: AppId, o: MigrationOptions = {}): Promise<MigrationJournal> {
  const at = (o.now ?? (() => new Date()))();
  const empty: MigrationJournal = {
    app, at: at.toISOString(), outcome: 'nothing-to-do', copied: 0, identical: 0, conflicts: [], skipped: [],
  };
  let run: Run | undefined;
  try {
    const platform = o.platform ?? process.platform;
    if (platform !== 'win32') return empty;
    const resolved = appPaths(app, { platform, env: o.env, homedir: o.homedir, ignoreUpgradeWindow: true });
    if (resolved.source === 'env') return empty;
    const legacy = hostPath(legacyAppHome(app, { platform, homedir: o.homedir }));
    const roots: Roots = {
      config: hostPath(resolved.config),
      data: hostPath(resolved.data),
      secrets: hostPath(resolved.secrets),
    };
    run = new Run(app, legacy, roots, o, at);

    const st = await lstatOrNull(legacy);
    if (!st || (!st.isDirectory() && !st.isSymbolicLink())) return empty;
    if (st.isSymbolicLink()) {
      run.j.outcome = 'partial';
      run.j.skipped.push({ path: '.', reason: 'link' });
      await run.writeJournal();
      return run.j;
    }

    await sweepStagings(roots);
    const files = await walkLegacy(legacy, app, run.j.skipped);
    if (await lstatOrNull(roots.config)) await run.merge(files);
    else await run.stageAndCommit(files);

    if (!run.blocked() && (await lstatOrNull(roots.config))) {
      await run.verify();
      if (!run.blocked()) await run.renameLegacy(at);
    }
    run.j.outcome = run.j.legacyRenamedTo ? 'migrated' : 'partial';
    await run.writeJournal();
    return run.j;
  } catch (e) {
    const j = run?.j ?? empty;
    j.outcome = 'failed';
    j.error = code(e);
    await run?.writeJournal();
    return j;
  } finally {
    await run?.cleanup();
  }
}
