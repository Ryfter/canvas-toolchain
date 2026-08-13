import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Point the app home at a throwaway directory for the whole test run.
 *
 * Without this, any test that calls saveConfig() without setting
 * CANVAS_DESIGN_HOME itself writes to the professor's REAL
 * ~/.canvas-design-mcp/institution.json — overwriting their institution name,
 * Canvas URL, and API token. That has happened twice. Individual tests still
 * override CANVAS_DESIGN_HOME with their own temp dir; this is the floor that
 * makes forgetting harmless instead of destructive.
 */
const runHome = mkdtempSync(join(tmpdir(), 'cds-test-home-'));
process.env.CANVAS_DESIGN_HOME = runHome;

process.on('exit', () => {
  rmSync(runHome, { recursive: true, force: true });
});
