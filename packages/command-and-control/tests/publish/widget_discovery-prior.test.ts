import { describe, expect, it } from 'vitest';
import { discoverPriorWidgetRefs } from '../../src/tools/publish/widget_discovery.js';

describe('discoverPriorWidgetRefs', () => {
  it('extracts file_id from Canvas Files preview iframe', () => {
    const html = `<p>before</p>
<iframe src="/courses/20255/files/12345/preview" title="Sort the SDLC phases" width="100%" height="600"></iframe>
<p>after</p>`;
    const refs = discoverPriorWidgetRefs(html);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.canvasFileId).toBe(12345);
    expect(refs[0]!.fullMatch).toContain('files/12345/preview');
  });

  it('matches multiple iframes', () => {
    const html = `
<iframe src="/courses/1/files/100/preview"></iframe>
<iframe src="/courses/1/files/200/preview"></iframe>`;
    expect(discoverPriorWidgetRefs(html)).toHaveLength(2);
  });

  it('matches absolute Canvas Files urls too', () => {
    const html = `<iframe src="https://canvas.example/courses/1/files/777/preview" title="X"></iframe>`;
    const refs = discoverPriorWidgetRefs(html);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.canvasFileId).toBe(777);
  });

  it('returns empty when no iframes match', () => {
    expect(discoverPriorWidgetRefs('<p>no widgets here</p>')).toEqual([]);
  });
});
