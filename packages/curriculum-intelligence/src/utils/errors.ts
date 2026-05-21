/**
 * Structured error formatter. Mirrors Canvas Design Studio's error shape so
 * users get the same look-and-feel across both apps.
 */
export interface StructuredError {
  title: string;
  message: string;
  cause?: string;
  fix?: string[];
  context?: string;
}

export function formatError(err: StructuredError): string {
  const lines: string[] = [];
  lines.push(`# ${err.title}`);
  lines.push('');
  lines.push(err.message);
  if (err.cause) {
    lines.push('');
    lines.push(`**Cause:** ${err.cause}`);
  }
  if (err.fix && err.fix.length > 0) {
    lines.push('');
    lines.push('**Fix:**');
    for (const step of err.fix) {
      lines.push(`- ${step}`);
    }
  }
  if (err.context) {
    lines.push('');
    lines.push(`**Context:** ${err.context}`);
  }
  return lines.join('\n');
}
