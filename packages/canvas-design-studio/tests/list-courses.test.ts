import { describe, expect, it, vi } from 'vitest';
import type { CanvasCourse, InstitutionConfig } from '../src/types.js';
import { listCanvasCourses } from '../src/tools/list-courses.js';

const config: InstitutionConfig = {
  institution: 'Boise State University',
  colors: {
    primary: '#0033A0',
    primaryDark: '#002277',
    primaryLight: '#E6ECF9',
    secondary: '#D64309',
  },
  canvasUrl: 'https://boisestate.instructure.com',
  apiToken: 'token',
  favoriteCourses: [2],
  kbTipShown: false,
};

function course(id: number, name: string, extras: Partial<CanvasCourse> = {}): CanvasCourse {
  return {
    id,
    name,
    term: { name: 'Spring 2026' },
    total_students: 28,
    teachers: [{ display_name: 'Dr. Rank' }],
    ...extras,
  };
}

describe('listCanvasCourses', () => {
  it('maps semester=current to active enrollment workflow state', async () => {
    const api = { listCourses: vi.fn().mockResolvedValue([course(1, 'ITM 310')]) };
    const saveConfig = vi.fn();

    await listCanvasCourses({ semester: 'current' }, config, api, saveConfig);

    expect(api.listCourses).toHaveBeenCalledWith('active');
  });

  it('maps semester=future to invited, pending, and creation_pending states', async () => {
    const api = { listCourses: vi.fn().mockResolvedValue([course(1, 'Future Course')]) };
    const saveConfig = vi.fn();

    await listCanvasCourses({ semester: 'future' }, config, api, saveConfig);

    expect(api.listCourses).toHaveBeenCalledWith(['invited', 'pending', 'creation_pending']);
  });

  it('maps semester=past to completed enrollment workflow state', async () => {
    const api = { listCourses: vi.fn().mockResolvedValue([course(1, 'Past Course')]) };
    const saveConfig = vi.fn();

    await listCanvasCourses({ semester: 'past' }, config, api, saveConfig);

    expect(api.listCourses).toHaveBeenCalledWith('completed');
  });

  it('maps semester=all to no enrollment workflow state', async () => {
    const api = { listCourses: vi.fn().mockResolvedValue([course(1, 'ITM 310')]) };
    const saveConfig = vi.fn();

    await listCanvasCourses({ semester: 'all' }, config, api, saveConfig);

    expect(api.listCourses).toHaveBeenCalledWith(undefined);
  });

  it('returns a friendly missing-token response before API calls', async () => {
    const api = { listCourses: vi.fn() };
    const saveConfig = vi.fn();

    const result = await listCanvasCourses({ semester: 'current' }, { ...config, apiToken: undefined }, api, saveConfig);

    expect(result.courses).toEqual([]);
    expect(result.text).toContain('No Token Configured');
    expect(result.text).toContain('You can still generate HTML and paste it into Canvas manually');
    expect(api.listCourses).not.toHaveBeenCalled();
  });

  it('pins favorite courses to the top with a marker', async () => {
    const api = { listCourses: vi.fn().mockResolvedValue([course(1, 'ITM 310'), course(2, 'ITM 370')]) };
    const saveConfig = vi.fn();

    const result = await listCanvasCourses({ semester: 'current', includeFavorites: true }, config, api, saveConfig);

    expect(result.courses[0].id).toBe(2);
    expect(result.text).toContain('Favorite: yes');
    expect(result.text.indexOf('Course ID: 2')).toBeLessThan(result.text.indexOf('Course ID: 1'));
  });

  it('does not pin favorites when includeFavorites is false', async () => {
    const api = { listCourses: vi.fn().mockResolvedValue([course(1, 'ITM 310'), course(2, 'ITM 370')]) };
    const saveConfig = vi.fn();

    const result = await listCanvasCourses({ semester: 'current', includeFavorites: false }, config, api, saveConfig);

    expect(result.courses.map(item => item.id)).toEqual([1, 2]);
    expect(result.text).not.toContain('Favorite: yes');
  });

  it('shows friendly_name as nickname fallback', async () => {
    const api = {
      listCourses: vi.fn().mockResolvedValue([
        course(1, 'ITM 310 Business Intelligence', {
          friendly_name: 'Sp26 | ITM 310-002 Business Intelligence (RANK)',
        }),
      ]),
    };
    const saveConfig = vi.fn();

    const result = await listCanvasCourses({ semester: 'current' }, { ...config, kbTipShown: true }, api, saveConfig);

    expect(result.text).toContain('Nickname: Sp26 | ITM 310-002 Business Intelligence (RANK)');
  });

  it('shows explicit nickname before friendly_name', async () => {
    const api = {
      listCourses: vi.fn().mockResolvedValue([
        course(1, 'ITM 310 Business Intelligence', {
          nickname: 'My Short Name',
          friendly_name: 'Sp26 | ITM 310-002 Business Intelligence (RANK)',
        }),
      ]),
    };
    const saveConfig = vi.fn();

    const result = await listCanvasCourses({ semester: 'current' }, { ...config, kbTipShown: true }, api, saveConfig);

    expect(result.text).toContain('Nickname: My Short Name');
    expect(result.text).not.toContain('Nickname: Sp26 | ITM 310-002 Business Intelligence (RANK)');
  });

  it('shows naming convention tip once and persists kbTipShown', async () => {
    const api = { listCourses: vi.fn().mockResolvedValue([course(1, 'ITM 310')]) };
    const saveConfig = vi.fn();

    const result = await listCanvasCourses({ semester: 'current' }, config, api, saveConfig);

    expect(result.text).toContain('Canvas lets you set a course nickname');
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ kbTipShown: true }));
  });

  it('does not repeat naming convention tip after it has been shown', async () => {
    const api = { listCourses: vi.fn().mockResolvedValue([course(1, 'ITM 310')]) };
    const saveConfig = vi.fn();

    const result = await listCanvasCourses({ semester: 'current' }, { ...config, kbTipShown: true }, api, saveConfig);

    expect(result.text).not.toContain('Canvas lets you set a course nickname');
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it('includes coordinator gotcha for course shells', async () => {
    const api = {
      listCourses: vi.fn().mockResolvedValue([
        course(3, 'Coordinator Shell', { total_students: 0, teachers: [{}, {}, {}] }),
      ]),
    };
    const saveConfig = vi.fn();

    const result = await listCanvasCourses({ semester: 'current' }, { ...config, kbTipShown: true }, api, saveConfig);

    expect(result.text).toContain('Heads up: this course has 3 teachers and 0 students');
  });
});

describe('missingTokenText enrichment', () => {
  it('missing token response contains ChatGPT help URL', async () => {
    const api = { listCourses: vi.fn() };
    const saveConfig = vi.fn();
    const result = await listCanvasCourses({}, { ...config, apiToken: '' }, api, saveConfig);
    expect(result.text).toMatch(/chatgpt\.com/);
  });

  it('missing token response includes the Canvas URL', async () => {
    const api = { listCourses: vi.fn() };
    const saveConfig = vi.fn();
    const result = await listCanvasCourses({}, { ...config, apiToken: '' }, api, saveConfig);
    expect(result.text).toContain('boisestate.instructure.com');
  });
});
