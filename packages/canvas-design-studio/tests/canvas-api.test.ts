import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasApiClient, CanvasApiError } from '../src/canvas-api.js';
import type { InstitutionConfig } from '../src/types.js';

const config: InstitutionConfig = {
  institution: 'Example University',
  colors: {
    primary: '#0033A0',
    primaryDark: '#002277',
    primaryLight: '#E6ECF9',
    secondary: '#D64309',
  },
  canvasUrl: 'https://example.instructure.com/',
  apiToken: 'token-123',
};

function mockResponse(body: unknown, init: { ok?: boolean; status?: number; link?: string } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.ok === false ? 'Error' : 'OK',
    headers: {
      get: (name: string) => name.toLowerCase() === 'link' ? init.link ?? null : null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function calledUrl(): string {
  const firstCall = vi.mocked(fetch).mock.calls[0];
  return String(firstCall[0]);
}

describe('CanvasApiClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('lists courses with auth header, metadata includes, and enrollment workflow state', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([{ id: 42, name: 'ITM 310' }]));

    const client = new CanvasApiClient(config);
    const courses = await client.listCourses('active');
    const url = decodeURIComponent(calledUrl());

    expect(courses[0].id).toBe(42);
    expect(url).toContain('/api/v1/courses?');
    expect(url).toContain('per_page=50');
    expect(url).toContain('include[]=term');
    expect(url).toContain('include[]=total_students');
    expect(url).toContain('include[]=teachers');
    expect(url).toContain('enrollment_workflow_state[]=active');
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      })
    );
  });

  it('supports multiple enrollment workflow states for course listing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([]));

    const client = new CanvasApiClient(config);
    await client.listCourses(['invited', 'pending']);
    const url = decodeURIComponent(calledUrl());

    expect(url).toContain('enrollment_workflow_state[]=invited');
    expect(url).toContain('enrollment_workflow_state[]=pending');
  });

  it('paginates list responses using Canvas Link headers', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockResponse(
        [{ id: 1, name: 'Page 1' }],
        { link: '<https://example.instructure.com/api/v1/courses?page=2>; rel="next"' }
      ))
      .mockResolvedValueOnce(mockResponse([{ id: 2, name: 'Page 2' }]));

    const client = new CanvasApiClient(config);
    const courses = await client.listCourses();

    expect(courses.map(course => course.id)).toEqual([1, 2]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('refuses off-origin Link pagination and never sends credentials there (#124)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(
      [{ id: 1, name: 'Page 1' }],
      { link: '<https://evil.example/api/v1/courses?page=2>; rel="next"' }
    ));

    const client = new CanvasApiClient(config);
    await expect(client.listCourses()).rejects.toMatchObject({ code: 'CANVAS_PAGINATION_OFF_HOST' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('lists Canvas pages for a course', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([{ title: 'Assignment', url: 'assignment' }]));

    const client = new CanvasApiClient(config);
    const pages = await client.listPages(42);
    const url = decodeURIComponent(calledUrl());

    expect(pages[0].url).toBe('assignment');
    expect(url).toBe('https://example.instructure.com/api/v1/courses/42/pages?per_page=50');
  });

  it('creates a Canvas page with published true by default', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({
      title: 'Assignment 16.06',
      url: 'assignment-16-06',
      html_url: 'https://example.instructure.com/courses/42/pages/assignment-16-06',
    }));

    const client = new CanvasApiClient(config);
    const page = await client.createPage(42, 'Assignment 16.06', '<h2>Hello</h2>');

    expect(page.url).toBe('assignment-16-06');
    expect(fetch).toHaveBeenCalledWith(
      'https://example.instructure.com/api/v1/courses/42/pages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ wiki_page: { title: 'Assignment 16.06', body: '<h2>Hello</h2>', published: true } }),
      })
    );
  });

  it('updates an existing Canvas page by page url', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({
      title: 'Assignment 16.06',
      url: 'assignment-16-06',
      html_url: 'https://example.instructure.com/courses/42/pages/assignment-16-06',
    }));

    const client = new CanvasApiClient(config);
    const page = await client.updatePage(42, 'assignment-16-06', '<h2>Updated</h2>');

    expect(page.url).toBe('assignment-16-06');
    expect(fetch).toHaveBeenCalledWith(
      'https://example.instructure.com/api/v1/courses/42/pages/assignment-16-06',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ wiki_page: { body: '<h2>Updated</h2>' } }),
      })
    );
  });

  it('retries 429 responses before succeeding', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockResponse({ message: 'rate limited' }, { ok: false, status: 429 }))
      .mockResolvedValueOnce(mockResponse({ message: 'rate limited' }, { ok: false, status: 429 }))
      .mockResolvedValueOnce(mockResponse([{ id: 7, name: 'Recovered' }]));

    const client = new CanvasApiClient(config, { retryDelaysMs: [1, 1, 1] });
    const courses = await client.listCourses();

    expect(courses[0].name).toBe('Recovered');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('maps Canvas HTTP errors into professor-readable errors', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ errors: ['forbidden'] }, { ok: false, status: 403 }));

    const client = new CanvasApiClient(config);
    const promise = client.listPages(42);

    await expect(promise).rejects.toBeInstanceOf(CanvasApiError);
    await expect(promise).rejects.toMatchObject({
      code: 'CANVAS_FORBIDDEN',
      message: 'Your Canvas API token or Canvas role does not allow editing pages in this course.',
    });
  });

  it('maps network failures to Canvas network errors', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('socket closed'));

    const client = new CanvasApiClient(config);

    await expect(client.listPages(42)).rejects.toMatchObject({
      code: 'CANVAS_NETWORK_ERROR',
      message: 'Canvas API unreachable - check your Canvas URL in institution config and try again.',
    });
  });
});
