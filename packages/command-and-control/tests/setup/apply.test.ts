import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { applySetup } from '../../src/setup/apply.js';
import { runDoctor } from '../../src/setup/doctor.js';
import { buildRegistry } from '../../src/surface/registry.js';
import { dispatchSurface } from '../../src/surface/dispatch.js';

let ccHome: string;
let cdsHome: string;
let coursesRoot: string;
const ORIGINAL = {
  ccHome: process.env.CC_HOME,
  cdsHome: process.env.CANVAS_DESIGN_HOME,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  lmstudioKey: process.env.LMSTUDIO_API_KEY,
  backupCommand: process.env.CANVAS_BACKUP_COMMAND,
};

/** Answers the validation calls the Canvas, Anthropic and LM Studio setup ops make. */
function stubFetch({ canvasOk = true }: { canvasOk?: boolean } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : String((input as { url?: string }).url);
    if (url.includes('/api/v1/users/self')) {
      return canvasOk
        ? ({ ok: true, status: 200, json: async () => ({ id: 1 }) } as Response)
        : ({ ok: false, status: 401 } as Response);
    }
    if (url.includes('api.anthropic.com')) {
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }
    // LM Studio's model list, reached through the local-endpoint guard.
    if (url.endsWith('/models')) {
      return new Response(
        JSON.stringify({ object: 'list', data: [{ id: 'qwen2.5', object: 'model' }] }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected network call in test: ${url}`);
  }));
}

/** Every file under `dir`, keyed by relative path, so a write cannot hide. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else out[relative(dir, path)] = readFileSync(path, 'utf-8');
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-apply-'));
  cdsHome = mkdtempSync(join(tmpdir(), 'cds-apply-'));
  coursesRoot = mkdtempSync(join(tmpdir(), 'cc-courses-'));
  process.env.CC_HOME = ccHome;
  process.env.CANVAS_DESIGN_HOME = cdsHome;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.LMSTUDIO_API_KEY;
  delete process.env.CANVAS_BACKUP_COMMAND;
  stubFetch();
});

afterEach(() => {
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(cdsHome, { recursive: true, force: true });
  rmSync(coursesRoot, { recursive: true, force: true });
  for (const [key, value] of Object.entries({
    CC_HOME: ORIGINAL.ccHome,
    CANVAS_DESIGN_HOME: ORIGINAL.cdsHome,
    ANTHROPIC_API_KEY: ORIGINAL.anthropicKey,
    LMSTUDIO_API_KEY: ORIGINAL.lmstudioKey,
    CANVAS_BACKUP_COMMAND: ORIGINAL.backupCommand,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A patch that turns on every capability the doctor reports. */
function fullPatch() {
  return {
    coursesRoot,
    canvas: { host: 'example.instructure.com', token: 'tok-secret', test: true },
    anthropic: { apiKey: 'sk-ant-secret', test: true },
    // A local provider too, so the patch exercises a guarded endpoint and the
    // auto-activation each config section performs.
    lmstudio: { baseUrl: 'http://localhost:1234/v1', model: 'qwen2.5' },
    llmProvider: 'lmstudio' as const,
    transcripts: { source: 'panopto' as const },
    lectureAnswers: { provider: 'transformers-js' as const },
    spotCheck: { enabled: true },
  };
}

describe('applySetup on a fresh home', () => {
  it('applies a multi-section patch so every capability is ready', async () => {
    const result = await applySetup(fullPatch());

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.sections.map((s) => s.section)).toEqual([
      'coursesRoot', 'canvas', 'lmstudio', 'anthropic', 'llmProvider',
      'transcripts', 'lectureAnswers', 'spotCheck',
    ]);
    expect(result.sections.every((s) => s.ok)).toBe(true);

    // The config sections auto-activate in preference order (LM Studio first),
    // and the explicit choice runs last, so it wins regardless.
    expect(JSON.parse(readFileSync(join(ccHome, 'llm-provider.json'), 'utf-8'))).toEqual({
      provider: 'lmstudio',
    });

    const report = await runDoctor({ probe: false });
    expect(report.readyJourneys).toEqual({
      localAuthoring: true, canvasConnected: true, aiAssisted: true,
    });
    expect(result.readyJourneys).toEqual(report.readyJourneys);

    // `remaining` is the doctor's warn/fail list: everything still worth doing.
    expect(result.remaining.every((c) => c.status !== 'ok')).toBe(true);
    expect(result.remaining.map((c) => c.id)).toContain('backup.sidecar');
    expect(result.remaining.map((c) => c.id)).not.toContain('canvas.credentials');
  });

  it('activates the provider the patch names, after its config was written', async () => {
    const result = await applySetup({
      anthropic: { apiKey: 'sk-ant-secret', test: true },
      llmProvider: 'anthropic',
    });

    expect(result.ok).toBe(true);
    expect(result.sections.map((s) => s.section)).toEqual(['anthropic', 'llmProvider']);
    expect(JSON.parse(readFileSync(join(ccHome, 'llm-provider.json'), 'utf-8'))).toEqual({
      provider: 'anthropic',
    });
  });

  it('reports an activation the patch cannot satisfy and keeps going', async () => {
    const result = await applySetup({ llmProvider: 'ollama', spotCheck: { enabled: true } });

    expect(result.ok).toBe(false);
    const activation = result.sections.find((s) => s.section === 'llmProvider');
    expect(activation).toMatchObject({ ok: false, code: 'PROVIDER_NOT_CONFIGURED' });
    expect(result.sections.find((s) => s.section === 'spotCheck')?.ok).toBe(true);
  });

  it('auto-activates the preferred provider when a patch configures several', async () => {
    const result = await applySetup({
      anthropic: { apiKey: 'sk-ant-secret', test: true },
      lmstudio: { baseUrl: 'http://localhost:1234/v1', model: 'qwen2.5' },
    });

    // No explicit llmProvider, so the LLM sections run in PREFERRED_PROVIDER_ORDER
    // and LM Studio — configured first — is the provider that gets activated.
    expect(result.ok).toBe(true);
    expect(result.sections.map((s) => s.section)).toEqual(['lmstudio', 'anthropic']);
    expect(JSON.parse(readFileSync(join(ccHome, 'llm-provider.json'), 'utf-8'))).toEqual({
      provider: 'lmstudio',
    });
  });

  it('honours an explicit provider over the auto-activated preference', async () => {
    const result = await applySetup({
      anthropic: { apiKey: 'sk-ant-secret', test: true },
      lmstudio: { baseUrl: 'http://localhost:1234/v1', model: 'qwen2.5' },
      llmProvider: 'anthropic',
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(readFileSync(join(ccHome, 'llm-provider.json'), 'utf-8'))).toEqual({
      provider: 'anthropic',
    });
  });
});

describe('applySetup failure handling', () => {
  it('accepts an empty patch as a status read', async () => {
    const result = await applySetup({});

    expect(result.ok).toBe(true);
    expect(result.sections).toEqual([]);
    expect(result.readyJourneys).toEqual({
      localAuthoring: false, canvasConnected: false, aiAssisted: false,
    });
  });

  it('continues past a failed section and reports it', async () => {
    const result = await applySetup({
      coursesRoot: join(ccHome, 'does-not-exist'),
      spotCheck: { enabled: true },
    });

    expect(result.ok).toBe(false);
    expect(result.sections.map((s) => s.section)).toEqual(['coursesRoot', 'spotCheck']);
    expect(result.sections[0]).toMatchObject({ ok: false, code: 'PATH_NOT_FOUND' });
    expect(result.sections[0].fix?.length).toBeGreaterThan(0);
    expect(result.sections[1].ok).toBe(true);
    expect(JSON.parse(readFileSync(join(ccHome, 'spot-check.json'), 'utf-8')))
      .toMatchObject({ weeklyCheckEnabled: true });
  });

  it('reports a rejected Canvas token without stopping the later sections', async () => {
    stubFetch({ canvasOk: false });

    const result = await applySetup({
      canvas: { host: 'example.instructure.com', token: 'tok-secret', test: true },
      spotCheck: { enabled: true },
    });

    expect(result.sections[0]).toMatchObject({ ok: false, code: 'CREDENTIAL_VALIDATION_FAILED' });
    expect(result.sections[1].ok).toBe(true);
    expect(existsSync(join(ccHome, 'canvas-config.json'))).toBe(false);
  });

  it('reports a null patch instead of throwing a TypeError', async () => {
    const result = await applySetup(null as never);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_INPUT');
    expect(result.sections).toEqual([]);
    expect(result.message).toBeTruthy();
    expect(result.fix?.length).toBeGreaterThan(0);
    expect(snapshot(ccHome)).toEqual({});
  });

  it('refuses an unknown section before writing anything', async () => {
    const result = await applySetup({ courcesRoot: coursesRoot } as never);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNKNOWN_SECTION');
    expect(result.sections).toEqual([]);
    expect(snapshot(ccHome)).toEqual({});
  });

  it('does not let a corrupt config quote its own bytes into the report', async () => {
    // config.json can hold the premium registry token; a raw parser error can
    // quote the bytes around the fault, so the step must fail without repeating it.
    writeFileSync(join(ccHome, 'config.json'), '{"registry":{"token":"gh-secret"},,}');

    const result = await applySetup({ coursesRoot, spotCheck: { enabled: true } });

    expect(result.sections[0]).toMatchObject({ section: 'coursesRoot', ok: false, code: 'STEP_FAILED' });
    expect(JSON.stringify(result)).not.toContain('gh-secret');
    expect(result.sections[1].ok).toBe(true);
  });
});

describe('applySetup dry run', () => {
  it('validates a full patch and writes nothing', async () => {
    const patch = { ...fullPatch(), dryRun: true };
    const before = snapshot(ccHome);

    const result = await applySetup(patch);

    expect(result.dryRun).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.sections.every((s) => s.ok)).toBe(true);
    expect(result.sections.every((s) => /would/i.test(s.message))).toBe(true);
    expect(snapshot(ccHome)).toEqual(before);
    expect(existsSync(join(ccHome, 'canvas-config.json'))).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('still reports a section the real run would refuse', async () => {
    const result = await applySetup({ coursesRoot: join(ccHome, 'nope'), dryRun: true });

    expect(result.ok).toBe(false);
    expect(result.sections[0]).toMatchObject({ ok: false, code: 'PATH_NOT_FOUND' });
    expect(snapshot(ccHome)).toEqual({});
  });

  it('reports a missing required field', async () => {
    const result = await applySetup({ anthropic: { model: 'claude' }, dryRun: true } as never);

    expect(result.sections[0]).toMatchObject({ ok: false, code: 'MISSING_FIELD' });
    expect(result.sections[0].fix?.join(' ')).toContain('apiKey');
  });
});

describe('applySetup secrets', () => {
  it('never echoes a token or key', async () => {
    const result = await applySetup({
      canvas: { host: 'example.instructure.com', token: 'tok-secret', test: true },
      anthropic: { apiKey: 'sk-ant-secret', test: true },
      lectureAnswers: { provider: 'voyage', voyageApiKey: 'pa-secret' },
    });

    const dumped = JSON.stringify(result);
    for (const secret of ['tok-secret', 'sk-ant-secret', 'pa-secret']) {
      expect(dumped).not.toContain(secret);
    }
  });
});

describe('ct_setup apply dispatch', () => {
  it('answers the intent action with the section report', async () => {
    const res = await dispatchSurface(buildRegistry(), 'ct_setup', {
      action: 'apply',
      params: { spotCheck: { enabled: true } },
    });

    expect(res.isError).toBeFalsy();
    const body = JSON.parse(res.content[0].text as string);
    expect(body.sections[0]).toMatchObject({ section: 'spotCheck', ok: true });
    expect(body.readyJourneys).toEqual(expect.any(Object));
  });
});

interface SectionSchema {
  type?: string;
  properties: Record<string, unknown>;
  required?: string[];
}

describe('apply_setup args are derived from the operations it delegates to', () => {
  const reg = buildRegistry();
  const opSchema = (id: string) =>
    reg.get(id)!.inputSchema as { properties: Record<string, unknown>; required?: string[] };
  const applySchema = () =>
    reg.get('apply_setup')!.inputSchema as { properties: Record<string, SectionSchema> };
  const section = (name: string) => applySchema().properties[name];

  it('is the ct_setup intent action "apply", with a short description', () => {
    const op = reg.get('apply_setup');

    expect(op).toMatchObject({ exposure: 'intent', intentTool: 'ct_setup', intentAction: 'apply' });
    expect(op!.description.length).toBeLessThanOrEqual(200);
  });

  it('copies every object section from the operation that implements it', () => {
    for (const [name, opId] of [
      ['canvas', 'setup_canvas'],
      ['anthropic', 'setup_anthropic'],
      ['ollama', 'setup_ollama'],
      ['lmstudio', 'setup_lmstudio'],
      ['lectureAnswers', 'setup_lecture_answers'],
      ['spotCheck', 'setup_spot_check'],
      ['backup', 'setup_canvas_backup'],
    ] as const) {
      const delegated = opSchema(opId);
      const derived = section(name);

      expect(derived.type, name).toBe('object');
      expect(derived.properties, name).toEqual(delegated.properties);
      const required = derived.required ?? [];
      for (const field of delegated.required ?? []) expect(required, name).toContain(field);
      for (const field of required) {
        expect(Object.keys(derived.properties), `${name}.${field}`).toContain(field);
      }
    }
  });

  it('copies the scalar sections and drops the operation-only field', () => {
    expect(section('coursesRoot')).toEqual(opSchema('set_courses_root').properties.coursesRoot);
    expect(section('llmProvider')).toEqual(opSchema('setup_llm_provider').properties.provider);

    const transcripts = section('transcripts');
    expect(transcripts.properties).toEqual(
      Object.fromEntries(
        Object.entries(opSchema('setup_transcript_source').properties).filter(([k]) => k !== 'action'),
      ),
    );
    expect(transcripts.required ?? []).toEqual([]);
  });

  it('requires a model for the two local-model sections', () => {
    // apply always commits; a model-less call would only probe and write nothing.
    expect(section('ollama').required).toEqual(['model']);
    expect(section('lmstudio').required).toEqual(['model']);
  });

  it('exposes the dry-run switch on the operation, not as a section', () => {
    const dryRun = applySchema().properties.dryRun;
    expect(dryRun).toMatchObject({ type: 'boolean' });
    expect(dryRun.properties).toBeUndefined();
  });
});
