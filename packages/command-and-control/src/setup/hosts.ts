import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type {
  HostWiringOptions,
  HostWiringReport,
  McpHostId,
  McpHostWiring,
} from './types.js';

/**
 * Read-only detection of whether canvas-toolchain is wired into the MCP hosts
 * (AI clients) on this machine. Kevin's decision D5 (#151): the doctor may read
 * other apps' config files and must never write them.
 *
 * What leaves this module is deliberately tiny: per host, booleans plus the
 * canvas-toolchain entry's own script path with the home directory collapsed to
 * `~`. Env blocks, other servers, and any arg that is not a script path are
 * never copied anywhere — an MCP config commonly holds API tokens.
 */

/** A config larger than this is reported as a parse error instead of read. */
const DEFAULT_MAX_CONFIG_BYTES = 1024 * 1024;

/**
 * Claude Code keeps its whole project history inside `~/.claude.json`, so that
 * one file routinely passes the default cap. It gets its own ceiling — large
 * enough for real users, still bounded so a pathological file is never read.
 */
const LARGE_MAX_CONFIG_BYTES = 32 * 1024 * 1024;

/**
 * Substrings that identify the entry that runs canvas-toolchain. The installer
 * names the server exactly `canvas-toolchain`; every other wiring form carries
 * a marker too — a checkout's `command-and-control` package dir, or the
 * `npx canvas-toolchain` package name.
 */
const TOOLCHAIN_MARKERS = ['canvas-toolchain', 'command-and-control', 'canvas_toolchain'];

interface HostContext {
  platform: NodeJS.Platform;
  home: string;
  env: Record<string, string | undefined>;
}

interface ConfigCandidate {
  path: string;
  /** The key path (JSON) or table name (TOML) that holds the server entries. */
  servers: string[];
}

interface HostDescriptor {
  id: McpHostId;
  displayName: string;
  format: 'json' | 'toml';
  /** The host's own directory. Its presence is what "installed" means. */
  installDir(ctx: HostContext): string;
  /**
   * Overrides the `installDir` existence test for a host that shares its
   * directory with another (Gemini CLI and Antigravity both live in `~/.gemini`).
   */
  isInstalled?(ctx: HostContext): boolean;
  /** A per-host read cap, for a host whose config carries unrelated bulk. */
  maxConfigBytes?: number;
  /** Config files to try, in order — VS Code has two shapes. */
  configFiles(ctx: HostContext): ConfigCandidate[];
}

function isWindows(ctx: HostContext): boolean {
  return ctx.platform === 'win32';
}

function isMac(ctx: HostContext): boolean {
  return ctx.platform === 'darwin';
}

/** `%APPDATA%`, the same variable the installer honors, with its fallback. */
function appDataDir(ctx: HostContext): string {
  const fromEnv = ctx.env.APPDATA?.trim();
  return fromEnv ? fromEnv : join(ctx.home, 'AppData', 'Roaming');
}

/** `~/Library/Application Support/<vendor>` on macOS, `%APPDATA%\<vendor>` on Windows. */
function appSupportDir(ctx: HostContext, vendor: string): string {
  if (isWindows(ctx)) return join(appDataDir(ctx), vendor);
  if (isMac(ctx)) return join(ctx.home, 'Library', 'Application Support', vendor);
  return join(ctx.home, '.config', vendor);
}

function vscodeUserDir(ctx: HostContext): string {
  return join(appSupportDir(ctx, 'Code'), 'User');
}

function zedDir(ctx: HostContext): string {
  if (isWindows(ctx)) return join(appDataDir(ctx), 'Zed');
  if (isMac(ctx)) return join(ctx.home, '.config', 'zed');
  const xdg = ctx.env.XDG_CONFIG_HOME?.trim();
  return join(xdg ? xdg : join(ctx.home, '.config'), 'zed');
}

/**
 * Gemini CLI and Antigravity share `~/.gemini`. Mirror the installer
 * (`installer/tasks/mcphost.go` `GeminiConfigPath`): Gemini CLI is present when
 * its own settings file exists, or when no Antigravity `config/` occupies the
 * directory. Without this an Antigravity-only machine looks like an unwired
 * Gemini CLI install.
 */
