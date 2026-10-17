import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getStarted } from '../../src/setup/get_started.js';
import type { GetStartedGuide, SetupCall } from '../../src/setup/get_started.js';
import { buildRegistry } from '../../src/surface/registry.js';
import { dispatchSurface } from '../../src/surface/dispatch.js';

let ccHome: string;
let cdsHome: string;
const ORIGINAL = {
  ccHome: process.env.CC_HOME,
  cdsHome: process.env.CANVAS_DESIGN_HOME,
  backupCommand: process.env.CANVAS_BACKUP_COMMAND,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
};

/** Seed a config file, 0600 like every writer in the repo, under either home. */
function seed(name: string, value: unknown, home: string = ccHome): string {
  const path = join(home, name);
  writeFileSync(path, JSON.stringify(value, null, 2), { encoding: 'utf-8', mode: 0o600 });
  return path;
}

/** Seed a file the doctor must report as present-but-corrupt. */
function seedRaw(name: string, text: string, home: string = ccHome): string {
  const path = join(home, name);
  writeFileSync(path, text, { encoding: 'utf-8', mode: 0o600 });
  return path;
}

/** The step ids in the order the guide presents them. */
function stepIds(guide: GetStartedGuide): string[] {
  return guide.steps.map((s) => s.id);
}

function step(guide: GetStartedGuide, id: string) {
  const found = guide.steps.find((s) => s.id === id);
  if (!found) throw new Error(`no step ${id} in ${guide.steps.map((s) => s.id).join(', ') || '(none)'}`);
  return found;
}

/** Assert a call names a real operation: an exposed intent action, or a ct_advanced id. */
function assertRealAction(call: SetupCall) {
  const registry = buildRegistry();
  if (call.tool === 'ct_setup') {
    const real = [...registry.values()].some(
      (op) => op.intentTool === 'ct_setup' && op.intentAction === call.action,
    );
    expect(real, `ct_setup action ${call.action} is not registered`).toBe(true);
  } else {
    expect(registry.has(call.action), `ct_advanced operation ${call.action} is not registered`).toBe(true);
  }
}

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  cdsHome = mkdtempSync(join(tmpdir(), 'cds-home-'));
  process.env.CC_HOME = ccHome;
  process.env.CANVAS_DESIGN_HOME = cdsHome;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CANVAS_BACKUP_COMMAND;
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network call in test'))));
});

