import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { runDoctor } from '../../src/setup/doctor.js';
import { readSetupState } from '../../src/setup/read_state.js';
import { buildRegistry } from '../../src/surface/registry.js';
import { dispatchSurface } from '../../src/surface/dispatch.js';

const CHECK_IDS = [
  'runtime.courses_root',
  'security.file_permissions',
  'canvas.credentials',
  'canvas.store_sync',
  'llm.active_provider',
  'llm.credentials',
  'transcripts.source',
  'backup.sidecar',
  'modules.pending',
  'modules.credentials',
  'hosts.wiring',
  'paths.homes',
];

let ccHome: string;
let cdsHome: string;
let hostHome: string;
const ORIGINAL = {
  ccHome: process.env.CC_HOME,
  cdsHome: process.env.CANVAS_DESIGN_HOME,
  backupCommand: process.env.CANVAS_BACKUP_COMMAND,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  home: process.env.HOME,
  userProfile: process.env.USERPROFILE,
  appData: process.env.APPDATA,
};

/** Seed a config file, 0600 like every writer in the repo, under either home. */
function seed(name: string, value: unknown, home: string = ccHome): string {
  const path = join(home, name);
  writeFileSync(path, JSON.stringify(value, null, 2), { encoding: 'utf-8', mode: 0o600 });
  return path;
}

/**
 * A wired MCP host, in the shape the installer writes: Cursor's config is
 * home-relative on every platform, so this fixture needs no per-OS branching.
 */
function seedWiredHost(scriptExists = true): string {
  const script = join(hostHome, 'packages', 'command-and-control', 'dist', 'index.js');
  if (scriptExists) {
    mkdirSync(dirname(script), { recursive: true });
    writeFileSync(script, '// canvas-toolchain mcp entry\n', 'utf-8');
  }
  mkdirSync(join(hostHome, '.cursor'), { recursive: true });
  writeFileSync(
    join(hostHome, '.cursor', 'mcp.json'),
    JSON.stringify({
      mcpServers: {
        'canvas-toolchain': { command: '/usr/local/bin/node', args: [script] },
        other: { command: 'npx', args: ['-y', 'other-server'], env: { OTHER_TOKEN: 'other-env-secret' } },
      },
    }, null, 2),
    'utf-8',
  );
  return script;
}

function check(report: Awaited<ReturnType<typeof runDoctor>>, id: string) {
  const found = report.checks.find((c) => c.id === id);
  if (!found) throw new Error(`no check ${id} in ${report.checks.map((c) => c.id).join(', ')}`);
  return found;
}

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  cdsHome = mkdtempSync(join(tmpdir(), 'cds-home-'));
  hostHome = mkdtempSync(join(tmpdir(), 'host-home-'));
  process.env.CC_HOME = ccHome;
  process.env.CANVAS_DESIGN_HOME = cdsHome;
  // Host detection reads the OS home, so point it at a temp dir: otherwise the
  // doctor would report on whatever this machine really has configured.
  process.env.HOME = hostHome;
  process.env.USERPROFILE = hostHome;
  process.env.APPDATA = join(hostHome, 'AppData', 'Roaming');
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CANVAS_BACKUP_COMMAND;
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network call in test'))));
});