function geminiCliInstalled(ctx: HostContext): boolean {
  const dir = join(ctx.home, '.gemini');
  if (!existsSync(dir)) return false;
  if (existsSync(join(dir, 'settings.json'))) return true;
  return !existsSync(join(dir, 'config'));
}

/**
 * The hosts, with the paths the Go installer writes (`installer/tasks/mcphost.go`)
 * so detection and wiring cannot drift. Every host the installer wires
 * (`SupportedHosts()`) is covered here. Windsurf and Zed are extra, read-only
 * hosts the installer does not wire, so their paths come from each host's docs.
 */
const HOSTS: HostDescriptor[] = [
  {
    id: 'claude-desktop',
    displayName: 'Claude Desktop',
    format: 'json',
    installDir: (ctx) => appSupportDir(ctx, 'Claude'),
    configFiles: (ctx) => [
      {
        path: join(appSupportDir(ctx, 'Claude'), 'claude_desktop_config.json'),
        servers: ['mcpServers'],
      },
    ],
  },
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    format: 'json',
    installDir: (ctx) => join(ctx.home, '.claude'),
    maxConfigBytes: LARGE_MAX_CONFIG_BYTES,
    // Project-scoped `.mcp.json` is out of scope: it belongs to a repository,
    // not to the machine's setup.
    configFiles: (ctx) => [{ path: join(ctx.home, '.claude.json'), servers: ['mcpServers'] }],
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    format: 'json',
    installDir: (ctx) => join(ctx.home, '.cursor'),
    configFiles: (ctx) => [
      { path: join(ctx.home, '.cursor', 'mcp.json'), servers: ['mcpServers'] },
    ],
  },
  {
    id: 'vscode',
    displayName: 'VS Code',
    format: 'json',
    installDir: (ctx) => vscodeUserDir(ctx),
    configFiles: (ctx) => [
      { path: join(vscodeUserDir(ctx), 'mcp.json'), servers: ['servers'] },
      { path: join(vscodeUserDir(ctx), 'settings.json'), servers: ['mcp', 'servers'] },
    ],
  },
  {
    id: 'windsurf',
    displayName: 'Windsurf',
    format: 'json',
    installDir: (ctx) => join(ctx.home, '.codeium', 'windsurf'),
    configFiles: (ctx) => [
      { path: join(ctx.home, '.codeium', 'windsurf', 'mcp_config.json'), servers: ['mcpServers'] },
    ],
  },
  {
    id: 'zed',
    displayName: 'Zed',
    format: 'json',
    installDir: (ctx) => zedDir(ctx),
    configFiles: (ctx) => [
      { path: join(zedDir(ctx), 'settings.json'), servers: ['context_servers'] },
    ],
  },
  {
    id: 'codex',
    displayName: 'Codex CLI',
    format: 'toml',
    installDir: (ctx) => join(ctx.home, '.codex'),
    configFiles: (ctx) => [
      { path: join(ctx.home, '.codex', 'config.toml'), servers: ['mcp_servers'] },
    ],
  },
  {
    id: 'gemini',
    displayName: 'Gemini CLI',
    format: 'json',
    installDir: (ctx) => join(ctx.home, '.gemini'),
    isInstalled: geminiCliInstalled,
    configFiles: (ctx) => [
      { path: join(ctx.home, '.gemini', 'settings.json'), servers: ['mcpServers'] },
    ],
  },
  {
    id: 'kiro',
    displayName: 'Kiro',
    format: 'json',
    installDir: (ctx) => join(ctx.home, '.kiro'),
    configFiles: (ctx) => [
      { path: join(ctx.home, '.kiro', 'settings', 'mcp.json'), servers: ['mcpServers'] },
    ],
  },
  {
    id: 'antigravity',
    displayName: 'Antigravity',
    format: 'json',
    installDir: (ctx) => join(ctx.home, '.gemini', 'config'),
    configFiles: (ctx) => [
      { path: join(ctx.home, '.gemini', 'config', 'mcp_config.json'), servers: ['mcpServers'] },
    ],
  },
];

type CappedRead =
  | { kind: 'text'; text: string }
  | { kind: 'over-cap' }
  | { kind: 'unreadable' }
  | { kind: 'missing' };

