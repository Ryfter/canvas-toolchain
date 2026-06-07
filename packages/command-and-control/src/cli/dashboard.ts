#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs';
import { startDashboardServer } from '../dashboard/server.js';
import { loadConfig } from '../kb/config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const coursesRoot = config.coursesRoot;

  if (!coursesRoot) {
    console.error('Error: coursesRoot is not set in ~/.command-and-control/config.json.');
    console.error('Run the set_courses_root MCP tool first, or edit config.json directly.');
    process.exit(1);
  }
  if (!existsSync(coursesRoot) || !statSync(coursesRoot).isDirectory()) {
    console.error(`Error: configured coursesRoot does not exist: ${coursesRoot}`);
    process.exit(1);
  }

  const { url } = await startDashboardServer({ coursesRoot });
  console.log(`Canvas Toolchain Dashboard running at ${url}`);
  console.log('Press Ctrl-C to stop.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
