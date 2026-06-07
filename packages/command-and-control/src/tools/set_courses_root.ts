import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, saveConfig, getCcHomePath } from '../kb/config.js';

export interface SetCoursesRootInput {
  coursesRoot: string;
}

export type SetCoursesRootResult =
  | { ok: true; coursesRoot: string; configPath: string }
  | { ok: false; error: 'PATH_NOT_FOUND' | 'NOT_A_DIRECTORY'; message: string; fix: string[] };

export async function setCoursesRoot(input: SetCoursesRootInput): Promise<SetCoursesRootResult> {
  if (!existsSync(input.coursesRoot)) {
    return {
      ok: false,
      error: 'PATH_NOT_FOUND',
      message: `Path does not exist: ${input.coursesRoot}`,
      fix: ['Check that the path exists and re-run with the correct absolute path'],
    };
  }
  const st = statSync(input.coursesRoot);
  if (!st.isDirectory()) {
    return {
      ok: false,
      error: 'NOT_A_DIRECTORY',
      message: `Path is not a directory: ${input.coursesRoot}`,
      fix: ['Provide a folder path, not a file path'],
    };
  }

  const config = loadConfig();
  config.coursesRoot = input.coursesRoot;
  saveConfig(config);

  const configPath = join(getCcHomePath(), 'config.json');

  return {
    ok: true,
    coursesRoot: input.coursesRoot,
    configPath,
  };
}