function readCapped(path: string, maxBytes: number): CappedRead {
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return { kind: 'missing' };
  }
  if (size > maxBytes) return { kind: 'over-cap' };
  try {
    return { kind: 'text', text: readFileSync(path, 'utf-8') };
  } catch {
    return { kind: 'unreadable' };
  }
}

/**
 * Zed writes a settings file that opens with a `//` comment and VS Code's
 * settings.json is JSONC by contract, so a strict parse alone would call every
 * one of those configs corrupt. The stripper is string-aware, so a `//` inside
 * a value (a URL) survives intact.
 */
function parseJsonConfig(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    // Not plain JSON. Comments may be the only difference.
  }
  try {
    return JSON.parse(stripTrailingCommas(stripJsonComments(text)));
  } catch {
    return undefined;
  }
}

function stripJsonComments(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (ch === '\n') {
        inLine = false;
        out += ch;
      }
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i++;
      } else if (ch === '\n') {
        out += ch;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = true;
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * JSONC also allows a comma after the last member of an object or array. Remove
 * only those, and only outside a string, so a `,}` written inside a value is
 * left exactly as it was.
 */
function stripTrailingCommas(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ',') {
      let next = i + 1;
      while (next < text.length && /\s/.test(text[next])) next++;
      if (next < text.length && (text[next] === '}' || text[next] === ']')) continue;
    }
    out += ch;
  }
  return out;
}

interface EntryDetails {
  command: string | null;
  args: string[];
}

/** `command` and `args` only — never `env`, which is where tokens live. */
function entryDetails(entry: unknown): EntryDetails {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return { command: null, args: [] };
  }
  const record = entry as Record<string, unknown>;
  return {
    command: typeof record.command === 'string' ? record.command : null,
    args: Array.isArray(record.args)
      ? record.args.filter((arg): arg is string => typeof arg === 'string')
      : [],
  };
}

function entryRunsToolchain(name: string, entry: unknown): boolean {
  const { command, args } = entryDetails(entry);
  const haystack = [name, command ?? '', ...args].join('\n').toLowerCase();
  return TOOLCHAIN_MARKERS.some((marker) => haystack.includes(marker));
}

/**
 * The script the entry runs, when it names a file. Only a token ending in a JS
 * extension is a candidate, so a token, URL, or flag in `args` can never be
 * echoed back as a path.
 */
function scriptPathOf(entry: unknown): string | null {
  const { command, args } = entryDetails(entry);
  for (const value of [...args, command ?? '']) {
    const trimmed = value.trim();
    if (/\.(?:mjs|cjs|js)$/i.test(trimmed)) return trimmed;
  }
  return null;
}

function expandTilde(path: string, home: string): string {
  if (path === '~') return home;
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(home, path.slice(2));
  return path;
}

function collapseHome(path: string, home: string): string {
  if (!home) return path;
  if (path === home) return '~';
  if (path.startsWith(home + '/') || path.startsWith(home + '\\')) return `~${path.slice(home.length)}`;
  return path;
}

/**
 * A relative path would be resolved against this process's cwd, which says
 * nothing about where the host launches it, so only an absolute path is checked.
 */
function isMissingPath(scriptPath: string, home: string): boolean {
  const resolved = expandTilde(scriptPath, home);
  if (!isAbsolute(resolved)) return false;
  try {
    return !existsSync(resolved);
  } catch {
    return false;
  }
}

function jsonServers(text: string, keyPath: string[]): Record<string, unknown> | null {
  if (text.trim().length === 0) return {};
  const doc = parseJsonConfig(text);
  if (doc === undefined) return null;
  let node: unknown = doc;
  for (const key of keyPath) {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) return {};
    node = (node as Record<string, unknown>)[key];
  }
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return {};
  return node as Record<string, unknown>;
}

function stripTomlComment(line: string): string {
  let inBasic = false;
  let inLiteral = false;
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inBasic) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inBasic = false;
      continue;
    }
    if (inLiteral) {
      if (ch === "'") inLiteral = false;
      continue;
    }
    if (ch === '"') inBasic = true;
    else if (ch === "'") inLiteral = true;
    else if (ch === '#') return line.slice(0, i);
  }
  return line;
}