afterEach(() => {
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(cdsHome, { recursive: true, force: true });
  for (const [key, value] of Object.entries({
    CC_HOME: ORIGINAL.ccHome,
    CANVAS_DESIGN_HOME: ORIGINAL.cdsHome,
    CANVAS_BACKUP_COMMAND: ORIGINAL.backupCommand,
    ANTHROPIC_API_KEY: ORIGINAL.anthropicKey,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getStarted on an empty home', () => {
  it('leads with the courses root and makes no network call', async () => {
    const guide = await getStarted();

    expect(guide.journey).toBe('full');
    expect(guide.steps[0]).toMatchObject({ id: 'courses_root', action: 'courses_root', required: true });
    expect(guide.text).toContain('courses_root');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('assumes no LLM: the AI step is optional and offers a local model', async () => {
    const guide = await getStarted();
    const llm = step(guide, 'llm_credentials');

    expect(llm.required).toBe(false);
    expect(llm.alternatives).toEqual([
      expect.objectContaining({ tool: 'ct_setup', action: 'ollama' }),
      expect.objectContaining({ tool: 'ct_setup', action: 'lmstudio' }),
    ]);
    expect(guide.readyToGo).toBe(false);
    expect(guide.text).toContain('Optional:');
  });

  it('offers Canvas as optional, never as a blocker for local authoring', async () => {
    const guide = await getStarted();
    const canvas = step(guide, 'canvas');

    expect(canvas.required).toBe(false);
    expect(canvas.needs.join(' ')).toMatch(/Account > Settings/);
  });

  it('reports which capabilities are ready', async () => {
    const guide = await getStarted();

    expect(guide.capabilities.map((c) => c.id)).toEqual([
      'localAuthoring', 'canvasConnected', 'aiAssisted',
    ]);
    expect(guide.capabilities.every((c) => c.ready === false)).toBe(true);
    expect(guide.greeting).toMatch(/required step/);
  });

  it('is ready for local authoring once only the courses root is set, with no LLM', async () => {
    const coursesRoot = join(ccHome, 'courses');
    mkdirSync(coursesRoot, { recursive: true });
    seed('config.json', { coursesRoot });

    const guide = await getStarted();

    expect(guide.readyToGo).toBe(true);
    expect(guide.capabilities.find((c) => c.id === 'localAuthoring')?.ready).toBe(true);
    expect(guide.steps.some((s) => s.id === 'courses_root')).toBe(false);
    expect(guide.greeting).toMatch(/you're ready/i);
  });
});

describe('getStarted with some setup done', () => {
  it('asks to activate a configured provider that is not active yet', async () => {
    seed('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });

    const guide = await getStarted();
    const activate = step(guide, 'llm_provider');

    expect(activate).toMatchObject({
      tool: 'ct_setup', action: 'llm_provider', params: { provider: 'anthropic' },
    });
  });

  it('asks to configure the provider llm-provider.json names when its config is missing', async () => {
    seed('llm-provider.json', { provider: 'ollama' });

    const guide = await getStarted();
    const finish = step(guide, 'llm_provider');

    expect(finish).toMatchObject({ tool: 'ct_setup', action: 'ollama', params: {} });
    expect(finish.title).toMatch(/finish configuring/i);
    // One LLM step, not a credentials step contradicting the named provider.
    expect(stepIds(guide)).toEqual(['courses_root', 'canvas', 'llm_provider']);
    expect(finish.why).toMatch(/selects ollama/);
    expect(finish.why).not.toMatch(/LLM_PROVIDER_NOT_SET/);
    // The folded credentials fix becomes the Anthropic alternative — never a
    // second copy of the same call — with LM Studio offered as the other option.
    expect(finish.alternatives).toEqual([
      expect.objectContaining({ tool: 'ct_setup', action: 'anthropic' }),
      expect.objectContaining({ tool: 'ct_setup', action: 'lmstudio' }),
    ]);
  });

  it('makes Canvas required when the caller asks about publishing', async () => {
    const guide = await getStarted({ journey: 'canvas-connected' });

    expect(step(guide, 'canvas').required).toBe(true);
    expect(guide.readyToGo).toBe(false);
  });

  it('makes the LLM steps required when the caller asks about AI assistance', async () => {
    const guide = await getStarted({ journey: 'ai-assisted' });

    expect(step(guide, 'llm_credentials').required).toBe(true);
  });

  it('leaves Canvas and AI optional for the local-authoring journey', async () => {
    const guide = await getStarted({ journey: 'local-authoring' });

    expect(guide.steps.filter((s) => s.required).map((s) => s.id)).toEqual(['courses_root']);
  });
});

describe('getStarted step selection for a configured local model', () => {
  it('asks to activate the local model when no provider is active', async () => {
    seed('ollama-config.json', { baseUrl: 'http://localhost:11434', model: 'llama3.2' });

    const guide = await getStarted();
    const activate = step(guide, 'llm_provider');

    expect(activate).toMatchObject({
      tool: 'ct_setup', action: 'llm_provider', params: { provider: 'ollama' },
    });
    expect(activate.alternatives).toEqual([]);
  });

  it('is AI-ready when the local model is active', async () => {
    const coursesRoot = join(ccHome, 'courses');
    mkdirSync(coursesRoot, { recursive: true });
    seed('config.json', { coursesRoot });
    seed('ollama-config.json', { baseUrl: 'http://localhost:11434', model: 'llama3.2' });
    seed('llm-provider.json', { provider: 'ollama' });

    const guide = await getStarted();

    expect(guide.capabilities.find((c) => c.id === 'aiAssisted')?.ready).toBe(true);
    expect(stepIds(guide)).toEqual(['canvas']);
    expect(guide.readyToGo).toBe(true);
  });

  it('activates the provider that has a config file, not an env-only Anthropic key', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env-secret';
    seed('ollama-config.json', { baseUrl: 'http://localhost:11434', model: 'llama3.2' });

    const guide = await getStarted();
    const activate = step(guide, 'llm_provider');

    // set_active_llm_provider refuses a provider with no config file, and the
    // runtime reads anthropic-config.json rather than the environment.
    expect(activate).toMatchObject({
      tool: 'ct_setup', action: 'llm_provider', params: { provider: 'ollama' },
    });
    expect(guide.steps.every((s) => s.params.provider !== 'anthropic')).toBe(true);
  });

  it('offers the other configured provider as an alternative', async () => {
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });
    seed('ollama-config.json', { baseUrl: 'http://localhost:11434', model: 'llama3.2' });

    const guide = await getStarted();
    const activate = step(guide, 'llm_provider');

    expect(activate).toMatchObject({ params: { provider: 'anthropic' } });
    expect(activate.alternatives).toEqual([
      expect.objectContaining({
        tool: 'ct_setup', action: 'llm_provider', params: { provider: 'ollama' },
      }),
    ]);
  });

  it('offers no activation at all when no provider has a config file', async () => {
    seedRaw('llm-provider.json', '{ not json');

    const guide = await getStarted();

    expect(stepIds(guide)).not.toContain('llm_provider');
    expect(step(guide, 'llm_credentials').action).toBe('anthropic');
  });

  it('does not emit the same call twice when llm-provider.json names Anthropic', async () => {
    seed('llm-provider.json', { provider: 'anthropic' });

    const guide = await getStarted();

    expect(stepIds(guide)).toEqual(['courses_root', 'canvas', 'llm_provider']);
    expect(step(guide, 'llm_provider')).toMatchObject({ tool: 'ct_setup', action: 'anthropic' });
  });

  it('offers switching to the provider that is already configured', async () => {
    seed('llm-provider.json', { provider: 'ollama' });
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });

    const guide = await getStarted();
    const finish = step(guide, 'llm_provider');

    expect(finish).toMatchObject({ tool: 'ct_setup', action: 'ollama', params: {} });
    expect(finish.alternatives).toEqual([
      expect.objectContaining({
        tool: 'ct_setup', action: 'llm_provider', params: { provider: 'anthropic' },
      }),
      expect.objectContaining({ tool: 'ct_setup', action: 'lmstudio' }),
    ]);
  });
});

describe('getStarted with a corrupt config file', () => {
  it('repairs a corrupt config.json before asking for the courses root', async () => {
    seedRaw('config.json', '{ broken');

    const guide = await getStarted();
    const root = step(guide, 'courses_root');

    // loadConfig() throws on corrupt JSON, so courses_root cannot run first.
    expect(root).toMatchObject({ tool: 'ct_setup', action: 'cc', params: {} });
    expect(root.title).toMatch(/repair/i);
    expect(root.why).toMatch(/corrupt/i);
    expect(root.needs.join(' ')).toMatch(/courses root/i);
  });

  it('files a corrupt lecture-answers config as its own optional step, not as AI assistance', async () => {
    const coursesRoot = join(ccHome, 'courses');
    mkdirSync(coursesRoot, { recursive: true });
    seed('config.json', { coursesRoot });
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });
    seed('llm-provider.json', { provider: 'anthropic' });
    seedRaw('lecture-answers-config.json', '{ broken');

    const guide = await getStarted();
    const answers = step(guide, 'lecture_answers');

    expect(answers).toMatchObject({ tool: 'ct_setup', action: 'lecture_answers', params: {} });
    expect(answers.required).toBe(false);
    expect(stepIds(guide)).not.toContain('llm_credentials');
    expect(guide.capabilities.find((c) => c.id === 'aiAssisted')?.ready).toBe(true);
  });

  it('points a corrupt LM Studio config at the lmstudio step, not at Anthropic', async () => {
    seedRaw('lmstudio-config.json', '{ broken');

    const guide = await getStarted();
    const llm = step(guide, 'llm_credentials');

    expect(llm).toMatchObject({ tool: 'ct_setup', action: 'lmstudio', params: {} });
    expect(llm.alternatives).toEqual([
      expect.objectContaining({ tool: 'ct_setup', action: 'anthropic' }),
      expect.objectContaining({ tool: 'ct_setup', action: 'ollama' }),
    ]);
  });

  it('asks to activate a configured LM Studio server when none is active', async () => {
    seed('lmstudio-config.json', { baseUrl: 'http://localhost:1234/v1', model: 'qwen2.5' });

    const guide = await getStarted();
    const activate = step(guide, 'llm_provider');

    expect(activate).toMatchObject({
      tool: 'ct_setup', action: 'llm_provider', params: { provider: 'lmstudio' },
    });
  });
});

