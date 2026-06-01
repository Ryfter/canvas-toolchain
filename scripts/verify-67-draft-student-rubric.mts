/**
 * #67 Part B verification driver — calls draft_student_rubric against a real
 * faculty rubric and writes the resulting markdown to disk. Requires
 * setup_anthropic to have been run.
 *
 * Usage:
 *   tsx scripts/verify-67-draft-student-rubric.mts <faculty-rubric-file> <output.md> [--brief brief.txt] [--context "ITM 105 freshman"]
 *
 * Example:
 *   tsx scripts/verify-67-draft-student-rubric.mts ./old-rubric.txt ./output/week-05/rubric.md \
 *     --brief ./assignment-brief.md \
 *     --context "BusApp 105, Summer 2026, freshman/sophomore Excel intro"
 */
import { readFileSync } from 'node:fs';
import { draftStudentRubric } from '../packages/command-and-control/dist/tools/workflows/draft_student_rubric.js';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: tsx scripts/verify-67-draft-student-rubric.mts <faculty-rubric-file> <output.md> [--brief brief.txt] [--context "..."] [--week N] [--points N] [--assignment N.N]');
  process.exit(2);
}
const facultyPath = args[0];
const outputPath = args[1];
let assignmentBrief: string | undefined;
let courseContext: string | undefined;
let week: number | undefined;
let totalPoints: number | undefined;
let assignmentNumber: string | undefined;

for (let i = 2; i < args.length; i += 2) {
  const flag = args[i]; const val = args[i + 1];
  if (flag === '--brief')      assignmentBrief = readFileSync(val, 'utf-8');
  else if (flag === '--context') courseContext = val;
  else if (flag === '--week')    week = Number(val);
  else if (flag === '--points')  totalPoints = Number(val);
  else if (flag === '--assignment') assignmentNumber = val;
}

const facultyRubricText = readFileSync(facultyPath, 'utf-8');
const result = await draftStudentRubric({
  facultyRubricText, assignmentBrief, courseContext,
  outputPath, week, totalPoints, assignmentNumber,
});
console.log(JSON.stringify(result, null, 2));
