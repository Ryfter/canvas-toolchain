import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir, platform as osPlatform } from 'node:os';
import { dirname, join } from 'node:path';
import { detectHostWiring } from '../../src/setup/hosts.js';
import type { HostWiringReport, McpHostId, McpHostWiring } from '../../src/setup/types.js';

/** Directories the detector derives from its injected context. */
interface Dirs {
  home: string;
  appData: string;
  xdg: string;
}

const MAC = 'darwin';
const WIN = 'win32';
const LINUX = 'linux';
const POSIX = osPlatform() !== 'win32';

let root: string;
let appData: string;
let xdg: string;

const dirs = (): Dirs => ({ home: root, appData, xdg });
const env = (): Record<string, string> => ({ APPDATA: appData, XDG_CONFIG_HOME: xdg });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mcp-hosts-'));
  appData = join(root, 'appdata');
  xdg = join(root, 'xdg');
});

afterEach(() => {
  unlock(root);
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------- fixtures

function claudeDesktopDir(d: Dirs, p: NodeJS.Platform): string {
  if (p === WIN) return join(d.appData, 'Claude');
  if (p === MAC) return join(d.home, 'Library', 'Application Support', 'Claude');
  return join(d.home, '.config', 'Claude');
}

function vscodeUserDir(d: Dirs, p: NodeJS.Platform): string {
  if (p === WIN) return join(d.appData, 'Code', 'User');
  if (p === MAC) return join(d.home, 'Library', 'Application Support', 'Code', 'User');
  return join(d.home, '.config', 'Code', 'User');
}

function zedDir(d: Dirs, p: NodeJS.Platform): string {
  if (p === WIN) return join(d.appData, 'Zed');
  if (p === MAC) return join(d.home, '.config', 'zed');
  return join(d.xdg, 'zed');
}

function seedFile(path: string, body: string): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, 'utf-8');
  return path;
}

/** The wired entry the installer writes: `node <checkout>/packages/command-and-control/dist/index.js`. */
function seedScript(relative = join('ct', 'packages', 'command-and-control', 'dist', 'index.js')): string {
  return seedFile(join(root, relative), '// canvas-toolchain mcp entry\n');
}

function nodeEntry(script: string): Record<string, unknown> {
  return {
    command: '/usr/local/bin/node',
    args: [script],
    env: { CANVAS_TOKEN: 'tok-secret' },
  };
}

/** The script path as the report renders it: home collapsed to `~`. */
function collapsed(script: string): string {
  return `~${script.slice(root.length)}`;
}

function tomlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function tomlEntry(script: string): string {
  return [
    '[mcp_servers.other]',
    'command = "npx"',
    'args = ["-y", "unrelated-server"]',
    '',
    '[mcp_servers.canvas-toolchain]',
    'command = "/usr/local/bin/node"',
    `args = ["${tomlString(script)}"]`,
    'env = { CANVAS_TOKEN = "tok-secret" }',
    '',
  ].join('\n');
}

interface HostCase {
  id: McpHostId;
  displayName: string;
  platforms: NodeJS.Platform[];
  file(d: Dirs, p: NodeJS.Platform): string;
  installDir(d: Dirs, p: NodeJS.Platform): string;
  body(script: string): string;
}