describe('getStarted renders calls its own dispatcher accepts', () => {
  it('renders the activation step as a ct_setup action the intent dispatcher accepts', async () => {
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });

    const guide = await getStarted();

    expect(guide.text).toContain('call: ct_setup action llm_provider {"provider":"anthropic"}');
    const result = await dispatchSurface(buildRegistry(), 'ct_setup', {
      action: 'llm_provider', params: { provider: 'anthropic' },
    });
    expect(result.isError).toBeFalsy();
  });

  it('points at the one-call apply action when more than one step is left', async () => {
    const guide = await getStarted();

    expect(guide.steps.length).toBeGreaterThan(1);
    expect(guide.text).toContain('ct_setup action apply');

    // One remaining step is already a single call, so the note would be noise.
    const coursesRoot = join(ccHome, 'courses');
    mkdirSync(coursesRoot, { recursive: true });
    seed('config.json', { coursesRoot });
    seed('ollama-config.json', { baseUrl: 'http://localhost:11434', model: 'llama3.2' });
    seed('llm-provider.json', { provider: 'ollama' });

    const one = await getStarted();
    expect(one.steps.map((s) => s.id)).toEqual(['canvas']);
    expect(one.text).not.toContain('ct_setup action apply');
  });
});

describe('getStarted on a fully configured home', () => {
  it('says you are ready and requires no step', async () => {
    const coursesRoot = join(ccHome, 'courses');
    mkdirSync(coursesRoot, { recursive: true });
    seed('config.json', { coursesRoot, downloader: { executablePath: '/usr/local/bin/canvas-backup' } });
    seed('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    seed('institution.json', { canvasUrl: 'https://example.instructure.com', apiToken: 'cds-tok' }, cdsHome);
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });
    seed('llm-provider.json', { provider: 'anthropic' });

    const guide = await getStarted();

    expect(guide.readyToGo).toBe(true);
    expect(guide.steps.filter((s) => s.required)).toEqual([]);
    expect(guide.steps).toEqual([]);
    expect(guide.capabilities.every((c) => c.ready)).toBe(true);
    expect(guide.greeting).toMatch(/you're ready/i);
    expect(guide.text).toContain('Nothing left to configure');
  });
});

