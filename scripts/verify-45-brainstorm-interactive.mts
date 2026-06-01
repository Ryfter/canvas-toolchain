/**
 * #45 verification driver — calls brainstorm_interactive with a real
 * Anthropic API key and prints the proposed widget concepts. Requires
 * setup_anthropic to have been run.
 *
 * Usage:
 *   tsx scripts/verify-45-brainstorm-interactive.mts "<topic>" "<learning goal>" [--count N] [--audience "tag1,tag2"]
 *
 * Example:
 *   tsx scripts/verify-45-brainstorm-interactive.mts \
 *     "Choosing between VLOOKUP and XLOOKUP" \
 *     "Students can pick the right function for a given task" \
 *     --count 3 --audience "undergraduate,Excel-beginner"
 */
import { brainstormInteractive } from '../packages/command-and-control/dist/tools/workflows/brainstorm_interactive.js';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: tsx scripts/verify-45-brainstorm-interactive.mts "<topic>" "<learning goal>" [--count N] [--audience "tag1,tag2"]');
  process.exit(2);
}
const topic = args[0];
const learningGoal = args[1];
let count: number | undefined;
let audienceTags: string[] | undefined;

for (let i = 2; i < args.length; i += 2) {
  const flag = args[i]; const val = args[i + 1];
  if (flag === '--count')         count = Number(val);
  else if (flag === '--audience') audienceTags = val.split(',').map(s => s.trim());
}

const result = await brainstormInteractive({ topic, learningGoal, count, audienceTags });
console.log(JSON.stringify(result, null, 2));