const HOST_CASES: HostCase[] = [
  {
    id: 'claude-desktop',
    displayName: 'Claude Desktop',
    platforms: [MAC, WIN, LINUX],
    file: (d, p) => join(claudeDesktopDir(d, p), 'claude_desktop_config.json'),
    installDir: claudeDesktopDir,
    body: (script) => JSON.stringify({ mcpServers: { 'canvas-toolchain': nodeEntry(script) } }, null, 2),
  },
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    platforms: [MAC, WIN, LINUX],
    file: (d) => join(d.home, '.claude.json'),
    installDir: (d) => join(d.home, '.claude'),
    body: (script) => JSON.stringify({ mcpServers: { 'canvas-toolchain': nodeEntry(script) } }, null, 2),
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    platforms: [MAC, WIN, LINUX],
    file: (d) => join(d.home, '.cursor', 'mcp.json'),
    installDir: (d) => join(d.home, '.cursor'),
    body: (script) => JSON.stringify({ mcpServers: { 'canvas-toolchain': nodeEntry(script) } }, null, 2),
  },
  {
    id: 'vscode',
    displayName: 'VS Code',
    platforms: [MAC, WIN, LINUX],
    file: (d, p) => join(vscodeUserDir(d, p), 'mcp.json'),
    installDir: (d, p) => vscodeUserDir(d, p),
    body: (script) =>
      JSON.stringify({ servers: { 'canvas-toolchain': { type: 'stdio', ...nodeEntry(script) } } }, null, 2),
  },
  {
    id: 'windsurf',
    displayName: 'Windsurf',
    platforms: [MAC, WIN, LINUX],
    file: (d) => join(d.home, '.codeium', 'windsurf', 'mcp_config.json'),
    installDir: (d) => join(d.home, '.codeium', 'windsurf'),
    body: (script) => JSON.stringify({ mcpServers: { 'canvas-toolchain': nodeEntry(script) } }, null, 2),
  },
  {
    id: 'zed',
    displayName: 'Zed',
    platforms: [MAC, WIN, LINUX],
    file: (d, p) => join(zedDir(d, p), 'settings.json'),
    installDir: zedDir,
    body: (script) => JSON.stringify({ context_servers: { 'canvas-toolchain': nodeEntry(script) } }, null, 2),
  },
  {
    id: 'codex',
    displayName: 'Codex CLI',
    platforms: [MAC, WIN, LINUX],
    file: (d) => join(d.home, '.codex', 'config.toml'),
    installDir: (d) => join(d.home, '.codex'),
    body: tomlEntry,
  },
  {
    id: 'gemini',
    displayName: 'Gemini CLI',
    platforms: [MAC, WIN, LINUX],
    file: (d) => join(d.home, '.gemini', 'settings.json'),
    installDir: (d) => join(d.home, '.gemini'),
    body: (script) => JSON.stringify({ mcpServers: { 'canvas-toolchain': nodeEntry(script) } }, null, 2),
  },
  {
    id: 'kiro',
    displayName: 'Kiro',
    platforms: [MAC, WIN, LINUX],
    file: (d) => join(d.home, '.kiro', 'settings', 'mcp.json'),
    installDir: (d) => join(d.home, '.kiro'),
    body: (script) => JSON.stringify({ mcpServers: { 'canvas-toolchain': nodeEntry(script) } }, null, 2),
  },
  {
    id: 'antigravity',
    displayName: 'Antigravity',
    platforms: [MAC, WIN, LINUX],
    file: (d) => join(d.home, '.gemini', 'config', 'mcp_config.json'),
    installDir: (d) => join(d.home, '.gemini', 'config'),
    body: (script) => JSON.stringify({ mcpServers: { 'canvas-toolchain': nodeEntry(script) } }, null, 2),
  },
];

// ---------------------------------------------------------------- helpers

function detect(injected: Partial<{ platform: NodeJS.Platform }> = {}): HostWiringReport {
  return detectHostWiring({
    platform: injected.platform ?? MAC,
    homedir: root,
    env: env(),
  });
}

function hostOf(report: HostWiringReport, id: McpHostId): McpHostWiring {
  const found = report.hosts.find((host) => host.id === id);
  if (!found) throw new Error(`no host ${id}`);
  return found;
}

function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      out.push(`${entry.isDirectory() ? 'dir ' : 'file'} ${path}`);
      if (entry.isDirectory()) walk(path);
    }
  };
  walk(dir);
  return out.sort();
}

function lock(dir: string): void {
  if (!POSIX) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) lock(join(dir, entry.name));
  }
  chmodSync(dir, 0o555);
}

function unlock(dir: string): void {
  if (!POSIX) return;
  try {
    chmodSync(dir, 0o755);
  } catch {
    return;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = join(dir, entry.name);
    if (entry.isDirectory()) unlock(child);
  }
}