describe('getStarted steps', () => {
  it('names a real registered operation in every step and alternative', async () => {
    seed('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });

    const guide = await getStarted();

    expect(guide.steps.length).toBeGreaterThan(0);
    for (const s of guide.steps) {
      assertRealAction(s);
      for (const alternative of s.alternatives) assertRealAction(alternative);
    }
  });

  it('never puts a seeded secret in the guide', async () => {
    const coursesRoot = join(ccHome, 'courses');
    mkdirSync(coursesRoot, { recursive: true });
    seed('config.json', { coursesRoot, registry: { token: 'gh-secret' } });
    seed('canvas-config.json', { host: 'example.instructure.com', token: 'tok-secret' });
    seed('anthropic-config.json', { apiKey: 'sk-ant-secret', model: 'claude' });
    seed('lecture-answers-config.json', { provider: 'voyage', voyageApiKey: 'pa-secret' });
    seed('institution.json', {
      canvasUrl: 'https://example.instructure.com', apiToken: 'cds-tok', waveApiKey: 'wave-secret',
    }, cdsHome);

    const dumped = JSON.stringify(await getStarted());

    for (const secret of ['gh-secret', 'tok-secret', 'sk-ant-secret', 'pa-secret', 'wave-secret', 'cds-tok']) {
      expect(dumped).not.toContain(secret);
    }
  });
});

describe('ct_setup get_started dispatch', () => {
  it('answers the intent action with the guidance', async () => {
    const res = await dispatchSurface(buildRegistry(), 'ct_setup', {
      action: 'get_started', params: {},
    });

    expect(res.isError).toBeFalsy();
    const body = JSON.parse(res.content[0].text as string);
    expect(body.text).toEqual(expect.any(String));
    expect(body.steps[0].action).toBe('courses_root');
    expect(body.capabilities.map((c: { id: string }) => c.id)).toEqual([
      'localAuthoring', 'canvasConnected', 'aiAssisted',
    ]);
  });

  it('appears as a real action on the ct_setup intent tool', () => {
    const reg = buildRegistry();
    const op = [...reg.values()].find((o) => o.id === 'get_started');

    expect(op).toMatchObject({ exposure: 'intent', intentTool: 'ct_setup', intentAction: 'get_started' });
    expect(op!.description.length).toBeLessThanOrEqual(200);
  });
});
