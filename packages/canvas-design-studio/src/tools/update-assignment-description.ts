import type { CanvasAssignment } from './list-canvas-objects.js';

export interface UpdateAssignmentApi {
  updateAssignmentDescription(courseId: number, assignmentId: number, html: string): Promise<CanvasAssignment>;
}

export async function updateAssignmentDescription(
  courseId: number,
  assignmentId: number,
  html: string,
  api: UpdateAssignmentApi,
): Promise<CanvasAssignment> {
  return api.updateAssignmentDescription(courseId, assignmentId, html);
}