// ---------------------------------------------------------------- tests

describe('detectHostWiring paths', () => {
  it('returns all ten hosts, in a stable order, on an empty home', () => {
    const report = detect();

    expect(report.hosts.map((host) => host.id)).toEqual([
      'claude-desktop', 'claude-code', 'cursor', 'vscode', 'windsurf', 'zed', 'codex', 'gemini',
      'kiro', 'antigravity',
    ]);
    expect(report.anyWired).toBe(false);
    expect(report.staleHosts).toEqual([]);
    for (const host of report.hosts) {
      expect(host.installed).toBe(false);
      expect(host.configFound).toBe(false);
      expect(host.wired).toBe(false);
      expect(host.stalePath).toBe(false);
      expect(host.parseError).toBe(false);
      expect(host.scriptPath).toBeNull();
      expect(host.displayName.length).toBeGreaterThan(0);
    }
  });

  it('creates nothing on an empty home', () => {
    const before = snapshot(root);
    detect();
    expect(snapshot(root)).toEqual(before);
  });

  for (const host of HOST_CASES) {
    for (const platform of host.platforms) {
      it(`finds ${host.displayName} wired on ${platform}`, () => {
        const script = seedScript();
        seedFile(host.file(dirs(), platform), host.body(script));
        mkdirSync(host.installDir(dirs(), platform), { recursive: true });

        const entry = hostOf(detect({ platform }), host.id);

        expect(entry.installed).toBe(true);
        expect(entry.configFound).toBe(true);
        expect(entry.wired).toBe(true);
        expect(entry.stalePath).toBe(false);
        expect(entry.parseError).toBe(false);
        expect(entry.scriptPath).toBe(collapsed(script));
      });
    }
  }

  it('reports an installed host whose config does not exist yet', () => {
    mkdirSync(join(root, '.cursor'), { recursive: true });

    const cursor = hostOf(detect(), 'cursor');

    expect(cursor.installed).toBe(true);
    expect(cursor.configFound).toBe(false);
    expect(cursor.wired).toBe(false);
  });

  it('reports a host whose config holds other servers as not wired', () => {
    seedFile(
      join(root, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { github: { command: 'npx', args: ['-y', '@mcp/github'] } } }, null, 2),
    );

    const cursor = hostOf(detect(), 'cursor');

    expect(cursor.configFound).toBe(true);
    expect(cursor.wired).toBe(false);
    expect(cursor.scriptPath).toBeNull();
  });

  it('honors XDG_CONFIG_HOME for Zed on Linux', () => {
    const script = seedScript();
    const body = JSON.stringify({ context_servers: { 'canvas-toolchain': nodeEntry(script) } });
    seedFile(join(xdg, 'zed', 'settings.json'), body);

    expect(hostOf(detect({ platform: LINUX }), 'zed').wired).toBe(true);
    // The same file under ~/.config is not where a Linux Zed with XDG set looks.
    expect(hostOf(detect({ platform: MAC }), 'zed').wired).toBe(false);
  });

  it('does not report Gemini CLI installed on an Antigravity-only ~/.gemini', () => {
    mkdirSync(join(root, '.gemini', 'config'), { recursive: true });

    expect(hostOf(detect(), 'gemini').installed).toBe(false);
    expect(hostOf(detect(), 'antigravity').installed).toBe(true);
  });

  it('reports Gemini CLI installed from its settings file, alongside Antigravity', () => {
    seedFile(join(root, '.gemini', 'settings.json'), JSON.stringify({ mcpServers: {} }));
    mkdirSync(join(root, '.gemini', 'config'), { recursive: true });

    expect(hostOf(detect(), 'gemini').installed).toBe(true);
  });
});

