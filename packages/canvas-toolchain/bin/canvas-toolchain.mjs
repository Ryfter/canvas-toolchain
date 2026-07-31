#!/usr/bin/env node
// Canvas Toolchain entrypoint: launches the unified MCP server (Command & Control).
// stdout belongs to the MCP protocol — all human output goes to stderr.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
let serverPath;
try {
  serverPath = require.resolve('@canvas-toolchain/command-and-control/dist/index.js');
} catch {
  console.error(
    'Canvas Toolchain: server build not found.\n' +
    'From a source checkout, run `npm install` in the repo root first — install builds the toolchain.'
  );
  process.exit(1);
}

const child = spawn(process.execPath, [serverPath, ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