afterEach(() => {
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(cdsHome, { recursive: true, force: true });
  rmSync(hostHome, { recursive: true, force: true });
  for (const [key, value] of Object.entries({
    CC_HOME: ORIGINAL.ccHome,
    CANVAS_DESIGN_HOME: ORIGINAL.cdsHome,
    CANVAS_BACKUP_COMMAND: ORIGINAL.backupCommand,
    ANTHROPIC_API_KEY: ORIGINAL.anthropicKey,
    HOME: ORIGINAL.home,
    USERPROFILE: ORIGINAL.userProfile,
    APPDATA: ORIGINAL.appData,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runDoctor on an empty home', () => {
  it('returns all eleven checks without throwing, and makes no network call', async () => {
    const report = await runDoctor();

    expect(report.checks.map((c) => c.id)).toEqual(CHECK_IDS);
    expect(report.journey).toBe('full');
    expect(report.probed).toBe(false);
    expect(report.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    for (const c of report.checks) expect(c.summary.length).toBeGreaterThan(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('reports each missing capability as a warning with the action that fixes it', async () => {
    const report = await runDoctor();

    expect(check(report, 'runtime.courses_root').status).toBe('warn');
    expect(check(report, 'runtime.courses_root').fix).toEqual({
      tool: 'ct_setup', action: 'courses_root', hint: expect.any(String),
    });
    expect(check(report, 'canvas.credentials').status).toBe('warn');
    expect(check(report, 'canvas.credentials').fix?.action).toBe('canvas');
    expect(check(report, 'llm.credentials').status).toBe('warn');
    expect(check(report, 'llm.credentials').fix?.action).toBe('anthropic');
    expect(check(report, 'backup.sidecar').status).toBe('warn');
    expect(check(report, 'backup.sidecar').fix?.action).toBe('backup');
  });

  it('calls an unconfigured store, provider, and sidecar ok rather than broken', async () => {
    const report = await runDoctor();

    expect(check(report, 'security.file_permissions').status).toBe('ok');
    expect(check(report, 'canvas.store_sync').status).toBe('ok');
    expect(check(report, 'llm.active_provider').status).toBe('ok');
    expect(check(report, 'transcripts.source').status).toBe('ok');
    expect(check(report, 'modules.pending').status).toBe('ok');
    expect(report.overallStatus).toBe('warn');
    expect(report.readyJourneys).toEqual({
      localAuthoring: false, canvasConnected: false, aiAssisted: false,
    });
  });
});

describe('runDoctor checks', () => {
  it('warns when a provider is configured but llm-provider.json was never written', async () => {
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });

    const report = await runDoctor();
    const active = check(report, 'llm.active_provider');

    expect(active.status).toBe('warn');
    expect(active.fix).toEqual({
      tool: 'ct_setup', action: 'llm_provider', hint: expect.any(String),
    });
    expect(check(report, 'llm.credentials').status).toBe('ok');
    expect(report.readyJourneys.aiAssisted).toBe(false);
  });

  it('reports an active provider whose file is missing as broken', async () => {
    seed('llm-provider.json', { provider: 'ollama' });
    expect(check(await runDoctor(), 'llm.active_provider').status).toBe('warn');
  });

  it('accepts LM Studio as an active provider', async () => {
    seed('lmstudio-config.json', { baseUrl: 'http://localhost:1234/v1', model: 'qwen2.5-14b-instruct' });
    seed('llm-provider.json', { provider: 'lmstudio' });

    const report = await runDoctor();

    expect(check(report, 'llm.active_provider').status).toBe('ok');
    expect(check(report, 'llm.credentials').status).toBe('ok');
    expect(check(report, 'llm.credentials').summary).toMatch(/LM Studio/);
    expect(report.readyJourneys.aiAssisted).toBe(true);
  });

  it('warns when LM Studio is configured but no provider is active', async () => {
    seed('lmstudio-config.json', { baseUrl: 'http://localhost:1234/v1', model: 'qwen2.5-14b-instruct' });

    const active = check(await runDoctor(), 'llm.active_provider');

    expect(active.status).toBe('warn');
    expect(active.fix).toEqual({
      tool: 'ct_setup', action: 'llm_provider', hint: expect.stringContaining('lmstudio'),
    });
  });

  it('lists every configured provider, in preference order, and points the fix at LM Studio', async () => {
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });
    seed('ollama-config.json', { baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });
    seed('lmstudio-config.json', { baseUrl: 'http://localhost:1234/v1', model: 'qwen2.5-14b-instruct' });

    const active = check(await runDoctor(), 'llm.active_provider');

    expect(active.status).toBe('warn');
    // Every provider is still named — nothing is silently dropped.
    expect(active.summary).toContain('(lmstudio, ollama, anthropic)');
    expect(active.fix).toEqual({
      tool: 'ct_setup', action: 'llm_provider',
      hint: expect.stringContaining('with provider "lmstudio"'),
    });
    // Pointing at one is a suggestion, not a choice: nothing was written.
    expect(existsSync(join(ccHome, 'llm-provider.json'))).toBe(false);
  });

  it('points the fix at the next provider in order when LM Studio is not configured', async () => {
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });
    seed('ollama-config.json', { baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    const active = check(await runDoctor(), 'llm.active_provider');

    expect(active.status).toBe('warn');
    expect(active.summary).toContain('(ollama, anthropic)');
    expect(active.fix?.hint).toContain('with provider "ollama"');
    expect(active.fix?.hint).not.toContain('lmstudio');
    expect(existsSync(join(ccHome, 'llm-provider.json'))).toBe(false);
  });

  it('still points at the single configured provider when no active provider is set', async () => {
    seed('ollama-config.json', { baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    const active = check(await runDoctor(), 'llm.active_provider');

    expect(active.status).toBe('warn');
    expect(active.summary).toContain('ollama');
    expect(active.fix?.hint).toContain('with provider "ollama"');
  });

  it('lists configured credentials in preference order', async () => {
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });
    seed('ollama-config.json', { baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });
    seed('lmstudio-config.json', { baseUrl: 'http://localhost:1234/v1', model: 'qwen2.5-14b-instruct' });

    const credentials = check(await runDoctor(), 'llm.credentials');

    expect(credentials.status).toBe('ok');
    expect(credentials.summary).toMatch(/LM Studio.*Ollama.*Anthropic/);
  });

  it('reports a corrupt lmstudio-config.json instead of throwing', async () => {
    writeFileSync(join(ccHome, 'lmstudio-config.json'), '{ nope', 'utf-8');

    const credentials = check(await runDoctor(), 'llm.credentials');

    expect(credentials.status).toBe('warn');
    expect(credentials.summary.toLowerCase()).toContain('lmstudio-config.json');
  });

  it('reports a corrupt llm-provider.json instead of throwing', async () => {
    writeFileSync(join(ccHome, 'llm-provider.json'), '{ nope', 'utf-8');
    const active = check(await runDoctor(), 'llm.active_provider');
    expect(active.status).toBe('warn');
    expect(active.summary.toLowerCase()).toContain('llm-provider.json');
  });

  it('warns when an Anthropic key exists only in the environment', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env';

    const report = await runDoctor();
    const credentials = check(report, 'llm.credentials');

    expect(credentials.status).toBe('warn');
    expect(credentials.summary).toMatch(/anthropic-config\.json/);
    expect(JSON.stringify(report)).not.toContain('sk-ant-env');
  });

  // #151 R7 review fix 6: the doctor reads the two stores RAW. Canvas Design
  // Studio's loadConfig() overlays the canonical host and token, which made this
  // disagreement invisible (and the warn branch unreachable) even though the raw
  // files still disagree until the next save or restart reconciles them.
  it('warns when the raw stores point at different hosts, naming both', async () => {
    seed('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    seed('institution.json', { canvasUrl: 'https://other.instructure.com', apiToken: 'cds-tok' }, cdsHome);

    const sync = check(await runDoctor(), 'canvas.store_sync');

    expect(sync.status).toBe('warn');
    expect(sync.summary).toContain('example.instructure.com');
    expect(sync.summary).toContain('other.instructure.com');
    expect(sync.fix?.tool).toBe('ct_setup');
    expect(sync.fix?.action).toBe('canvas');
    expect(sync.fix?.hint).toMatch(/ct_setup action canvas/);
    expect(sync.fix?.hint).toMatch(/restart/i);
    expect(JSON.stringify(sync)).not.toContain('tok-secret');
  });

  // #151 R7 review fix 10: the bridge's outcome (a rewrite, a corrupt store, the
  // backup it left) used to go only to stderr, which an MCP host swallows.
  it('surfaces the last Canvas store migration, including the backup path', async () => {
    const backupPath = join(cdsHome, 'institution.json.bak-2026-10-17T09-40-00-000Z');
    seed('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    seed('institution.json', { canvasUrl: 'https://example.instructure.com', apiToken: 'cds-tok' }, cdsHome);
    seed('canvas-store-migration.json', {
      at: '2026-10-17T09:40:00.000Z',
      action: 'canvas-config-wins',
      detail: 'Both stores held different Canvas credentials, so canvas-config.json won.',
      backupPath,
    });

    const sync = check(await runDoctor(), 'canvas.store_sync');

    const notes = sync.detail?.join('\n') ?? '';
    expect(notes).toContain('canvas-config-wins');
    expect(notes).toContain(backupPath);
    expect(notes).not.toContain('tok-secret');
    expect(notes).not.toContain('cds-tok');
  });

  it('notes that Design Studio still owes its brand setup', async () => {
    seed('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    seed('institution.json', {
      institution: '', canvasUrl: 'https://example.instructure.com', apiToken: 'tok-secret', brandSetupPending: true,
    }, cdsHome);

    const sync = check(await runDoctor(), 'canvas.store_sync');

    expect(sync.status).toBe('ok');
    expect(sync.detail?.join(' ')).toMatch(/setup_institution/);
  });

  it('reports two stores that agree as ok', async () => {
    seed('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    seed('institution.json', { canvasUrl: 'https://example.instructure.com', apiToken: 'cds-tok' }, cdsHome);
    expect(check(await runDoctor(), 'canvas.store_sync').status).toBe('ok');
  });

  it('warns about a corrupt canvas-config.json instead of throwing', async () => {
    writeFileSync(join(ccHome, 'canvas-config.json'), '{ nope', 'utf-8');
    const report = await runDoctor();
    expect(check(report, 'canvas.credentials').status).toBe('warn');
    expect(check(report, 'canvas.credentials').summary.toLowerCase()).toContain('canvas-config.json');
  });

  it('warns about a corrupt config.json through the courses root check', async () => {
    writeFileSync(join(ccHome, 'config.json'), '{ nope', 'utf-8');
    const report = await runDoctor();
    expect(check(report, 'runtime.courses_root').status).toBe('warn');
    expect(check(report, 'runtime.courses_root').summary.toLowerCase()).toContain('config.json');
  });

  it('reports a loose secret file on POSIX', async () => {
    const path = seed('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    if (platform() === 'win32') {
      expect(check(await runDoctor(), 'security.file_permissions').status).toBe('ok');
      return;
    }
    chmodSync(path, 0o644);

    const report = await runDoctor();
    const security = check(report, 'security.file_permissions');

    expect(security.status).toBe('warn');
    expect(security.detail?.join(' ')).toContain('canvas-config.json');
  });

  it('reports pending module requests with the action that resolves them', async () => {
    seed('pending-module-installs.json', { modules: ['roster'] });

    const pending = check(await runDoctor(), 'modules.pending');

    expect(pending.status).toBe('warn');
    expect(pending.fix).toEqual({
      tool: 'ct_advanced', action: 'browse_module_catalog', hint: expect.any(String),
    });
  });

  it('reports a corrupt transcript config instead of falling back silently', async () => {
    writeFileSync(join(ccHome, 'transcript-config.json'), '{ nope', 'utf-8');
    expect(check(await runDoctor(), 'transcripts.source').status).toBe('warn');
  });

  it('does not call a local-only institution.json a Canvas connection', async () => {
    seed('institution.json', { institution: 'State U', waveApiKey: 'wave-secret' }, cdsHome);

    const report = await runDoctor();

    expect(check(report, 'canvas.store_sync').status).toBe('ok');
    expect(JSON.stringify(report)).not.toContain('wave-secret');
  });

  // #151 R7 review fix 6: with both stores read raw, this is a real state — a
  // Design Studio host saved without a token, while Command & Control has none
  // either. It cannot authenticate, so it is a warning with a fix, not "ok".
  it('warns when an institution.json has a host but no token anywhere', async () => {
    seed('institution.json', { canvasUrl: 'https://example.instructure.com' }, cdsHome);

    const sync = check(await runDoctor(), 'canvas.store_sync');

    expect(sync.status).toBe('warn');
    expect(sync.summary).toContain('example.instructure.com');
    expect(sync.summary).toMatch(/no API token/);
    expect(sync.fix?.action).toBe('canvas');
  });

  it('warns when Command & Control has Canvas and Design Studio has no store at all', async () => {
    seed('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });

    const sync = check(await runDoctor(), 'canvas.store_sync');

    expect(sync.status).toBe('warn');
    expect(sync.summary).toMatch(/Canvas Design Studio/);
    expect(sync.fix?.hint).toMatch(/ct_setup action canvas/);
    // The Canvas connection itself is fine; only the mirror is missing.
    expect(check(await runDoctor(), 'canvas.credentials').status).toBe('ok');
  });
});

describe('runDoctor journeys', () => {
  it('fails the blocking requirement of a journey the caller asked for', async () => {
    const report = await runDoctor({ journey: 'canvas-connected' });

    expect(report.journey).toBe('canvas-connected');
    expect(check(report, 'canvas.credentials').status).toBe('fail');
    expect(check(report, 'llm.credentials').status).toBe('warn');
    expect(report.overallStatus).toBe('fail');
  });

  it('treats the same home as merely incomplete for the full journey', async () => {
    expect((await runDoctor({ journey: 'full' })).overallStatus).toBe('warn');
  });

  it('escalates the LLM provider for the ai-assisted journey', async () => {
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });

    const assisted = await runDoctor({ journey: 'ai-assisted' });

    expect(check(assisted, 'llm.active_provider').status).toBe('fail');
    expect(assisted.overallStatus).toBe('fail');
  });

  it('fails the ai-assisted journey on a home with no LLM configured', async () => {
    const assisted = await runDoctor({ journey: 'ai-assisted' });

    expect(check(assisted, 'llm.credentials').status).toBe('fail');
    expect(assisted.overallStatus).toBe('fail');
  });

  it('ignores checks outside the requested journey when deciding the verdict', async () => {
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });
    seed('llm-provider.json', { provider: 'anthropic' });

    const report = await runDoctor({ journey: 'local-authoring' });

    expect(check(report, 'llm.active_provider').status).toBe('ok');
    // Canvas and the backup sidecar are not part of local authoring.
    expect(check(report, 'canvas.credentials').status).toBe('warn');
    expect(report.overallStatus).toBe('fail'); // no courses root yet
  });

  it('marks every capability ready on a fully configured home', async () => {
    const coursesRoot = join(ccHome, 'courses');
    mkdirSync(coursesRoot, { recursive: true });
    seed('config.json', { coursesRoot, downloader: { executablePath: '/usr/local/bin/canvas-backup' } });
    seed('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    seed('institution.json', { canvasUrl: 'https://example.instructure.com', apiToken: 'cds-tok' }, cdsHome);
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });
    seed('llm-provider.json', { provider: 'anthropic' });
    seedWiredHost();

    const report = await runDoctor();

    expect(report.checks.map((c) => c.status)).toEqual(CHECK_IDS.map(() => 'ok'));
    expect(report.overallStatus).toBe('ok');
    expect(report.readyJourneys).toEqual({
      localAuthoring: true, canvasConnected: true, aiAssisted: true,
    });
  });
});