describe('detectHostWiring entries', () => {
  it('matches a server entry named canvas-toolchain, whatever it runs', () => {
    seedFile(
      join(root, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: { 'canvas-toolchain': { command: 'npx', args: ['-y', 'canvas-toolchain'] } },
      }),
    );

    const cursor = hostOf(detect(), 'cursor');

    expect(cursor.wired).toBe(true);
    // Nothing to check on disk, so a package runner is never called stale.
    expect(cursor.scriptPath).toBeNull();
    expect(cursor.stalePath).toBe(false);
  });

  it('matches a differently named entry that runs the checkout', () => {
    const script = seedScript(join('dev', 'canvas-toolchain', 'packages', 'command-and-control', 'dist', 'index.js'));
    seedFile(
      join(root, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { 'teaching-tools': { command: 'node', args: [script] } } }),
    );

    expect(hostOf(detect(), 'cursor').wired).toBe(true);
  });

  it('does not match an unrelated MCP server', () => {
    seedFile(
      join(root, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: { filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] } },
      }),
    );

    expect(hostOf(detect(), 'cursor').wired).toBe(false);
  });

  it('flags a wired entry whose script is gone', () => {
    const gone = join(root, 'moved-checkout', 'dist', 'index.js');
    seedFile(
      join(root, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { 'canvas-toolchain': { command: 'node', args: [gone] } } }),
    );

    const report = detect();
    const cursor = hostOf(report, 'cursor');

    expect(cursor.wired).toBe(true);
    expect(cursor.stalePath).toBe(true);
    expect(cursor.scriptPath).toBe(collapsed(gone));
    expect(report.staleHosts).toEqual(['cursor']);
    expect(report.anyWired).toBe(false);
  });

  it('expands a leading ~ before checking whether the script exists', () => {
    const script = seedScript(join('ct', 'dist', 'index.js'));
    seedFile(
      join(root, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: { 'canvas-toolchain': { command: 'node', args: [`~${script.slice(root.length)}`] } },
      }),
    );

    const cursor = hostOf(detect(), 'cursor');

    expect(cursor.wired).toBe(true);
    expect(cursor.stalePath).toBe(false);
    expect(cursor.scriptPath).toBe(collapsed(script));
  });

  it('never calls a relative script path stale, since its cwd is the host\'s, not ours', () => {
    seedFile(
      join(root, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { 'canvas-toolchain': { command: 'node', args: ['./dist/index.js'] } } }),
    );

    const cursor = hostOf(detect(), 'cursor');

    expect(cursor.wired).toBe(true);
    expect(cursor.stalePath).toBe(false);
  });

  it('counts a host as wired once, so anyWired survives one stale host', () => {
    const script = seedScript();
    seedFile(join(root, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { 'canvas-toolchain': nodeEntry(script) } }));
    seedFile(
      join(root, '.gemini', 'settings.json'),
      JSON.stringify({ mcpServers: { 'canvas-toolchain': { command: 'node', args: [join(root, 'gone', 'index.js')] } } }),
    );

    const report = detect();

    expect(report.anyWired).toBe(true);
    expect(report.staleHosts).toEqual(['gemini']);
  });
});

