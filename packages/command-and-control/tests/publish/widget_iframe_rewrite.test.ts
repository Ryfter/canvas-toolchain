import { describe, expect, it } from 'vitest';
import { rewriteIframeFileId } from '../../src/tools/publish/widget_iframe_rewrite.js';

describe('rewriteIframeFileId', () => {
  it('swaps the file_id in a course-relative iframe src', () => {
    const html = '<p>x</p><iframe src="/courses/48895/files/100/preview" title="W"></iframe>';
    const out = rewriteIframeFileId(html, 100, 200);
    expect(out).toContain('/files/200/preview');
    expect(out).not.toContain('/files/100/preview');
  });

  it('swaps the file_id in an absolute Canvas Files url', () => {
    const html = '<iframe src="https://canvas.example/courses/1/files/100/preview"></iframe>';
    const out = rewriteIframeFileId(html, 100, 999);
    expect(out).toContain('files/999/preview');
  });

  it('only rewrites iframes pointing at the specified oldFileId — leaves others alone', () => {
    const html = '<iframe src="/courses/1/files/100/preview"></iframe><iframe src="/courses/1/files/200/preview"></iframe>';
    const out = rewriteIframeFileId(html, 100, 555);
    expect(out).toContain('files/555/preview');
    expect(out).toContain('files/200/preview');
    expect(out).not.toContain('files/100/preview');
  });

  it('handles iframe src with verifier query param', () => {
    const html = '<iframe src="/courses/1/files/100/preview?verifier=abc"></iframe>';
    const out = rewriteIframeFileId(html, 100, 200);
    expect(out).toContain('/files/200/preview?verifier=abc');
  });

  it('returns the input unchanged when oldFileId is not present', () => {
    const html = '<iframe src="/courses/1/files/999/preview"></iframe>';
    expect(rewriteIframeFileId(html, 100, 200)).toBe(html);
  });
});
