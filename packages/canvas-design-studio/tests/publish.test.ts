import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CanvasApiError } from '../src/canvas-api.js';
import type { CanvasPage, InstitutionConfig } from '../src/types.js';
import { publishToCanvas, scanFerpa, titleSimilarity, type PublishSuccess, type PublishToCanvasInput } from '../src/tools/publish.js';
import { loadAcknowledgments } from '../src/tools/a11y/records.js';

const config: InstitutionConfig = {
  institution: 'Example University',
  colors: {
    primary: '#0033A0',
    primaryDark: '#002277',
    primaryLight: '#E6ECF9',
    secondary: '#D64309',
  },
  canvasUrl: 'https://example.instructure.com',
  apiToken: 'token',
  professorEmail: 'professor@example.edu',
};

const page: CanvasPage = {
  title: 'ITM 310 - Assignment 16.06',
  url: 'itm-310-assignment-16-06',
  html_url: 'https://example.instructure.com/courses/42/pages/itm-310-assignment-16-06',
};

function apiMock(overrides: Partial<{
  listPages: ReturnType<typeof vi.fn>;
  createPage: ReturnType<typeof vi.fn>;
  updatePage: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    listPages: overrides.listPages ?? vi.fn().mockResolvedValue([]),
    createPage: overrides.createPage ?? vi.fn().mockResolvedValue(page),
    updatePage: overrides.updatePage ?? vi.fn().mockResolvedValue(page),
  };
}

describe('scanFerpa', () => {
  it('flags obvious University student IDs', () => {
    expect(scanFerpa('<p>Student B12345678</p>', config.professorEmail)).toMatchObject({
      reason: 'possible University student ID',
    });
  });

  it('flags 9-digit IDs', () => {
    expect(scanFerpa('<p>Student 123456789</p>', config.professorEmail)).toMatchObject({
      reason: 'possible 9-digit student ID',
    });
  });

  it('flags grade disclosure patterns', () => {
    expect(scanFerpa('<p>Avery Johnson received 94%</p>', config.professorEmail)).toMatchObject({
      reason: 'possible grade disclosure',
    });
  });

  it('does not block ordinary email addresses', () => {
    expect(scanFerpa('<p>Contact example@partner.org for support.</p>', config.professorEmail)).toBeUndefined();
  });
});

describe('titleSimilarity', () => {
  it('detects suffix-style title collisions with token containment', () => {
    expect(titleSimilarity('ITM 310 - Assignment 16.06', 'ITM 310 - Assignment 16.06 AI Projects')).toBeGreaterThanOrEqual(0.8);
  });
});