describe('detectHostWiring unreadable configs', () => {
  it('reports a corrupt config as a parse error instead of throwing', () => {
    seedFile(join(root, '.cursor', 'mcp.json'), '{ "mcpServers": nope');

    const cursor = hostOf(detect(), 'cursor');

    expect(cursor.configFound).toBe(true);
    expect(cursor.parseError).toBe(true);
    expect(cursor.wired).toBe(false);
  });

  it('never reads a config past the size cap', () => {
    const script = seedScript();
    seedFile(
      join(root, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { 'canvas-toolchain': nodeEntry(script) } }).padEnd(1_100_000, ' '),
    );

    const cursor = hostOf(detect(), 'cursor');

    expect(cursor.parseError).toBe(true);
    expect(cursor.wired).toBe(false);
    expect(cursor.scriptPath).toBeNull();
  });

  it('honors an injected cap', () => {
    seedFile(join(root, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: {} }));

    const report = detectHostWiring({
      platform: MAC, homedir: root, env: env(), maxConfigBytes: 4,
    });

    expect(hostOf(report, 'cursor').parseError).toBe(true);
  });

  it('reads a Claude Code config well past the default cap', () => {
    const script = seedScript();
    seedFile(
      join(root, '.claude.json'),
      JSON.stringify({
        mcpServers: { 'canvas-toolchain': nodeEntry(script) },
        history: 'x'.repeat(2_000_000),
      }),
    );
    mkdirSync(join(root, '.claude'), { recursive: true });

    const claudeCode = hostOf(detect(), 'claude-code');

    expect(claudeCode.wired).toBe(true);
    expect(claudeCode.parseError).toBe(false);
    expect(claudeCode.scriptPath).toBe(collapsed(script));
  });

  it('still applies an injected cap to the larger Claude Code config', () => {
    seedFile(join(root, '.claude.json'), JSON.stringify({ mcpServers: {} }));

    const report = detectHostWiring({
      platform: MAC, homedir: root, env: env(), maxConfigBytes: 4,
    });

    expect(hostOf(report, 'claude-code').parseError).toBe(true);
  });

  it('treats an empty config as nothing configured, not as corrupt', () => {
    seedFile(join(root, '.cursor', 'mcp.json'), '\n  \n');

    const cursor = hostOf(detect(), 'cursor');

    expect(cursor.configFound).toBe(true);
    expect(cursor.parseError).toBe(false);
    expect(cursor.wired).toBe(false);
  });

  it('reports a parse error on one VS Code shape without hiding the other', () => {
    seedFile(join(root, '.config', 'Code', 'User', 'settings.json'), '{ nope');
    const script = seedScript();
    seedFile(
      join(root, '.config', 'Code', 'User', 'mcp.json'),
      JSON.stringify({ servers: { 'canvas-toolchain': { type: 'stdio', ...nodeEntry(script) } } }),
    );

    const vscode = hostOf(detect({ platform: LINUX }), 'vscode');

    expect(vscode.wired).toBe(true);
    expect(vscode.parseError).toBe(false);
  });

  it('finds VS Code wiring in the user settings.json mcp block', () => {
    const script = seedScript();
    seedFile(
      join(root, '.config', 'Code', 'User', 'settings.json'),
      JSON.stringify({ 'editor.fontSize': 14, mcp: { servers: { 'canvas-toolchain': nodeEntry(script) } } }),
    );

    expect(hostOf(detect({ platform: LINUX }), 'vscode').wired).toBe(true);
  });
});

