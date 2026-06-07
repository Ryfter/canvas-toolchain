import { existsSync, statSync } from 'node:fs';
import { startDashboardServer } from '../dashboard/server.js';
import { walkForCourses } from '../dashboard/data.js';
import { loadConfig } from '../kb/config.js';

export interface OpenDashboardInput {
  port?: number;
}

export type OpenDashboardResult =
  | { ok: true; url: string; port: number; coursesRoot: string; courseCount: number }
  | { ok: false; error: 'COURSES_ROOT_NOT_SET' | 'COURSES_ROOT_NOT_FOUND' | 'PORT_IN_USE'; message: string; fix: string[] };

export async function openDashboard(input: OpenDashboardInput): Promise<OpenDashboardResult> {
  const config = loadConfig();
  const coursesRoot = config.coursesRoot;

  if (!coursesRoot) {
    return {
      ok: false,
      error: 'COURSES_ROOT_NOT_SET',
      message: 'coursesRoot is not set in ~/.command-and-control/config.json',
      fix: ['Run set_courses_root with the absolute path to your courses folder'],
    };
  }

  if (!existsSync(coursesRoot) || !statSync(coursesRoot).isDirectory()) {
    return {
      ok: false,
      error: 'COURSES_ROOT_NOT_FOUND',
      message: `Configured coursesRoot does not exist or is not a directory: ${coursesRoot}`,
      fix: ['Re-run set_courses_root with a valid directory path'],
    };
  }

  try {
    const { url, port } = await startDashboardServer({ coursesRoot, port: input.port });
    const courseCount = walkForCourses(coursesRoot).length;
    return { ok: true, url, port, coursesRoot, courseCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/EADDRINUSE/.test(msg)) {
      return {
        ok: false,
        error: 'PORT_IN_USE',
        message: msg,
        fix: ['Try a different port, or stop the existing dashboard server'],
      };
    }
    throw err;
  }
}
