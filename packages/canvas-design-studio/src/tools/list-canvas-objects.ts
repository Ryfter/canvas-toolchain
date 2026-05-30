import type { CanvasPage } from '../types.js';

export interface CanvasAssignmentRaw {
  id: number;
  name: string;
  description: string | null;
  [key: string]: unknown;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  description: string | null;
}

export interface ListPagesApi {
  listPages(courseId: number): Promise<CanvasPage[]>;
}

export interface ListAssignmentsApi {
  listAssignments(courseId: number): Promise<CanvasAssignmentRaw[]>;
}

export async function listCanvasPages(courseId: number, api: ListPagesApi): Promise<CanvasPage[]> {
  return api.listPages(courseId);
}

export async function listCanvasAssignments(
  courseId: number,
  api: ListAssignmentsApi,
): Promise<CanvasAssignment[]> {
  const raw = await api.listAssignments(courseId);
  return raw.map(r => ({ id: r.id, name: r.name, description: r.description ?? null }));
}
