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
 *
 * CC_HOME gets the same treatment: since #151 R7 the Canvas host and token are
 * read from ~/.command-and-control/canvas-config.json, so a test that forgot to
 * isolate it would silently depend on the developer's own Canvas credentials.
 */
const runHome = mkdtempSync(join(tmpdir(), 'cds-test-home-'));
const runCcHome = mkdtempSync(join(tmpdir(), 'cds-test-cc-home-'));
process.env.CANVAS_DESIGN_HOME = runHome;
process.env.CC_HOME = runCcHome;

process.on('exit', () => {
  rmSync(runHome, { recursive: true, force: true });
  rmSync(runCcHome, { recursive: true, force: true });
});