describe('detectHostWiring TOML (Codex CLI)', () => {
  it('reads the entry out of the table the installer writes', () => {
    const script = seedScript();
    seedFile(join(root, '.codex', 'config.toml'), tomlEntry(script));

    const codex = hostOf(detect(), 'codex');

    expect(codex.wired).toBe(true);
    expect(codex.scriptPath).toBe(collapsed(script));
    expect(codex.stalePath).toBe(false);
    expect(codex.parseError).toBe(false);
  });

  it('reads an args array written across several lines', () => {
    const script = seedScript();
    seedFile(
      join(root, '.codex', 'config.toml'),
      [
        'model = "gpt-5"',
        '',
        '[mcp_servers.canvas-toolchain]',
        'command = "/usr/local/bin/node"',
        'args = [',
        '  "--enable-source-maps",',
        `  "${tomlString(script)}",  # the MCP entry`,
        ']',
        '',
        '[other]',
        'key = "value"',
        '',
      ].join('\n'),
    );

    const codex = hostOf(detect(), 'codex');

    expect(codex.wired).toBe(true);
    expect(codex.scriptPath).toBe(collapsed(script));
  });

  it('reads a quoted table name', () => {
    const script = seedScript();
    seedFile(
      join(root, '.codex', 'config.toml'),
      [
        '[mcp_servers."canvas-toolchain"]',
        'command = "/usr/local/bin/node"',
        `args = ["${tomlString(script)}"]`,
        '',
      ].join('\n'),
    );

    expect(hostOf(detect(), 'codex').wired).toBe(true);
  });

  it('reports other Codex servers as not wired', () => {
    seedFile(
      join(root, '.codex', 'config.toml'),
      ['[mcp_servers.filesystem]', 'command = "npx"', 'args = ["-y", "@mcp/fs"]', ''].join('\n'),
    );

    const codex = hostOf(detect(), 'codex');

    expect(codex.configFound).toBe(true);
    expect(codex.wired).toBe(false);
    expect(codex.parseError).toBe(false);
  });

  it('handles CRLF line endings, which a Windows checkout produces', () => {
    const script = seedScript();
    seedFile(join(root, '.codex', 'config.toml'), tomlEntry(script).replace(/\n/g, '\r\n'));

    expect(hostOf(detect({ platform: WIN }), 'codex').wired).toBe(true);
  });

  it('reports broken TOML as a parse error instead of throwing', () => {
    const script = seedScript();
    seedFile(
      join(root, '.codex', 'config.toml'),
      ['[mcp_servers.canvas-toolchain', `command = "node"`, `args = ["${tomlString(script)}"]`].join('\n'),
    );

    const codex = hostOf(detect(), 'codex');

    expect(codex.parseError).toBe(true);
    expect(codex.wired).toBe(false);
  });

  it('reports an unterminated args array as a parse error', () => {
    seedFile(
      join(root, '.codex', 'config.toml'),
      ['[mcp_servers.canvas-toolchain]', 'command = "node"', 'args = ["canvas-toolchain"'].join('\n'),
    );

    expect(hostOf(detect(), 'codex').parseError).toBe(true);
  });

  it('ignores a command that is not a string', () => {
    seedFile(
      join(root, '.codex', 'config.toml'),
      ['[mcp_servers.canvas-toolchain]', 'command = 5', 'args = ["canvas-toolchain"]'].join('\n'),
    );

    const codex = hostOf(detect(), 'codex');

    expect(codex.parseError).toBe(true);
    expect(codex.wired).toBe(false);
  });

  it('keeps a single-quoted literal command path unescaped', () => {
    const literal = 'C:\\tools\\canvas-toolchain\\dist\\index.js';
    seedFile(
      join(root, '.codex', 'config.toml'),
      ['[mcp_servers.canvas-toolchain]', `command = '${literal}'`, 'args = []', ''].join('\n'),
    );

    const codex = hostOf(detect(), 'codex');

    expect(codex.wired).toBe(true);
    expect(codex.parseError).toBe(false);
    expect(codex.scriptPath).toBe(literal);
  });

  it('reads a table named after an Object.prototype key', () => {
    seedFile(
      join(root, '.codex', 'config.toml'),
      ['[mcp_servers.constructor]', 'command = "npx"', 'args = ["-y", "canvas-toolchain"]', ''].join('\n'),
    );

    const codex = hostOf(detect(), 'codex');

    expect(codex.parseError).toBe(false);
    expect(codex.wired).toBe(true);
  });

  it('ignores table-like lines inside a multi-line string', () => {
    const script = seedScript();
    seedFile(
      join(root, '.codex', 'config.toml'),
      [
        '[mcp_servers.canvas-toolchain]',
        'command = "/usr/local/bin/node"',
        `args = ["${tomlString(script)}"]`,
        '',
        'developer_instructions = """',
        'Read the docs at https://example.com.',
        '[not a table header',
        '"""',
        '',
      ].join('\n'),
    );

    const codex = hostOf(detect(), 'codex');

    expect(codex.wired).toBe(true);
    expect(codex.parseError).toBe(false);
    expect(codex.scriptPath).toBe(collapsed(script));
  });

  it('ignores table-like lines inside a multi-line literal string', () => {
    const script = seedScript();
    seedFile(
      join(root, '.codex', 'config.toml'),
      [
        '[mcp_servers.canvas-toolchain]',
        'command = "/usr/local/bin/node"',
        `args = ["${tomlString(script)}"]`,
        '',
        "prompt = '''",
        'See [the guide](https://example.com).',
        '[still not a header',
        "'''",
        '',
      ].join('\n'),
    );

    expect(hostOf(detect(), 'codex').wired).toBe(true);
    expect(hostOf(detect(), 'codex').parseError).toBe(false);
  });

  it('does not open a multi-line string on a triple quote inside a single-line value', () => {
    const script = seedScript();
    seedFile(
      join(root, '.codex', 'config.toml'),
      [
        'developer_instructions = "use \'\'\' when quoting"',
        '',
        '[mcp_servers.canvas-toolchain]',
        'command = "/usr/local/bin/node"',
        `args = ["${tomlString(script)}"]`,
        '',
      ].join('\n'),
    );

    const codex = hostOf(detect(), 'codex');

    expect(codex.wired).toBe(true);
    expect(codex.parseError).toBe(false);
    expect(codex.scriptPath).toBe(collapsed(script));
  });

  it('skips a line naming our own table when it sits inside a multi-line string', () => {
    const script = seedScript();
    seedFile(
      join(root, '.codex', 'config.toml'),
      [
        '[mcp_servers.canvas-toolchain]',
        'command = "/usr/local/bin/node"',
        `args = ["${tomlString(script)}"]`,
        '',
        'developer_instructions = """',
        'The entry is documented as',
        '[mcp_servers.canvas-toolchain',
        '"""',
        '',
      ].join('\n'),
    );

    const codex = hostOf(detect(), 'codex');

    expect(codex.wired).toBe(true);
    expect(codex.parseError).toBe(false);
  });

  it('does not let a broken unrelated section hide our entry', () => {
    const script = seedScript();
    seedFile(
      join(root, '.codex', 'config.toml'),
      [
        '[mcp_servers.canvas-toolchain]',
        'command = "/usr/local/bin/node"',
        `args = ["${tomlString(script)}"]`,
        '',
        '[unrelated',
        'key = "value"',
        '',
      ].join('\n'),
    );

    const codex = hostOf(detect(), 'codex');

    expect(codex.wired).toBe(true);
    expect(codex.parseError).toBe(false);
  });
});

