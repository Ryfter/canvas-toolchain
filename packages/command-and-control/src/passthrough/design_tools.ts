import type { PassthroughTool } from './ci_tools.js';
import { importCourse } from 'canvas-design-mcp/dist/tools/import-course.js';
import { generateCourse } from 'canvas-design-mcp/dist/tools/generate-course.js';
import type { ImportCourseInput } from 'canvas-design-mcp/dist/tools/import-course.js';
import type { GenerateCourseInput } from 'canvas-design-mcp/dist/course-types.js';

const COURSE_PUBLISH_NOT_AVAILABLE = {
  error:
    'Course-wide publishing is not exposed as a single Canvas Design Studio tool yet. ' +
    'Use generate_course here, then publish reviewed pages with canvas-design-mcp/publish_to_canvas.',
};

export const DESIGN_TOOLS: PassthroughTool[] = [
  {
    name: 'import_course',
    taskCategory: 'none',
    description: '[canvas-design-mcp] Import a Canvas Backup archive into a Canvas Design Studio course folder.',
    inputSchema: {
      type: 'object',
      required: ['archivePath', 'outputDir'],
      properties: {
        archivePath: { type: 'string', description: 'Absolute path to a Canvas Backup archive folder.' },
        outputDir: { type: 'string', description: 'Canvas Design Studio course folder to create or update.' },
        weekNumber: { type: 'number', description: 'Optional. Import only one module/week.' },
        assignmentName: { type: 'string', description: 'Optional. Import one assignment by exact title.' },
      },
    },
    handler: (args) => importCourse(args as ImportCourseInput),
  },
  {
    name: 'generate_course',
    taskCategory: 'none',
    description: '[canvas-design-mcp] Generate Canvas-safe HTML for every page in a Canvas Design Studio course folder.',
    inputSchema: {
      type: 'object',
      properties: {
        courseDir: { type: 'string', description: 'Canvas Design Studio course folder. Defaults to ./course.' },
        outputDir: { type: 'string', description: 'Output folder for generated HTML. Defaults to <courseDir>/output.' },
      },
    },
    handler: (args) => generateCourse((args ?? {}) as GenerateCourseInput),
  },
  {
    name: 'publish_course',
    taskCategory: 'none',
    description: '[canvas-design-mcp] Placeholder for future course-wide publishing after reviewed page generation.',
    inputSchema: {
      type: 'object',
      required: ['courseId'],
      properties: {
        courseId: { type: 'string' },
      },
    },
    handler: () => COURSE_PUBLISH_NOT_AVAILABLE,
  },
];