describe('publishToCanvas', () => {
  it('fails before HTTP when API token is missing', async () => {
    const api = apiMock();

    const result = await publishToCanvas({ courseId: 42, html: '<h2>Hello</h2>', pageTitle: 'New Page' }, { ...config, apiToken: '' }, api);

    expect(result).toMatchObject({ code: 'MISSING_API_TOKEN' });
    expect(api.listPages).not.toHaveBeenCalled();
  });

  it('fails before HTTP when courseId is missing', async () => {
    const api = apiMock();

    const result = await publishToCanvas({ html: '<h2>Hello</h2>', pageTitle: 'New Page' }, config, api);

    expect(result).toMatchObject({ code: 'COURSE_ID_REQUIRED' });
    expect(api.listPages).not.toHaveBeenCalled();
  });

  it('blocks obvious FERPA patterns before Canvas API calls', async () => {
    const api = apiMock();

    const result = await publishToCanvas({ courseId: 42, html: '<h2>Grades</h2>\n<p>Student B12345678: A</p>', pageTitle: 'Grades' }, config, api);

    expect(result).toMatchObject({ code: 'FERPA_REVIEW_REQUIRED' });
    expect(api.listPages).not.toHaveBeenCalled();
  });

  it('allows FERPA override when skipFerpaCheck is true', async () => {
    const api = apiMock({ createPage: vi.fn().mockResolvedValue(page) });

    const result = await publishToCanvas({
      courseId: 42,
      html: '<h2>Grades</h2>\n<p>Student B12345678: A</p>',
      pageTitle: 'Grades',
      skipFerpaCheck: true,
    }, config, api);

    expect(result).toMatchObject({ action: 'created', url: page.html_url });
  });

  it('blocks invalid Canvas HTML unless forcePublish is true', async () => {
    const api = apiMock();

    const result = await publishToCanvas({ courseId: 42, html: '<h1>Bad</h1>', pageTitle: 'Bad Page' }, config, api);

    expect(result).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(api.listPages).not.toHaveBeenCalled();
  });

  it('allows validation override when forcePublish is true', async () => {
    const api = apiMock({ createPage: vi.fn().mockResolvedValue(page) });

    const result = await publishToCanvas({ courseId: 42, html: '<h1>Legacy</h1>', pageTitle: 'Legacy Page', forcePublish: true }, config, api);

    expect(result).toMatchObject({ action: 'created' });
    expect(api.createPage).toHaveBeenCalled();
  });

  it('returns TITLE_COLLISION when a similar page exists and no action is provided', async () => {
    const api = apiMock({ listPages: vi.fn().mockResolvedValue([page]) });

    const result = await publishToCanvas({ courseId: 42, html: '<h2>Hello</h2>', pageTitle: 'ITM 310 - Assignment 16.06 AI Projects' }, config, api);

    expect(result).toMatchObject({ code: 'TITLE_COLLISION' });
    expect(api.createPage).not.toHaveBeenCalled();
  });

  it('updates existing page when collisionAction is update', async () => {
    const api = apiMock({
      listPages: vi.fn().mockResolvedValue([page]),
      updatePage: vi.fn().mockResolvedValue(page),
    });

    const result = await publishToCanvas({ courseId: 42, html: '<h2>Hello</h2>', pageTitle: page.title, collisionAction: 'update' }, config, api);

    expect(api.updatePage).toHaveBeenCalledWith(42, 'itm-310-assignment-16-06', '<h2>Hello</h2>');
    expect(result).toMatchObject({ action: 'updated', url: page.html_url });
  });

  it('creates a new page when collisionAction is create', async () => {
    const api = apiMock({
      listPages: vi.fn().mockResolvedValue([page]),
      createPage: vi.fn().mockResolvedValue({ ...page, title: 'ITM 310 - Assignment 16.06 AI Projects' }),
    });

    const result = await publishToCanvas({ courseId: 42, html: '<h2>Hello</h2>', pageTitle: 'ITM 310 - Assignment 16.06 AI Projects', collisionAction: 'create' }, config, api);

    expect(api.createPage).toHaveBeenCalledWith(42, 'ITM 310 - Assignment 16.06 AI Projects', '<h2>Hello</h2>');
    expect(result).toMatchObject({ action: 'created' });
  });

  it('creates a related page with relatedPageTitle', async () => {
    const related = { ...page, title: 'ITM 310 - Assignment 16.06 Makeup', url: 'itm-310-assignment-16-06-makeup' };
    const api = apiMock({
      listPages: vi.fn().mockResolvedValue([page]),
      createPage: vi.fn().mockResolvedValue(related),
    });

    const result = await publishToCanvas({
      courseId: 42,
      html: '<h2>Hello</h2>',
      pageTitle: page.title,
      collisionAction: 'related',
      relatedPageTitle: related.title,
    }, config, api);

    expect(api.createPage).toHaveBeenCalledWith(42, related.title, '<h2>Hello</h2>');
    expect(result).toMatchObject({ action: 'created', pageTitle: related.title });
  });

  it('requires relatedPageTitle for related collision action', async () => {
    const api = apiMock({ listPages: vi.fn().mockResolvedValue([page]) });

    const result = await publishToCanvas({
      courseId: 42,
      html: '<h2>Hello</h2>',
      pageTitle: page.title,
      collisionAction: 'related',
    }, config, api);

    expect(result).toMatchObject({ code: 'RELATED_TITLE_REQUIRED' });
    expect(api.createPage).not.toHaveBeenCalled();
  });

  it('cancels without changing Canvas', async () => {
    const api = apiMock({ listPages: vi.fn().mockResolvedValue([page]) });

    const result = await publishToCanvas({ courseId: 42, html: '<h2>Hello</h2>', pageTitle: page.title, collisionAction: 'cancel' }, config, api);

    expect(result).toMatchObject({ code: 'PUBLISH_CANCELLED' });
    expect(api.createPage).not.toHaveBeenCalled();
    expect(api.updatePage).not.toHaveBeenCalled();
  });

  it('maps Canvas 403 through role-aware permission gotcha', async () => {
    const api = apiMock({
      listPages: vi.fn().mockRejectedValue(new CanvasApiError(403, 'CANVAS_FORBIDDEN', 'forbidden')),
    });

    const result = await publishToCanvas({ courseId: 42, html: '<h2>Hello</h2>', pageTitle: 'New Page' }, config, api);

    expect(result).toMatchObject({ code: 'CANVAS_FORBIDDEN' });
    expect('error' in result ? result.error : '').toContain('does not have permission');
  });

  it('includes conformance report in success response for clean html', async () => {
    const api = apiMock({ createPage: vi.fn().mockResolvedValue(page) });
    const html = '<p>Welcome to the course.</p>';

    const result = await publishToCanvas({ courseId: 42, html, pageTitle: 'Test Page' }, config, api);

    expect(result).toMatchObject({ action: 'created' });
    expect((result as PublishSuccess).conformance).toBeDefined();
  });

  // Deterministic in-house findings:
  // vague link  -> 2.4.4 moderate  => borderline
  // headerless table -> 1.3.1 serious => clear failure
  const BORDERLINE_HTML = '<p>Course intro. <a href="https://example.edu/syllabus">click here</a></p>';
  const FAIL_HTML = '<table><tr><td>Monday</td><td>Lab 1</td></tr></table>';
  const CLEAN_HTML = '<p>Welcome to the course. Read the <a href="https://example.edu/syllabus">course syllabus</a> before week one.</p>';

  describe('accessibility gate (two-tier, spec §3)', () => {
    it('publishes a passing page without any acknowledgment', async () => {
      const api = apiMock();
      const result = await publishToCanvas(
        { courseId: 1, html: CLEAN_HTML, pageTitle: 'Welcome' }, config, api);
      expect('url' in result).toBe(true);
      if ('url' in result) expect(result.acknowledgment).toBeUndefined();
    });

    it('blocks borderline without acknowledgment, with code ACCESSIBILITY_ACK_REQUIRED', async () => {
      const api = apiMock();
      const result = await publishToCanvas(
        { courseId: 1, html: BORDERLINE_HTML, pageTitle: 'Intro' }, config, api);
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.code).toBe('ACCESSIBILITY_ACK_REQUIRED');
        expect((result.details as { verdict: string }).verdict).toBe('borderline');
      }
    });

    it('publishes borderline with acknowledgeAccessibility: true and records it', async () => {
      const api = apiMock();
      const courseDir = mkdtempSync(join(tmpdir(), 'pub-ack-'));
      try {
        const result = await publishToCanvas(
          { courseId: 1, html: BORDERLINE_HTML, pageTitle: 'Intro', acknowledgeAccessibility: true, courseDir },
          config, api);
        expect('url' in result).toBe(true);
        if ('url' in result) {
          expect(result.acknowledgment?.tier).toBe('borderline');
          expect(result.acknowledgment?.scIds).toEqual([]);
        }
        const records = loadAcknowledgments(courseDir);
        expect(records).toHaveLength(1);
        expect(records[0].requiredLevel).toBe('WCAG 2.1 AA');
      } finally { rmSync(courseDir, { recursive: true, force: true }); }
    });

    it('rejects true for clear failures and lists the required SCs', async () => {
      const api = apiMock();
      const result = await publishToCanvas(
        { courseId: 1, html: FAIL_HTML, pageTitle: 'Schedule', acknowledgeAccessibility: true }, config, api);
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.code).toBe('ACCESSIBILITY_ACK_REQUIRED');
        expect((result.details as { requiredScs: string[] }).requiredScs.length).toBeGreaterThan(0);
      }
    });

    it('publishes clear failures only with the complete named-SC array (round-trip from details)', async () => {
      const api = apiMock();
      const blocked = await publishToCanvas(
        { courseId: 1, html: FAIL_HTML, pageTitle: 'Schedule' }, config, api);
      expect('error' in blocked).toBe(true);
      const requiredScs = (blocked as { details: { requiredScs: string[] } }).details.requiredScs;

      const incomplete = await publishToCanvas(
        { courseId: 1, html: FAIL_HTML, pageTitle: 'Schedule', acknowledgeAccessibility: requiredScs.slice(1) },
        config, api);
      // With exactly one required SC, slice(1) is [] which is also incomplete.
      expect('error' in incomplete).toBe(true);

      const published = await publishToCanvas(
        { courseId: 1, html: FAIL_HTML, pageTitle: 'Schedule', acknowledgeAccessibility: requiredScs },
        config, api);
      expect('url' in published).toBe(true);
      if ('url' in published) expect(published.acknowledgment?.scIds).toEqual(requiredScs);
    });

    it('acknowledgment persistence failure does not fail the publish', async () => {
      const api = apiMock();
      const result = await publishToCanvas(
        { courseId: 1, html: BORDERLINE_HTML, pageTitle: 'Intro', acknowledgeAccessibility: true,
          courseDir: join(tmpdir(), 'pub-ack-missing', 'definitely', 'nested', '\0bad') },
        config, api);
      // Publish already happened; a record-write failure is warned, not surfaced as an error.
      expect('url' in result).toBe(true);
    });
  });
});