describe('detectHostWiring JSONC (Zed, VS Code)', () => {
  it('reads the commented settings file Zed ships on first run', () => {
    const script = seedScript();
    seedFile(
      join(root, '.config', 'zed', 'settings.json'),
      [
        '// Zed settings',
        '//',
        '// For information on how to configure Zed, see https://zed.dev/docs/configuring-zed',
        '{',
        '  "context_servers": {',
        '    "canvas-toolchain": {',
        '      "command": "/usr/local/bin/node",',
        `      "args": ["${script.replace(/\\/g, '\\\\')}"]`,
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
    );

    const zed = hostOf(detect(), 'zed');

    expect(zed.wired).toBe(true);
    expect(zed.scriptPath).toBe(collapsed(script));
  });

  it('keeps a // inside a value, where it is not a comment', () => {
    seedFile(
      join(root, '.config', 'zed', 'settings.json'),
      [
        '{',
        '  "theme": "One Dark",',
        '  "context_servers": {',
        '    "remote": { "url": "https://mcp.example.com/mcp" }, // remote, not ours',
        '    "canvas-toolchain": { "command": "npx", "args": ["-y", "canvas-toolchain"] }',
        '  }',
        '}',
        '',
      ].join('\n'),
    );

    const zed = hostOf(detect(), 'zed');

    expect(zed.parseError).toBe(false);
    expect(zed.wired).toBe(true);
  });

  it('reads a settings file with trailing commas, which JSONC allows', () => {
    seedFile(
      join(root, '.config', 'zed', 'settings.json'),
      [
        '{',
        '  "context_servers": {',
        '    "canvas-toolchain": { "command": "npx", "args": ["-y", "canvas-toolchain"], },',
        '  },',
        '}',
        '',
      ].join('\n'),
    );

    const zed = hostOf(detect(), 'zed');

    expect(zed.parseError).toBe(false);
    expect(zed.wired).toBe(true);
  });

  it('never strips a brace-looking comma that sits inside a string', () => {
    // The comma in `weird,}name.js` is followed by `}` inside a string, so a
    // naive comma-before-brace regex would rewrite the value. Asserting the
    // reported path catches that; a bare parse/wired check would not, because
    // the mangled file is still valid JSON.
    const script = seedScript(join('ct', 'weird,}name.js'));
    seedFile(
      join(root, '.config', 'zed', 'settings.json'),
      [
        '// Zed settings',
        '{',
        '  "note": "a,}b",',
        '  "context_servers": {',
        `    "canvas-toolchain": { "command": "/usr/local/bin/node", "args": ["${script.replace(/\\/g, '\\\\')}"], },`,
        '  },',
        '}',
        '',
      ].join('\n'),
    );

    const zed = hostOf(detect(), 'zed');

    expect(zed.parseError).toBe(false);
    expect(zed.wired).toBe(true);
    expect(zed.scriptPath).toBe(collapsed(script));
  });

  it('still reports a genuinely corrupt config', () => {
    seedFile(join(root, '.config', 'zed', 'settings.json'), '{ "context_servers": ');

    const zed = hostOf(detect(), 'zed');

    expect(zed.parseError).toBe(true);
    expect(zed.wired).toBe(false);
  });
});

describe('detectHostWiring never leaks', () => {
  it('surfaces only booleans and our own script path, never another server', () => {
    const script = seedScript();
    seedFile(
      join(root, '.cursor', 'mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            'canvas-toolchain': {
              command: '/usr/local/bin/node',
              args: ['--experimental', script],
              env: { CANVAS_TOKEN: 'tok-secret', ANTHROPIC_API_KEY: 'sk-ant-tool-secret' },
            },
            unrelated: {
              command: '/usr/local/bin/python',
              args: ['/opt/server.py', '--token', 'sk-ant-other-secret'],
              env: { API_KEY: 'other-env-secret' },
            },
          },
        },
        null,
        2,
      ),
    );

    const dumped = JSON.stringify(detect());

    for (const secret of ['tok-secret', 'sk-ant-tool-secret', 'sk-ant-other-secret', 'other-env-secret']) {
      expect(dumped).not.toContain(secret);
    }
    // The one path we do report is ours, and it is home-relative.
    expect(dumped).toContain(collapsed(script));
    expect(dumped).not.toContain('/opt/server.py');
  });

  it('never echoes a token that sits in an arg rather than in a script path', () => {
    seedFile(
      join(root, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          'canvas-toolchain': { command: 'npx', args: ['-y', 'canvas-toolchain', '--token=sk-ant-arg-secret'] },
        },
      }),
    );

    const report = detect();

    expect(hostOf(report, 'cursor').wired).toBe(true);
    expect(hostOf(report, 'cursor').scriptPath).toBeNull();
    expect(JSON.stringify(report)).not.toContain('sk-ant-arg-secret');
  });
});

describe('detectHostWiring is read-only', () => {
  it('detects a wired host in a read-only tree and changes nothing', () => {
    const script = seedScript();
    seedFile(join(root, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { 'canvas-toolchain': nodeEntry(script) } }));
    const before = snapshot(root);

    lock(root);
    const report = detect();
    unlock(root);

    expect(hostOf(report, 'cursor').wired).toBe(true);
    expect(snapshot(root)).toEqual(before);
  });

  it('changes nothing even when every config is unreadable', () => {
    seedFile(join(root, '.cursor', 'mcp.json'), '{ nope');
    seedFile(join(root, '.codex', 'config.toml'), '[mcp_servers');
    const before = snapshot(root);

    lock(root);
    const report = detect();
    unlock(root);

    expect(report.hosts.filter((host) => host.parseError).map((host) => host.id)).toEqual(['cursor', 'codex']);
    expect(snapshot(root)).toEqual(before);
  });

  it('leaves a config file\'s mtime alone', () => {
    const path = seedFile(join(root, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: {} }));
    const before = statSync(path).mtimeMs;

    detect();
    detect();

    expect(statSync(path).mtimeMs).toBe(before);
  });
});
