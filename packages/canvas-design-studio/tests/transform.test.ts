import { describe, it, expect } from 'vitest';
import { canvasSafeTransform } from '../src/utils/transform.js';

describe('canvasSafeTransform', () => {
  it('passes through clean compliant HTML unchanged', () => {
    const html = '<div style="color: #0033a0; padding: 10px;"><h2>Hello</h2></div>';
    const result = canvasSafeTransform(html);
    expect(result.html.trim()).toContain('Hello');
    expect(result.removed).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
  });

  it('strips <script> tags and logs them in removed', () => {
    const html = '<div><script>alert("dangerous")</script><p>Safe text</p></div>';
    const result = canvasSafeTransform(html);
    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('Safe text');
    expect(result.removed.some(r => r.tag === 'script')).toBe(true);
  });

  it('strips onclick and other event handler attributes', () => {
    const html = '<button onclick="runEvilCode()" style="color: red;">Click me</button>';
    const result = canvasSafeTransform(html);
    expect(result.html).not.toContain('onclick');
    expect(result.html).toContain('Click me');
    expect(result.removed.some(r => r.tag === 'onclick')).toBe(true);
  });

  it('inlines external CSS blocks and strips <style> tag', () => {
    const html = '<html><head><style>.card { border: 1px solid #ddd; border-radius: 8px; }</style></head><body><div class="card">Content</div></body></html>';
    const result = canvasSafeTransform(html);
    expect(result.html).not.toContain('<style>');
    expect(result.html).toContain('style="border: 1px solid #ddd; border-radius: 8px;"');
  });

  it('inlines a separately passed CSS string', () => {
    const html = '<div class="alert">Warning</div>';
    const css = '.alert { background-color: #fff0f0; color: #cc0000; }';
    const result = canvasSafeTransform(html, css);
    expect(result.html).toContain('style="background-color: #fff0f0; color: #cc0000;"');
  });

  it('removes external font and stylesheet imports', () => {
    const html = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto"><div style="@import url(\'https://fonts.cdnfonts.com/css/lato\'); color: blue;">Content</div>';
    const result = canvasSafeTransform(html);
    expect(result.html).not.toContain('link');
    expect(result.html).not.toContain('Roboto');
    expect(result.html).not.toContain('@import');
  });

  it('strips non-whitelisted HTML tags but keeps content if reasonable', () => {
    const html = '<div><form><input type="text" name="name" /></form><p>Text</p></div>';
    const result = canvasSafeTransform(html);
    expect(result.html).not.toContain('<form>');
    expect(result.html).not.toContain('<input');
    expect(result.html).toContain('Text');
  });

  it('converts <h1> to <h2> with inline style and logs in removed', () => {
    const html = '<h1>Great Headline</h1>';
    const result = canvasSafeTransform(html);
    expect(result.html).not.toContain('<h1>');
    expect(result.html).toContain('<h2');
    expect(result.html).toContain('font-size: 26px;');
    expect(result.removed.some(r => r.tag === 'h1')).toBe(true);
  });

  it('strips forbidden CSS style properties and keeps allowed ones', () => {
    const html = '<div style="color: red; box-shadow: 0 4px 6px rgba(0,0,0,0.1); opacity: 0.8; transition: all 0.2s;">Box</div>';
    const result = canvasSafeTransform(html);
    expect(result.html).toContain('color: red;');
    expect(result.html).not.toContain('box-shadow');
    expect(result.html).not.toContain('opacity');
    expect(result.html).not.toContain('transition');
    expect(result.removed.some(r => r.tag === 'box-shadow')).toBe(true);
    expect(result.removed.some(r => r.tag === 'opacity')).toBe(true);
  });

  it('detects violations like missing img alt attribute or vague link text', () => {
    const html = '<img src="cat.jpg"><a href="/path">click here</a>';
    const result = canvasSafeTransform(html);
    expect(result.violations.some(v => v.issue.includes('alt'))).toBe(true);
    expect(result.violations.some(v => v.issue.includes('click here'))).toBe(true);
  });
});
