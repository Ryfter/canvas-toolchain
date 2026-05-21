import { parseWorksheet, validateWorksheet } from '../utils/worksheet.js';
import type { WizardDefaults } from '../utils/worksheet.js';

export function formatWorksheetErrors(errors: string[]): string {
  return [
    `❌ Worksheet has ${errors.length} error(s). Fix these before running setup_institution:`,
    '',
    ...errors.map((e, i) => `  ${i + 1}. ${e}`),
    '',
    'Fix these values in your worksheet and re-run validate_worksheet or setup_institution.',
  ].join('\n');
}

export function validateWorksheetTool(worksheetContent: string): string {
  const defaults = parseWorksheet(worksheetContent);
  const errors = validateWorksheet(defaults);

  if (errors.length > 0) {
    return formatWorksheetErrors(errors);
  }

  const count = countParsedFields(defaults);
  return `✓ Worksheet valid — ${count} field(s) parsed. Run setup_institution to apply.`;
}

function countParsedFields(defaults: WizardDefaults): number {
  const { philosophyAnswers, ...rest } = defaults;
  let count = Object.values(rest).filter(v => v !== undefined).length;
  if (philosophyAnswers !== undefined) count += 1;
  return count;
}
