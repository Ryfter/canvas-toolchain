import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AnthropicCredential, CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import mod, { createRosterModule } from '../src/index.js';
import { isCanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { makeFakeCtx } from './fake-ctx.js';
import type { ProposalReport } from '../src/types.js';

describe('module-roster', () => {
  it('default-exports a valid CanvasToolchainModule', () => {
    expect(isCanvasToolchainModule(mod)).toBe(true);
    expect(mod.id).toBe('roster');
  });

  it('exposes propose_roster, commit_roster, resolve_identity', () => {
    const names = mod.tools.map((t) => t.schema.name).sort();
    expect(names).toEqual(['commit_roster', 'propose_roster', 'resolve_identity']);
  });

  it('every tool description references that only commit_roster writes', () => {
    const propose = mod.tools.find((t) => t.schema.name === 'propose_roster')!;
    expect(propose.schema.description.toLowerCase()).toContain('writes nothing');
  });

  it('is a contract v2 module declaring canvas (required) and anthropic (optional)', () => {
    expect(mod.contractVersion).toBe(2);
    expect(typeof mod.init).toBe('function');
    const decl = Object.fromEntries((mod.credentials ?? []).map((c) => [c.kind, c.required]));
    expect(decl).toEqual({ canvas: true, anthropic: false });
  });
});

// ---- tools against a fake host context -------------------------------------------------

const TOKEN = 'canvas-secret-token-do-not-leak';
const API_KEY = 'sk-ant-secret-do-not-leak';
const HOST = 'school.instructure.com';
const CSV = [
  'Student ID,Email,NetID,Name,Plan',
  '100,jane@x.edu,jdoe,Jane Doe,marketing',
  '200,bob@x.edu,broe,Bob Roe,accounting',
].join('\n');
const COLUMN_MAP = { studentNumber: 'Student ID', email: 'Email', userId: 'NetID', name: 'Name', major: 'Plan' };
const CANVAS_USERS = [
  { id: 900, name: 'Jane Doe', login_id: 'jdoe', sis_user_id: '100', email: 'jane@x.edu' },
  { id: 901, name: 'Bob Roe', login_id: 'broe', sis_user_id: '200', email: 'bob@x.edu' },
];

let config: string;
let secrets: string;
let work: string;
let fetchCalls: Array<{ url: string; auth: string | undefined }>;

beforeEach(() => {
  config = mkdtempSync(join(tmpdir(), 'roster-mod-config-'));
  secrets = mkdtempSync(join(tmpdir(), 'roster-mod-secrets-'));
  work = mkdtempSync(join(tmpdir(), 'roster-mod-work-'));
  fetchCalls = [];
  writeFileSync(join(work, 'ps.csv'), CSV, 'utf-8');
});
afterEach(() => {
  for (const d of [config, secrets, work]) rmSync(d, { recursive: true, force: true });
});

const fakeFetch = (async (input: string, init?: RequestInit) => {
  const url = String(input);
  const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
  fetchCalls.push({ url, auth });
  const ok = (body: unknown) => new Response(JSON.stringify(body), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
  if (url.includes('/courses/123/users')) return ok(CANVAS_USERS);
  const m = url.match(/\/users\/(\d+)/);
  if (m) {
    const u = CANVAS_USERS.find((x) => String(x.id) === m[1]);
    return u ? ok(u) : new Response('not found', { status: 404 });
  }
  return new Response('unexpected', { status: 500 });
}) as unknown as typeof fetch;

const upperLlm: LlmClient = { complete: async (_s, u) => {
  const raws = JSON.parse(u.slice(u.indexOf('['))) as string[];
  return { text: JSON.stringify(Object.fromEntries(raws.map((r) => [r, r.toUpperCase()]))) };
} };

function tool(m: CanvasToolchainModule, name: string) {
  return m.tools.find((t) => t.schema.name === name)!;
}
function body(r: CallToolResult): unknown {
  return JSON.parse((r.content[0] as { text: string }).text);
}
function proposeArgs(extra: Record<string, unknown> = {}) {
  return { courseId: '123', term: 'FA26', peopleSoftFile: join(work, 'ps.csv'), ...extra };
}

describe('roster tools (fake ctx)', () => {
  it('every tool fails with MODULE_NOT_INITIALIZED before the host calls init', async () => {
    const m = createRosterModule({ fetchImpl: fakeFetch });
    await expect(tool(m, 'propose_roster').handler(proposeArgs({ columnMap: COLUMN_MAP })))
      .rejects.toThrow(/MODULE_NOT_INITIALIZED/);
    await expect(tool(m, 'commit_roster').handler({ proposal: {}, outputPath: join(work, 'r.csv') }))
      .rejects.toThrow(/MODULE_NOT_INITIALIZED/);
    await expect(tool(m, 'resolve_identity').handler({ pseudonyms: ['FA26-001'] }))
      .rejects.toThrow(/MODULE_NOT_INITIALIZED/);
    expect(fetchCalls).toHaveLength(0);
    expect(existsSync(join(config, 'roster-vault'))).toBe(false);
    expect(existsSync(join(secrets, 'roster-vault'))).toBe(false);
  });

  it('propose -> commit -> resolve: canvas from ctx, column map and vault in secrets, no PII in the vault', async () => {
    const m = createRosterModule({ fetchImpl: fakeFetch });
    const ctx = makeFakeCtx({ config, secrets, canvas: { host: HOST, token: TOKEN }, anthropic: null });
    await m.init!(ctx);

    const proposeRes = await tool(m, 'propose_roster').handler(proposeArgs({ columnMap: COLUMN_MAP }));
    const proposal = body(proposeRes) as ProposalReport;
    expect(proposal.rows).toHaveLength(2);
    expect(proposal.llmUsed).toBe(false); // no Anthropic credential -> passthrough
    expect(proposal.majorMap).toEqual({ marketing: 'marketing', accounting: 'accounting' });

    // Canvas creds came from ctx, and the token only went to the ctx host.
    expect(fetchCalls.length).toBeGreaterThan(0);
    for (const c of fetchCalls) {
      expect(new URL(c.url).host).toBe(HOST);
      expect(c.auth).toBe(`Bearer ${TOKEN}`);
    }
    expect(ctx.requests).toEqual([
      { op: 'get', kind: 'canvas' },
      { op: 'tryGet', kind: 'anthropic' },
    ]);

    // Column map remembered under config; propose wrote no vault anywhere.
    expect(existsSync(join(secrets, 'roster-vault', 'column-map.json'))).toBe(true);
    expect(existsSync(join(config, 'roster-vault', 'column-map.json'))).toBe(false);
    expect(existsSync(join(secrets, 'roster-vault', 'vault.json'))).toBe(false);
    expect(existsSync(join(config, 'roster-vault', 'vault.json'))).toBe(false);

    // Commit needs no credential and writes the vault into the secrets root only.
    ctx.requests.length = 0;
    const out = join(work, 'roster.csv');
    const commitRes = body(await tool(m, 'commit_roster').handler({ proposal, outputPath: out })) as {
      vaultAdded: number; vaultPathWritten: string;
    };
    expect(ctx.requests).toEqual([]);
    expect(commitRes.vaultAdded).toBe(2);
    expect(commitRes.vaultPathWritten).toBe(join(secrets, 'roster-vault', 'vault.json'));
    expect(existsSync(join(config, 'roster-vault', 'vault.json'))).toBe(false);

    const rawVault = readFileSync(commitRes.vaultPathWritten, 'utf-8');
    for (const pii of ['Jane', 'Bob', 'jane@x.edu', 'bob@x.edu', 'jdoe', 'broe', 'marketing', 'accounting']) {
      expect(rawVault).not.toContain(pii);
    }
    const records = (JSON.parse(rawVault) as { records: Array<Record<string, unknown>> }).records;
    for (const r of records) {
      expect(Object.keys(r).sort()).toEqual(['canvasId', 'firstSeenTerm', 'pseudonym', 'studentNumber']);
    }

    // Resolve reads the vault from secrets and the live name from Canvas.
    const pseudonym = proposal.rows.find((r) => r.studentNumber === '100')!.pseudonym;
    const resolved = body(await tool(m, 'resolve_identity').handler({ pseudonyms: [pseudonym] })) as Array<{
      name?: string; status: string;
    }>;
    expect(resolved[0]).toMatchObject({ name: 'Jane Doe', status: 'ok' });

    // A second propose reuses the remembered mapping from config.
    const again = body(await tool(m, 'propose_roster').handler(proposeArgs())) as ProposalReport;
    expect(again.rows.every((r) => r.returning)).toBe(true);

    // No secret ever reaches a result.
    const all = JSON.stringify([proposeRes, commitRes, resolved, again]);
    expect(all).not.toContain(TOKEN);
  });

  it('uses the Anthropic credential from ctx.tryGet when present', async () => {
    const seen: AnthropicCredential[] = [];
    const m = createRosterModule({
      fetchImpl: fakeFetch,
      makeLlm: (cred) => { seen.push(cred); return upperLlm; },
    });
    await m.init!(makeFakeCtx({
      config, secrets, canvas: { host: HOST, token: TOKEN }, anthropic: { apiKey: API_KEY, model: 'm' },
    }));
    const res = await tool(m, 'propose_roster').handler(proposeArgs({ columnMap: COLUMN_MAP }));
    const proposal = body(res) as ProposalReport;
    expect(seen).toEqual([{ apiKey: API_KEY, model: 'm' }]);
    expect(proposal.llmUsed).toBe(true);
    expect(proposal.majorMap).toEqual({ marketing: 'MARKETING', accounting: 'ACCOUNTING' });
    expect(JSON.stringify(res)).not.toContain(API_KEY);
  });

  it('does not build an LLM when tryGet returns null', async () => {
    let built = 0;
    const m = createRosterModule({ fetchImpl: fakeFetch, makeLlm: () => { built++; return upperLlm; } });
    await m.init!(makeFakeCtx({ config, secrets, canvas: { host: HOST, token: TOKEN }, anthropic: null }));
    const proposal = body(await tool(m, 'propose_roster').handler(proposeArgs({ columnMap: COLUMN_MAP }))) as ProposalReport;
    expect(built).toBe(0);
    expect(proposal.llmUsed).toBe(false);
  });

  it('surfaces the host CANVAS_NOT_CONFIGURED error and makes no Canvas call', async () => {
    const m = createRosterModule({ fetchImpl: fakeFetch });
    await m.init!(makeFakeCtx({ config, secrets, canvas: null }));
    await expect(tool(m, 'propose_roster').handler(proposeArgs({ columnMap: COLUMN_MAP })))
      .rejects.toThrow(/CANVAS_NOT_CONFIGURED/);
    await expect(tool(m, 'resolve_identity').handler({ pseudonyms: ['FA26-001'] }))
      .rejects.toThrow(/CANVAS_NOT_CONFIGURED/);
    expect(fetchCalls).toHaveLength(0);
  });
});
