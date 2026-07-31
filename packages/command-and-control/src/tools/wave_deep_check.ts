import { waveDeepCheck } from '@canvas-toolchain/canvas-design-studio/dist/tools/a11y/wave.js';
import { loadWaveApiKey, saveWaveApiKey } from '@canvas-toolchain/canvas-design-studio/dist/tools/a11y/policy.js';

export interface WaveDeepCheckToolInput {
  url: string;
  /** Explicit spend approval — nothing runs (and no credits are spent) without it. */
  confirm?: boolean;
  /** WAVE API key; persisted to the institution config on first use. */
  apiKey?: string;
}

export interface WaveDeepCheckToolDeps {
  wave?: typeof waveDeepCheck;
  loadKey?: () => string | undefined;
  saveKey?: (key: string) => void;
}

export interface WaveDeepCheckToolResult {
  ok: boolean;
  text?: string;
  error?: string;
  message?: string;
  fix?: string[];
}

export async function waveDeepCheckTool(
  input: WaveDeepCheckToolInput,
  deps: WaveDeepCheckToolDeps = {},
): Promise<WaveDeepCheckToolResult> {
  const wave = deps.wave ?? waveDeepCheck;
  const loadKey = deps.loadKey ?? loadWaveApiKey;
  const saveKey = deps.saveKey ?? saveWaveApiKey;

  if (!input.confirm) {
    return {
      ok: true,
      text: [
        `WAVE deep check — preview (nothing has run, no credits spent)`,
        `URL: ${input.url}`,
        `Cost: ~2 credits (WAVE API reporttype 2).`,
        `Works on PUBLICLY visible pages only — the WAVE API cannot log into Canvas.`,
        `For login-gated pages use the free WAVE browser extension or MS Accessibility Insights instead.`,
        ``,
        `To spend the credits and run it, call wave_deep_check again with confirm: true.`,
      ].join('\n'),
    };
  }

  let key = input.apiKey;
  if (key) {
    try { saveKey(key); } catch { /* persistence is convenience; the run proceeds */ }
  } else {
    key = loadKey();
  }
  if (!key) {
    return {
      ok: false, error: 'NO_WAVE_API_KEY',
      message: 'No WAVE API key is configured.',
      fix: ['Get a key + credits at https://wave.webaim.org/api/', 'Re-call wave_deep_check with apiKey: "<your key>" — it is saved for next time.'],
    };
  }

  const result = await wave({ url: input.url, apiKey: key });
  if (result.error) {
    return { ok: false, error: result.error, message: result.message, fix: result.fix };
  }

  const lines = [
    `WAVE deep check — ${input.url}`,
    result.findings.length === 0 ? 'No WAVE-detected errors, contrast failures, or alerts.' :
      `Findings (${result.findings.length}):`,
    ...result.findings.map((f, i) => `${i + 1}. ${f.sc} ${f.scName} (${f.severity}): ${f.message}`),
  ];
  if (result.unmapped.length > 0) {
    lines.push('', `WAVE items without a WCAG mapping (review in the WAVE extension):`,
      ...result.unmapped.map(u => `- [${u.category}] ${u.description} (${u.count})`));
  }
  if (result.creditsRemaining !== undefined) lines.push('', `WAVE credits remaining: ${result.creditsRemaining}`);
  lines.push('', 'The professor is the final arbiter — fix, mark reviewed in accessibility_review_queue, or acknowledge at publish.');
  return { ok: true, text: lines.join('\n') };
}
