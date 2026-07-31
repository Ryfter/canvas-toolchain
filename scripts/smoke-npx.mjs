#!/usr/bin/env node
// smoke-npx.mjs — spawn an MCP server command, send initialize, expect a reply.
// Usage: node scripts/smoke-npx.mjs npx canvas-toolchain
import { spawn } from 'node:child_process';

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) { console.error('usage: smoke-npx.mjs <command> [args...]'); process.exit(2); }

const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'], shell: process.platform === 'win32' });
const req = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
  protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke-npx', version: '0.0.0' } } };

let out = '';
const timer = setTimeout(() => { console.error('TIMEOUT: no initialize reply in 30s'); child.kill(); process.exit(1); }, 30_000);

child.stdout.on('data', (d) => {
  out += d;
  for (const line of out.split('\n')) {
    try {
      const msg = JSON.parse(line);
      if (msg.id === 1 && msg.result?.serverInfo) {
        clearTimeout(timer);
        console.log(`OK: ${msg.result.serverInfo.name}@${msg.result.serverInfo.version}`);
        child.kill();
        process.exit(0);
      }
    } catch { /* partial line */ }
  }
});
child.on('exit', (code) => { clearTimeout(timer); console.error(`server exited early (code ${code})`); process.exit(1); });
child.stdin.write(JSON.stringify(req) + '\n');
