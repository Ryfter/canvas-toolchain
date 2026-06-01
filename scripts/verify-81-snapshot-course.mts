/**
 * #81 verification driver — runs snapshot_course against a real Canvas course
 * and writes the markdown to disk. Demonstrates first-run + re-run behavior.
 *
 * Usage:
 *   tsx scripts/verify-81-snapshot-course.mts <courseId> <outputPath>
 *   tsx scripts/verify-81-snapshot-course.mts 48894 D:/tmp/busapp-snapshot.md
 */
import { snapshotCourse } from '../packages/command-and-control/dist/tools/workflows/snapshot_course.js';

const [, , courseIdArg, outPath] = process.argv;
if (!courseIdArg || !outPath) {
  console.error('Usage: tsx scripts/verify-81-snapshot-course.mts <courseId> <outputPath>');
  process.exit(2);
}

const result = await snapshotCourse({
  courseId: Number(courseIdArg),
  outputPath: outPath,
});
console.log(JSON.stringify(result, null, 2));
