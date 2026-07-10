import type { AccessibilityFinding, FindingSeverity } from '@canvas-toolchain/shared-types';

export interface WaveDeepCheckInput {
  url: string;
  apiKey: string;
  /** Injectable for tests. Production uses global fetch (Node >= 20). */
  fetchFn?: typeof fetch;
}

export interface WaveDeepCheckResult {
  url: string;
  findings: AccessibilityFinding[];
  unmapped: Array<{ id: string; description: string; count: number; category: string }>;
  creditsRemaining?: number;
  error?: string;
  message?: string;
  fix?: string[];
}

/** WAVE item id → canonical SC. Small and honest: only ids with a clear SC mapping;
 *  anything else lands in `unmapped` rather than fabricating a criterion. */
const WAVE_ID_SC: Record<string, { sc: string; scName: string; severity: FindingSeverity }> = {
  alt_missing:      { sc: '1.1.1', scName: 'Non-text Content', severity: 'critical' },
  alt_link_missing: { sc: '1.1.1', scName: 'Non-text Content', severity: 'serious' },
  alt_input_missing:{ sc: '1.1.1', scName: 'Non-text Content', severity: 'serious' },
  label_missing:    { sc: '3.3.2', scName: 'Labels or Instructions', severity: 'serious' },
  button_empty:     { sc: '4.1.2', scName: 'Name, Role, Value', severity: 'serious' },
  link_empty:       { sc: '2.4.4', scName: 'Link Purpose (In Context)', severity: 'serious' },
  title_invalid:    { sc: '2.4.2', scName: 'Page Titled', severity: 'serious' },
  language_missing: { sc: '3.1.1', scName: 'Language of Page', severity: 'serious' },
  heading_empty:    { sc: '1.3.1', scName: 'Info and Relationships', severity: 'serious' },
  heading_skipped:  { sc: '1.3.1', scName: 'Info and Relationships', severity: 'moderate' },
  contrast:         { sc: '1.4.3', scName: 'Contrast (Minimum)', severity: 'serious' },
  link_suspicious:  { sc: '2.4.4', scName: 'Link Purpose (In Context)', severity: 'moderate' },
  table_layout:     { sc: '1.3.1', scName: 'Info and Relationships', severity: 'moderate' },
};

interface WaveItem { id: string; description: string; count: number; }
interface WaveResponse {
  status: { success: boolean; error?: string; creditsremaining?: number };
  categories?: Record<string, { count: number; items?: Record<string, WaveItem> }>;
}

const MAPPED_CATEGORIES = ['error', 'contrast', 'alert'] as const;

export async function waveDeepCheck(input: WaveDeepCheckInput): Promise<WaveDeepCheckResult> {
  const fetchFn = input.fetchFn ?? fetch;
  const base: WaveDeepCheckResult = { url: input.url, findings: [], unmapped: [] };

  // Pre-flight (spec §4): the WAVE API fetches by public URL and cannot log into
  // Canvas. Refuse auth-gated URLs BEFORE the API call so no credit is wasted.
  try {
    const probe = await fetchFn(input.url, { redirect: 'manual' });
    const location = probe.headers.get('location') ?? '';
    if (probe.status === 401 || probe.status === 403 ||
        (probe.status >= 300 && probe.status < 400 && /login/i.test(location))) {
      return {
        ...base, error: 'AUTH_GATED_URL',
        message: `This URL requires a login (${probe.status}${location ? ` → ${location}` : ''}). The WAVE API cannot log into Canvas, so running it here would waste credits without producing a result.`,
        fix: [
          'Open the page in your own browser (already logged in) and run the free WAVE browser extension — same WebAIM engine.',
          'Or use MS Accessibility Insights for Web (free): https://accessibilityinsights.io/downloads/',
          'The paid WAVE API works on publicly-visible pages only.',
        ],
      };
    }
  } catch (e) {
    return { ...base, error: 'WAVE_UNREACHABLE', message: e instanceof Error ? e.message : String(e),
      fix: ['Check the URL and your network connection, then retry.'] };
  }

  let body: WaveResponse;
  try {
    const api = `https://wave.webaim.org/api/request?key=${encodeURIComponent(input.apiKey)}&url=${encodeURIComponent(input.url)}&reporttype=2`;
    const res = await fetchFn(api);
    body = await res.json() as WaveResponse;
  } catch (e) {
    return { ...base, error: 'WAVE_UNREACHABLE', message: e instanceof Error ? e.message : String(e),
      fix: ['Check your network connection, then retry.'] };
  }

  if (!body.status?.success) {
    return { ...base, error: 'WAVE_API_ERROR', message: body.status?.error ?? 'WAVE returned an unsuccessful status.',
      fix: ['Verify the WAVE API key (https://wave.webaim.org/api/) and remaining credits, then retry.'] };
  }

  const findings: AccessibilityFinding[] = [];
  const unmapped: WaveDeepCheckResult['unmapped'] = [];
  for (const category of MAPPED_CATEGORIES) {
    const items = body.categories?.[category]?.items ?? {};
    for (const item of Object.values(items)) {
      const mapped = WAVE_ID_SC[item.id];
      if (!mapped) { unmapped.push({ ...item, category }); continue; }
      findings.push({
        sc: mapped.sc, scName: mapped.scName, scVersion: '2.0', level: 'AA',
        severity: mapped.severity, engine: 'wave',
        message: `${item.description} (${item.count} instance${item.count === 1 ? '' : 's'}, WAVE ${category})`,
      });
    }
  }

  return { ...base, findings, unmapped, creditsRemaining: body.status.creditsremaining };
}