const TOML_ESCAPES: Record<string, string> = {
  n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\',
};

function unescapeToml(value: string): string {
  return value.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, esc: string) =>
    esc.startsWith('u') ? String.fromCharCode(parseInt(esc.slice(1), 16)) : TOML_ESCAPES[esc] ?? esc);
}

/** Read the TOML string starting at `start` (a quote), or null when unterminated. */
function readTomlString(text: string, start: number): { raw: string; next: number } | null {
  const quote = text[start];
  if (quote !== '"' && quote !== "'") return null;
  let raw = '';
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (quote === '"' && ch === '\\') {
      raw += ch + (text[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (ch === quote) return { raw, next: i + 1 };
    raw += ch;
    i++;
  }
  return null;
}

function tomlDottedName(text: string): string[] | null {
  const parts: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const read = readTomlString(text, i);
      if (!read) return null;
      parts.push(ch === '"' ? unescapeToml(read.raw) : read.raw);
      i = read.next;
      continue;
    }
    if (ch === '.') {
      i++;
      continue;
    }
    let j = i;
    while (j < text.length && text[j] !== '.') j++;
    const bare = text.slice(i, j).trim();
    if (!bare) return null;
    parts.push(bare);
    i = j;
  }
  return parts;
}

/** True once the brackets opened by the value's first `[` have balanced. */
function arrayClosed(text: string): boolean {
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const read = readTomlString(text, i);
      if (!read) return false;
      i = read.next;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return true;
    }
    i++;
  }
  return false;
}

function tomlStringArray(text: string): string[] | null {
  const values: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const read = readTomlString(text, i);
      if (!read) return null;
      values.push(ch === '"' ? unescapeToml(read.raw) : read.raw);
      i = read.next;
      continue;
    }
    i++;
  }
  return values;
}

interface TomlServer {
  command: string | null;
  args: string[];
}

type TomlDelimiter = '"""' | "'''";
type TomlMultiline = TomlDelimiter | null;

/**
 * The multi-line-string state after a line. A line that opens `"""` or `'''`
 * without closing it starts a string; the later line that closes it ends one.
 * Lines in between are string content and must not be read as TOML.
 *
 * A delimiter only opens a string when it is not the content of an ordinary
 * quoted value, so the `'''` in `description = "use ''' here"` opens nothing and
 * the table below it is still read. When `open` is set the line is raw content,
 * not comment-stripped, so scanning it as TOML would be wrong.
 */
function multilineStateAfter(line: string, open: TomlMultiline): TomlMultiline {
  if (open !== null) return line.includes(open) ? null : open;

  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      const delimiter: TomlDelimiter = ch === '"' ? '"""' : "'''";
      if (line.startsWith(delimiter, i)) {
        const close = line.indexOf(delimiter, i + 3);
        if (close === -1) return delimiter;
        i = close + 3;
        continue;
      }
      // A single-line value: step over it, since its content is not TOML.
      const read = readTomlString(line, i);
      if (!read) return null;
      i = read.next;
      continue;
    }
    i++;
  }
  return null;
}

/**
 * Whether an unparseable table header could name the table we read. A file is
 * only "malformed" for our purposes when the broken header is ours; a broken or
 * unrelated `[link](...)`-style line elsewhere must not hide a good entry.
 */
function couldBeTable(inner: string, table: string): boolean {
  const head = inner.split('.')[0].trim();
  return head === table || head === `"${table}"` || head === `'${table}'`;
}

/**
 * A minimal reader for the one TOML shape the hosts use — `[mcp_servers.<name>]`
 * with `command` and `args` — so the doctor needs no TOML dependency. Anything
 * it cannot read as that shape yields null, which the caller reports as a parse
 * error rather than guessing.
 */