describe('missingTokenError enrichment', () => {
  it('error string contains the ChatGPT help URL', async () => {
    const configNoToken: InstitutionConfig = { ...config, apiToken: '' };
    const result = await publishToCanvas(
      { courseId: 42, html: '<p>hi</p>', pageTitle: 'Test' },
      configNoToken,
      apiMock()
    );
    expect('error' in result && result.error).toMatch(/chatgpt\.com/);
  });

  it('error string includes the Canvas URL', async () => {
    const configNoToken: InstitutionConfig = { ...config, apiToken: '' };
    const result = await publishToCanvas(
      { courseId: 42, html: '<p>hi</p>', pageTitle: 'Test' },
      configNoToken,
      apiMock()
    );
    expect('error' in result && result.error).toContain('example.instructure.com');
  });
});

describe('apiError enrichment', () => {
  it('401 error message contains fix steps and ChatGPT link', async () => {
    const listPagesMock = vi.fn().mockRejectedValue(
      new CanvasApiError(401, 'CANVAS_UNAUTHORIZED', 'Unauthorized')
    );
    const result = await publishToCanvas(
      { courseId: 42, html: '<p>hi</p>', pageTitle: 'Test' },
      config,
      apiMock({ listPages: listPagesMock })
    );
    expect('error' in result && result.error).toContain('401');
    expect('error' in result && result.error).toMatch(/chatgpt\.com/);
  });
});
