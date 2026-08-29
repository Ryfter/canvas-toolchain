import type { PassthroughTool } from './ci_tools.js';
import { importCourse } from '@canvas-toolchain/canvas-design-studio/dist/tools/import-course.js';
import { generateCourse } from '@canvas-toolchain/canvas-design-studio/dist/tools/generate-course.js';
import type { ImportCourseInput } from '@canvas-toolchain/canvas-design-studio/dist/tools/import-course.js';
import type { GenerateCourseInput } from '@canvas-toolchain/canvas-design-studio/dist/course-types.js';

export const DESIGN_TOOLS: PassthroughTool[] = [
  {
    name: 'import_course',
    taskCategory: 'none',
    handler: (args) => importCourse(args as ImportCourseInput),
  },
  {
    name: 'generate_course',
    taskCategory: 'none',
    handler: (args) => generateCourse((args ?? {}) as GenerateCourseInput),
  },
];
