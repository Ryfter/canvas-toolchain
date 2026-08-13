import { describe, it, expect } from 'vitest';
import { normalizeCanvasHost, canvasBaseUrl } from '../src/canvas-host.js';

describe('normalizeCanvasHost', () => {
  it('completes a bare school subdomain to an instructure.com host', () => {
    // The defect this function exists to prevent: a bare label was persisted
    // verbatim, so every request went to https://<label>/ and failed DNS/TLS.
    expect(normalizeCanvasHost('exampleucanvas')).toBe('exampleucanvas.instructure.com');
  });

  it('leaves a vanity domain untouched', () => {
    expect(normalizeCanvasHost('canvas.exampleu.edu')).toBe('canvas.exampleu.edu');
  });

  it('strips scheme, path, query, and trailing slashes', () => {
    expect(normalizeCanvasHost('https://example.instructure.com/')).toBe('example.instructure.com');
    expect(normalizeCanvasHost('http://example.instructure.com/courses/1')).toBe('example.instructure.com');
    expect(normalizeCanvasHost('https://example.instructure.com?x=1')).toBe('example.instructure.com');
  });

  it('lowercases and trims surrounding whitespace and trailing dots', () => {
    expect(normalizeCanvasHost('  EXAMPLE.Instructure.COM.  ')).toBe('example.instructure.com');
  });

  it('preserves an explicit port', () => {
    expect(normalizeCanvasHost('https://canvas.exampleu.edu:8443/api')).toBe('canvas.exampleu.edu:8443');
  });

  it('returns empty string for empty or scheme-only input', () => {
    expect(normalizeCanvasHost('')).toBe('');
    expect(normalizeCanvasHost('   ')).toBe('');
    expect(normalizeCanvasHost('https://')).toBe('');
  });

  it('is idempotent', () => {
    for (const raw of ['exampleucanvas', 'https://example.instructure.com/', 'canvas.exampleu.edu', '']) {
      const once = normalizeCanvasHost(raw);
      expect(normalizeCanvasHost(once)).toBe(once);
    }
  });

  // Parity with installer/tasks/canvashost.go — both write the same
  // ~/.command-and-control/canvas-config.json and must agree on its contents.
  it('matches the Go installer table', () => {
    const goTable: Array<[string, string]> = [
      ['exampleucanvas', 'exampleucanvas.instructure.com'],
      ['https://exampleucanvas.instructure.com', 'exampleucanvas.instructure.com'],
      ['http://example.instructure.com/', 'example.instructure.com'],
      ['canvas.exampleu.edu', 'canvas.exampleu.edu'],
      ['  EXAMPLEU  ', 'exampleu.instructure.com'],
      ['', ''],
    ];
    for (const [input, want] of goTable) {
      expect(normalizeCanvasHost(input)).toBe(want);
    }
  });
});

describe('canvasBaseUrl', () => {
  it('builds a full origin from any accepted host spelling', () => {
    expect(canvasBaseUrl('exampleucanvas')).toBe('https://exampleucanvas.instructure.com');
    expect(canvasBaseUrl('https://example.instructure.com/')).toBe('https://example.instructure.com');
  });

  it('throws rather than emitting an unusable base URL', () => {
    expect(() => canvasBaseUrl('')).toThrow(/CANVAS_HOST_INVALID/);
  });
});