describe('runDoctor host wiring', () => {
  it('warns when no MCP host is wired, naming the installer and npx as the remedy', async () => {
    const wiring = check(await runDoctor(), 'hosts.wiring');

    expect(wiring.status).toBe('warn');
    expect(wiring.summary).toMatch(/canvas-toolchain/);
    expect(wiring.summary).toMatch(/installer/);
    expect(wiring.summary).toMatch(/npx canvas-toolchain/);
  });

  it('reports ok when a host runs canvas-toolchain from a path that exists', async () => {
    seedWiredHost();

    const wiring = check(await runDoctor(), 'hosts.wiring');

    expect(wiring.status).toBe('ok');
    expect(wiring.summary).toContain('Cursor');
    // The script path is home-relative, so no absolute home path is reported.
    expect(wiring.detail?.join(' ')).toContain('~');
    expect(wiring.detail?.join(' ')).toContain('command-and-control');
    expect(wiring.detail?.join(' ')).not.toContain(hostHome);
  });

  it('names the host whose wired script is gone', async () => {
    seedWiredHost(false);

    const report = await runDoctor();
    const wiring = check(report, 'hosts.wiring');

    expect(wiring.status).toBe('warn');
    expect(wiring.summary).toContain('Cursor');
    expect(wiring.detail?.join(' ')).toContain('(missing)');
  });

  it('reads the hosts when the caller asks for it', async () => {
    seedWiredHost();
    expect(check(await runDoctor({ hosts: true }), 'hosts.wiring').status).toBe('ok');
  });

  it('skips host detection when the caller turns it off', async () => {
    seedWiredHost();

    const wiring = check(await runDoctor({ hosts: false }), 'hosts.wiring');

    expect(wiring.status).toBe('ok');
    expect(wiring.summary).toMatch(/turned off/i);
  });

  it('reports an unreadable host config, and still warns that nothing is wired', async () => {
    mkdirSync(join(hostHome, '.cursor'), { recursive: true });
    writeFileSync(join(hostHome, '.cursor', 'mcp.json'), '{ nope', 'utf-8');

    const wiring = check(await runDoctor(), 'hosts.wiring');

    expect(wiring.status).toBe('warn');
    expect(wiring.detail?.join(' ')).toContain('Cursor');
    expect(wiring.detail?.join(' ')).toMatch(/unreadable/);
  });

  it('names no host on a machine that has none installed', async () => {
    expect(check(await runDoctor(), 'hosts.wiring').detail).toBeUndefined();
  });

  it('never surfaces another server from a host config it read', async () => {
    seedWiredHost();

    const dumped = JSON.stringify(await runDoctor());

    expect(dumped).toContain('Cursor');
    expect(dumped).not.toContain('other-env-secret');
    expect(dumped).not.toContain('other-server');
  });
});

