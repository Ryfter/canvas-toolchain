import { describe, it, expect } from 'vitest';
import { validateCanvasHtml } from '../src/tools/validate.js';

describe('validateCanvasHtml', () => {
  it('passes clean HTML', () => {
    const html = '<div style="color:#0033A0;"><h2>Hello</h2></div>';
    const result = validateCanvasHtml(html);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('flags <style> blocks', () => {
    const result = validateCanvasHtml('<style>body{color:red}</style>');
    expect(result.valid).toBe(false);
    expect(result.violations[0].rule).toContain('No <style> blocks');
  });

  it('flags <script> tags', () => {
    const result = validateCanvasHtml('<script>alert(1)</script>');
    expect(result.valid).toBe(false);
    expect(result.violations[0].rule).toContain('No <script>');
  });

  it('flags box-shadow', () => {
    const result = validateCanvasHtml('<div style="box-shadow: 0 2px 4px #000;">');
    expect(result.valid).toBe(false);
    expect(result.violations[0].rule).toContain('box-shadow');
  });

  it('flags gap property', () => {
    const result = validateCanvasHtml('<div style="display:flex;gap:16px;">');
    expect(result.valid).toBe(false);
    expect(result.violations[0].rule).toContain('gap');
  });

  it('flags opacity property but allows rgba colors', () => {
    const withOpacity = validateCanvasHtml('<div style="opacity:0.5;">');
    expect(withOpacity.valid).toBe(false);

    const withRgba = validateCanvasHtml('<div style="color:rgba(0,0,0,0.5);">');
    expect(withRgba.valid).toBe(true);
  });

  it('does NOT flag text-transform (only bare transform)', () => {
    const result = validateCanvasHtml('<div style="text-transform:uppercase;">');
    expect(result.valid).toBe(true);
  });

  it('flags <h1> tags', () => {
    const result = validateCanvasHtml('<h1>Title</h1>');
    expect(result.valid).toBe(false);
    expect(result.violations[0].rule).toContain('No <h1>');
  });

  it('flags img without alt attribute', () => {
    const result = validateCanvasHtml('<img src="photo.jpg">');
    expect(result.valid).toBe(false);
    expect(result.violations[0].rule).toContain('alt=""');
  });

  it('passes img with alt attribute', () => {
    const result = validateCanvasHtml('<img src="photo.jpg" alt="A photo">');
    expect(result.valid).toBe(true);
  });

  it('returns multiple violations', () => {
    const result = validateCanvasHtml('<style>.a{}</style><h1>Title</h1>');
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });
});
