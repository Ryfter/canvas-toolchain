import { importCourse } from "../packages/canvas-design-studio/dist/tools/import-course.js";
const r = importCourse({
  archivePath: process.argv[2],
  outputDir:   process.argv[3],
  preserveOriginalHtml: true,
});
console.log(JSON.stringify(r, null, 2));
