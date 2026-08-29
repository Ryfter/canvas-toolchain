import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Boots the real server over stdio. This is the only way to cover the module
 * adapt loop in src/index.ts: it runs once at module scope, so nothing short of
 * an actual boot exercises it.
 */
const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsx = join(pkgDir, '..', '..', 'node_modules', '.bin', 'tsx');

/** A module whose two tools share a schema.name — adaptModuleTools throws on this. */
function duplicateToolModule(id: string, toolName: string): string {
  const tool = (text: string) =>
    `{ schema: { name: '${toolName}', description: '${text}', inputSchema: { type: 'object' } },
       handler: async () => ({ content: [{ type: 'text', text: '${text}' }] }) }`;
  return `export default { id: '${id}', name: 'Dupe', description: 'malformed', version: '1.0.0',
  tools: [${tool('first')}, ${tool('second')}] };\n`;
}

function healthyModule(id: string, toolName: string): string {
  return `export default { id: '${id}', name: 'Good', description: 'healthy', version: '1.0.0',
  tools: [{ schema: { name: '${toolName}', description: 'fine', inputSchema: { type: 'object' } },
            handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }) }] };\n`;
}

function installArtifact(home: string, id: string, source: string): void {
  const path = join(home, 'modules', id, '1.0.0', 'module.mjs');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
  const ledgerPath = join(home, 'installed-modules.json');
  const ledger: { modules: Record<string, unknown> } = existsSync(ledgerPath)
    ? JSON.parse(readFileSync(ledgerPath, 'utf-8'))
    : { modules: {} };
  ledger.modules[id] = {
    id, version: '1.0.0', installedAt: '2026-08-26T00:00:00Z',
    sha256: createHash('sha256').update(source).digest('hex'),
  };
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
}

interface BootResult { responses: Map<number, any>; stderr: string }

function boot(home: string, requests: unknown[]): Promise<BootResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(tsx, ['src/index.ts'], {
      cwd: pkgDir,
      env: { ...process.env, CC_HOME: home },
    });
    const responses = new Map<number, any>();
    let stdoutBuf = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`server did not answer in time. stderr:\n${stderr}`)); }, 55_000);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf-8');
      const parts = stdoutBuf.split('\n');
      stdoutBuf = parts.pop() ?? '';
      for (const line of parts) {
        if (!line.trim()) continue;
        const frame = JSON.parse(line);
        if (typeof frame.id === 'number') responses.set(frame.id, frame);
      }
      if (responses.size === requests.length) {
        clearTimeout(timer);
        child.kill();
        resolve({ responses, stderr });
      }
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8'); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    // A host that dies before answering is the regression this file exists to catch.
    // Report it immediately instead of sitting out the timeout.
    child.on('exit', (code) => {
      if (responses.size === requests.length) return;
      clearTimeout(timer);
      reject(new Error(`server exited (code ${code ?? 'null'}) after ${responses.size}/${requests.length} responses. stderr:\n${stderr}`));
    });

    for (const req of requests) child.stdin.write(`${JSON.stringify(req)}\n`);
  });
}

const INIT = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'boot-test', version: '0' } },
};

describe('server boot with a malformed module', () => {
  let home: string;
  let booted: BootResult;

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), 'cc-boot-'));
    installArtifact(home, 'dupe', duplicateToolModule('dupe', 'clash_tool'));
    installArtifact(home, 'good', healthyModule('good', 'good_tool'));
    writeFileSync(
      join(home, 'modules.json'),
      JSON.stringify({ modules: { dupe: { enabled: true }, good: { enabled: true } } }),
    );
    booted = await boot(home, [
      INIT,
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'ct_advanced', arguments: { action: 'describe', section: 'modules' } } },
    ]);
  }, 60_000);

  afterAll(() => { rmSync(home, { recursive: true, force: true }); });

  it('still starts, and still registers as canvas-toolchain', () => {
    expect(booted.responses.get(1)?.result?.serverInfo).toEqual({
      name: 'canvas-toolchain', version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
    });
  });

  it('still serves the ten-tool surface', () => {
    expect(booted.responses.get(2)?.result?.tools).toHaveLength(10);
  });

  it('skips only the malformed module — the healthy one still loads', () => {
    const section = JSON.parse(booted.responses.get(3).result.content[0].text);
    const ops = Object.keys(section.operations);
    expect(ops).toContain('good.good_tool');
    expect(ops.filter((id) => id.startsWith('dupe.'))).toEqual([]);
  });

  it('logs the skipped module by id', () => {
    expect(booted.stderr).toContain("[modules] 'dupe' produced an unusable operation set");
  });
});