function tomlServers(text: string, table: string): Record<string, TomlServer> | null {
  if (text.trim().length === 0) return {};
  // A null prototype, so a table named `constructor` or `__proto__` is an
  // ordinary own key rather than a hit on Object.prototype.
  const servers = Object.create(null) as Record<string, TomlServer>;
  const lines = text.split(/\r?\n/);
  let current: string | null = null;
  let malformed = false;
  let multiline: TomlMultiline = null;

  const ensure = (name: string): TomlServer => {
    servers[name] ??= { command: null, args: [] };
    return servers[name];
  };

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    if (multiline !== null) {
      multiline = multilineStateAfter(raw, multiline);
      continue;
    }
    const line = stripTomlComment(raw).trim();
    multiline = multilineStateAfter(line, null);
    if (line.length === 0) continue;

    if (line.startsWith('[')) {
      current = null;
      const closed = line.endsWith(']');
      const inner = closed ? line.slice(1, -1) : line.slice(1);
      if (!closed) {
        if (couldBeTable(inner, table)) malformed = true;
        continue;
      }
      const parts = tomlDottedName(inner);
      if (!parts || parts.length === 0) {
        if (couldBeTable(inner, table)) malformed = true;
        continue;
      }
      if (parts.length === 2 && parts[0] === table) current = parts[1];
      continue;
    }

    if (current === null) continue;
    const match = /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;

    if (key === 'command') {
      const read = readTomlString(value, 0);
      // A single-quoted literal string carries no escapes, so only a
      // double-quoted value is unescaped.
      if (!read) malformed = true;
      else ensure(current).command = value.startsWith('"') ? unescapeToml(read.raw) : read.raw;
      continue;
    }

    if (key !== 'args') continue;

    // An array may be written across several lines; consume until it closes.
    const chunks = [value];
    while (!arrayClosed(chunks.join('\n'))) {
      if (index + chunks.length >= lines.length) break;
      chunks.push(stripTomlComment(lines[index + chunks.length]).trim());
    }
    const joined = chunks.join('\n');
    const values = arrayClosed(joined) ? tomlStringArray(joined) : null;
    if (values === null) {
      malformed = true;
      continue;
    }
    ensure(current).args = values;
    index += chunks.length - 1;
  }

  return malformed ? null : servers;
}

function detectHost(
  descriptor: HostDescriptor,
  ctx: HostContext,
  overrideMaxBytes: number | undefined,
): McpHostWiring {
  const maxBytes = overrideMaxBytes ?? descriptor.maxConfigBytes ?? DEFAULT_MAX_CONFIG_BYTES;

  let installed = false;
  try {
    installed = descriptor.isInstalled
      ? descriptor.isInstalled(ctx)
      : existsSync(descriptor.installDir(ctx));
  } catch {
    installed = false;
  }

  let configFound = false;
  let unreadable = false;
  let wired = false;
  let stalePath = false;
  let scriptPath: string | null = null;

  for (const candidate of descriptor.configFiles(ctx)) {
    const read = readCapped(candidate.path, maxBytes);
    if (read.kind === 'missing') continue;
    configFound = true;
    if (read.kind !== 'text') {
      unreadable = true;
      continue;
    }

    const servers = descriptor.format === 'toml'
      ? tomlServers(read.text, candidate.servers[0])
      : jsonServers(read.text, candidate.servers);
    if (servers === null) {
      unreadable = true;
      continue;
    }

    const match = Object.entries(servers).find(([name, entry]) => entryRunsToolchain(name, entry));
    if (!match) continue;

    const script = scriptPathOf(match[1]);
    wired = true;
    stalePath = script !== null && isMissingPath(script, ctx.home);
    scriptPath = script === null ? null : collapseHome(script, ctx.home);
    break;
  }

  return {
    id: descriptor.id,
    displayName: descriptor.displayName,
    installed,
    configFound,
    wired,
    stalePath: wired && stalePath,
    parseError: unreadable && !wired,
    scriptPath,
  };
}

export function detectHostWiring(options: HostWiringOptions = {}): HostWiringReport {
  const ctx: HostContext = {
    platform: options.platform ?? platform(),
    home: options.homedir ?? homedir(),
    env: options.env ?? process.env,
  };
  const hosts = HOSTS.map((descriptor) => detectHost(descriptor, ctx, options.maxConfigBytes));

  return {
    hosts,
    anyWired: hosts.some((host) => host.wired && !host.stalePath),
    staleHosts: hosts.filter((host) => host.wired && host.stalePath).map((host) => host.id),
  };
}
