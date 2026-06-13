import { describe, it, expect } from 'vitest';
import { pushGroupsToCanvas } from '../../src/output/canvas-push.js';

describe('pushGroupsToCanvas', () => {
  it('creates a category, a group per group, and adds members by canvas id', async () => {
    const calls: string[] = [];
    const fake = {
      async createGroupCategory(courseId: number, name: string) { calls.push(`cat ${courseId} ${name}`); return { id: 50, name }; },
      async createGroup(categoryId: number, name: string) { calls.push(`grp ${categoryId} ${name}`); return { id: 100 + calls.length, name }; },
      async addGroupMember(groupId: number, userId: number) { calls.push(`mem ${groupId} ${userId}`); return {}; },
    };
    const res = await pushGroupsToCanvas(fake as never, 5, 'Week 3 Teams', [['1', '2'], ['3']]);
    expect(res.categoryId).toBe(50);
    expect(calls[0]).toBe('cat 5 Week 3 Teams');
    expect(calls.filter((c) => c.startsWith('grp'))).toHaveLength(2);
    expect(calls.filter((c) => c.startsWith('mem'))).toHaveLength(3);
  });
});
