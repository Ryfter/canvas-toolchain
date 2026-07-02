import { describe, expect, it, vi } from 'vitest';
import { CanvasApiError } from '../src/canvas-api.js';
import type { CanvasPage, InstitutionConfig } from '../src/types.js';
import { publishToCanvas, scanFerpa, titleSimilarity, type PublishSuccess, type PublishToCanvasInput } from '../src/tools/publish.js';

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

  it('includes accessibilityWarnings in success response for low-contrast html', async () => {
    const api = apiMock({ createPage: vi.fn().mockResolvedValue(page) });
    const html = '<div style="background:#cccccc;color:#ffffff;"><h2>Test</h2></div>';

    const result = await publishToCanvas({ courseId: 42, html, pageTitle: 'Test Page' }, config, api);

    expect(result).toMatchObject({ action: 'created' });
    expect((result as PublishSuccess).accessibilityWarnings?.length).toBeGreaterThan(0);
  });

  it('publish success carries a conformance report and still publishes on failures (advisory)', async () => {
    const api = apiMock({ createPage: vi.fn().mockResolvedValue(page) });
    const result = await publishToCanvas(
      { courseId: 1, pageTitle: 'T', html: '<p style="color:#999999;background:#ffffff">x</p>' } as PublishToCanvasInput,
      config, api,
    );
    expect('url' in result).toBe(true);                        // STILL publishes — no gate in Phase 1
    expect((result as { conformance?: unknown }).conformance).toBeDefined();
    expect((result as { accessibilityWarnings?: unknown[] }).accessibilityWarnings).toBeDefined();
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