describe('runDoctor secrets', () => {
  it('never puts a seeded secret in the report', async () => {
    const coursesRoot = join(ccHome, 'courses');
    mkdirSync(coursesRoot, { recursive: true });
    seed('config.json', { coursesRoot, registry: { token: 'gh-secret' } });
    seed('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });
    seed('llm-provider.json', { provider: 'anthropic' });
    seed('lecture-answers-config.json', { provider: 'voyage', voyageApiKey: 'pa-secret' });
    seed('institution.json', {
      canvasUrl: 'https://example.instructure.com', apiToken: 'cds-tok', waveApiKey: 'wave-secret',
    }, cdsHome);

    const report = await runDoctor();
    const dumped = JSON.stringify({ report, state: await readSetupState() });
    // CT200-08: the new paths.homes rows are part of what must stay secret-free.
    expect(check(report, 'paths.homes').detail?.length).toBeGreaterThanOrEqual(3);

    for (const secret of ['gh-secret', 'tok-secret', 'sk-ant-secret', 'pa-secret', 'wave-secret', 'cds-tok']) {
      expect(dumped).not.toContain(secret);
    }
  });
});

describe('runDoctor probe', () => {
  it('adds no probe result when probe is omitted', async () => {
    seed('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    const report = await runDoctor();
    expect(report.probed).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(check(report, 'canvas.credentials').status).toBe('ok');
  });

  it('reports probed when only the LM Studio probe ran', async () => {
    const state = await readSetupState();
    state.llm.lmstudio.probe = { attempted: true, reachable: true, status: 200 };

    const report = await runDoctor({ state });

    expect(report.probed).toBe(true);
  });

  it('reports an unreachable Canvas when probe is on', async () => {
    seed('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); }));

    const report = await runDoctor({ probe: true });

    expect(report.probed).toBe(true);
    expect(check(report, 'canvas.credentials').status).toBe('warn');
    expect(check(report, 'canvas.credentials').summary).toMatch(/ENOTFOUND/);
  });

  it('accepts a reachable Canvas probe', async () => {
    seed('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    expect(check(await runDoctor({ probe: true }), 'canvas.credentials').status).toBe('ok');
  });

  it('reports an Anthropic probe that cannot resolve the API host', async () => {
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });
    seed('llm-provider.json', { provider: 'anthropic' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); }));

    const report = await runDoctor({ probe: true });
    const credentials = check(report, 'llm.credentials');

    expect(credentials.status).toBe('warn');
    expect(credentials.summary).toMatch(/ENOTFOUND/);
    expect(credentials.fix).toEqual({ tool: 'ct_setup', action: 'anthropic', hint: expect.any(String) });
    expect(report.readyJourneys.aiAssisted).toBe(false);
  });

  it('reports an Anthropic probe that rejects the key with its HTTP status', async () => {
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));

    const credentials = check(await runDoctor({ probe: true }), 'llm.credentials');

    expect(credentials.status).toBe('warn');
    expect(credentials.summary).toMatch(/HTTP 401/);
  });

  it('keeps the ai-assisted journey ready when the Anthropic probe succeeds', async () => {
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });
    seed('llm-provider.json', { provider: 'anthropic' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));

    const report = await runDoctor({ probe: true });

    expect(check(report, 'llm.credentials').status).toBe('ok');
    expect(report.readyJourneys.aiAssisted).toBe(true);
  });

  it('reports an LM Studio probe that cannot reach the server, and drops ai-assisted readiness', async () => {
    seed('lmstudio-config.json', { baseUrl: 'http://localhost:1234/v1', model: 'qwen2.5-14b-instruct' });
    seed('llm-provider.json', { provider: 'lmstudio' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'ECONNREFUSED' }); }));

    const report = await runDoctor({ probe: true });
    const credentials = check(report, 'llm.credentials');

    expect(credentials.status).toBe('warn');
    expect(credentials.summary).toMatch(/LM Studio/);
    expect(credentials.summary).toMatch(/ECONNREFUSED/);
    expect(credentials.fix?.action).toBe('lmstudio');
    expect(report.readyJourneys.aiAssisted).toBe(false);
  });
});

describe('ct_setup doctor dispatch', () => {
  it('answers the intent action with a full report', async () => {
    const res = await dispatchSurface(buildRegistry(), 'ct_setup', {
      action: 'doctor', params: { probe: false, journey: 'full' },
    });

    expect(res.isError).toBeFalsy();
    const body = JSON.parse(res.content[0].text as string);
    expect(body.checks.map((c: { id: string }) => c.id)).toEqual(CHECK_IDS);
    expect(body.readyJourneys).toBeDefined();
  });

  it('names only real registered operations in its fixes', async () => {
    const registry = buildRegistry();
    const report = await runDoctor();

    const offenders: string[] = [];
    for (const c of report.checks) {
      if (!c.fix) continue;
      const real = c.fix.tool === 'ct_setup'
        ? [...registry.values()].some((op) => op.intentTool === 'ct_setup' && op.intentAction === c.fix!.action)
        : registry.has(c.fix.action);
      if (!real) offenders.push(`${c.id} -> ${c.fix.tool} ${c.fix.action}`);
    }
    expect(offenders).toEqual([]);
  });
});
