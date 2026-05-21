import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadCanvasPage, saveCanvasPage } from '../src/tools/page-io.js';

// Use tmpdir() so tests never touch the real output/ directory.
// Same pattern as personas.test.ts which uses tmpdir() for the personas file path.
const TEST_OUTPUT = join(tmpdir(), 'canvas-design-test-output');

function cleanup() {
  if (existsSync(TEST_OUTPUT)) {
    rmSync(TEST_OUTPUT, { recursive: true, force: true });
  }
}

beforeEach(cleanup);
afterEach(cleanup);

describe('loadCanvasPage', () => {
  it('reads a named file and returns html + filename', () => {
    mkdirSync(TEST_OUTPUT, { recursive: true });
    writeFileSync(join(TEST_OUTPUT, 'test.html'), '<p>Hello</p>', 'utf-8');
    const result = loadCanvasPage({ filename: 'test.html' }, TEST_OUTPUT);
    expect(result.html).toBe('<p>Hello</p>');
    expect(result.filename).toBe('test.html');
  });

  it('auto-selects the most recently modified file when no filename given', () => {
    mkdirSync(TEST_OUTPUT, { recursive: true });
    const olderPath = join(TEST_OUTPUT, 'old.html');
    const newerPath = join(TEST_OUTPUT, 'new.html');
    writeFileSync(olderPath, '<p>old</p>', 'utf-8');
    writeFileSync(newerPath, '<p>new</p>', 'utf-8');
    // utimesSync forces an explicit mtime difference regardless of filesystem resolution.
    // Without this, both files can get the same mtime on fast machines.
    const now = new Date();
    const past = new Date(Date.now() - 5000);
    utimesSync(olderPath, past, past);
    utimesSync(newerPath, now, now);
    const result = loadCanvasPage({}, TEST_OUTPUT);
    expect(result.html).toBe('<p>new</p>');
    expect(result.filename).toBe('new.html');
  });

  it('throws when output/ directory does not exist', () => {
    expect(() => loadCanvasPage({}, TEST_OUTPUT)).toThrow('output/ directory not found');
  });

  it('throws when output/ exists but contains no .html files', () => {
    mkdirSync(TEST_OUTPUT, { recursive: true });
    writeFileSync(join(TEST_OUTPUT, 'readme.txt'), 'not html', 'utf-8');
    expect(() => loadCanvasPage({}, TEST_OUTPUT)).toThrow('No HTML files found');
  });

  it('throws when named file does not exist', () => {
    mkdirSync(TEST_OUTPUT, { recursive: true });
    expect(() => loadCanvasPage({ filename: 'missing.html' }, TEST_OUTPUT)).toThrow('File not found');
  });
});

describe('saveCanvasPage', () => {
  it('writes a new file and returns null backup when no prior file exists', () => {
    // TEST_OUTPUT is wiped in beforeEach — saveCanvasPage must create the directory itself.
    // This tests the mkdirSync({ recursive: true }) path.
    const result = saveCanvasPage({ html: '<p>Hello</p>', filename: 'new.html' }, TEST_OUTPUT);
    expect(existsSync(join(TEST_OUTPUT, 'new.html'))).toBe(true);
    expect(readFileSync(join(TEST_OUTPUT, 'new.html'), 'utf-8')).toBe('<p>Hello</p>');
    expect(result.backup).toBeNull();
    expect(result.saved).toContain('new.html');
  });

  it('backs up existing file then writes improved version', () => {
    mkdirSync(TEST_OUTPUT, { recursive: true });
    writeFileSync(join(TEST_OUTPUT, 'page.html'), '<p>original</p>', 'utf-8');
    const result = saveCanvasPage({ html: '<p>improved</p>', filename: 'page.html' }, TEST_OUTPUT);
    expect(readFileSync(join(TEST_OUTPUT, 'page.html'), 'utf-8')).toBe('<p>improved</p>');
    expect(readFileSync(join(TEST_OUTPUT, 'page.html.bak'), 'utf-8')).toBe('<p>original</p>');
    expect(result.backup).not.toBeNull();
    expect(result.saved).toContain('page.html');
  });

  it('overwrites existing .bak with the latest pre-save version', () => {
    // Simulates: page was saved once (creating .bak=v1), now being saved again.
    // After the second save, .bak should hold v2 (the version just before this save),
    // not the original v1.
    mkdirSync(TEST_OUTPUT, { recursive: true });
    writeFileSync(join(TEST_OUTPUT, 'page.html'), '<p>v2</p>', 'utf-8');
    writeFileSync(join(TEST_OUTPUT, 'page.html.bak'), '<p>v1</p>', 'utf-8');
    saveCanvasPage({ html: '<p>v3</p>', filename: 'page.html' }, TEST_OUTPUT);
    expect(readFileSync(join(TEST_OUTPUT, 'page.html.bak'), 'utf-8')).toBe('<p>v2</p>');
    expect(readFileSync(join(TEST_OUTPUT, 'page.html'), 'utf-8')).toBe('<p>v3</p>');
  });

  it('throws when html is empty', () => {
    expect(() => saveCanvasPage({ html: '', filename: 'page.html' }, TEST_OUTPUT)).toThrow('html must not be empty');
  });

  it('throws when filename is empty', () => {
    expect(() => saveCanvasPage({ html: '<p>hi</p>', filename: '' }, TEST_OUTPUT)).toThrow('filename must not be empty');
  });
});
