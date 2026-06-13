import type { Grouping } from '../types.js';
import type { CanvasClient } from '../data/canvas-client.js';

export interface PushResult { categoryId: number; groupIds: number[]; }

/** Create a Canvas Group Set (category) + a group per group + memberships. */
export async function pushGroupsToCanvas(
  client: Pick<CanvasClient, 'createGroupCategory' | 'createGroup' | 'addGroupMember'>,
  courseId: number,
  categoryName: string,
  grouping: Grouping,
): Promise<PushResult> {
  const cat = await client.createGroupCategory(courseId, categoryName);
  const groupIds: number[] = [];
  for (let i = 0; i < grouping.length; i++) {
    const grp = await client.createGroup(cat.id, `Group ${i + 1}`);
    groupIds.push(grp.id);
    for (const canvasId of grouping[i]) await client.addGroupMember(grp.id, Number(canvasId));
  }
  return { categoryId: cat.id, groupIds };
}
