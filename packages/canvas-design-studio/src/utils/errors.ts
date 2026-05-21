export interface ErrorParams {
  title: string;
  message: string;
  cause: string;
  fix: string[];
  context: string;
}

export function makeHelpUrl(context: string): string {
  const encoded = encodeURIComponent(`Canvas Design Studio error: ${context}`);
  return `https://chatgpt.com/?q=${encoded}`;
}

export function formatError(params: ErrorParams): string {
  const fixLines = params.fix.map((step, i) => `  ${i + 1}. ${step}`).join('\n');
  const helpUrl = makeHelpUrl(params.context);
  return [
    `❌ ${params.title}`,
    '',
    params.message,
    '',
    `Cause: ${params.cause}`,
    '',
    'Fix:',
    fixLines,
    '',
    `▶ Get help: ${helpUrl}`,
    '(Opens ChatGPT with this error pre-filled. Copy the prompt to use with any AI assistant.)',
  ].join('\n');
}
