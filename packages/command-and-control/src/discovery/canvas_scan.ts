export interface InstitutionConfigLike {
  canvasUrl: string;
  apiToken: string;
}

export interface DetectedTool {
  rawName: string;
  courses?: string[]; // course names this tool was found in (per-course tier)
}

export interface ScanResult {
  tier: 'account' | 'course' | 'self-report';
  tools: DetectedTool[];
  gaps: string[];
}

interface ExternalTool {
  name?: string;
  domain?: string;
}
interface CourseRef {
  id: number;
  name?: string;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

/** Canvas paginates via the Link header; extract the rel="next" URL if present. */
function parseNextLink(linkHeader: string | null): string | undefined {
  if (!linkHeader) return undefined;
  const next = linkHeader.split(',').find((part) => part.includes('rel="next"'));
  return next?.match(/<([^>]+)>/)?.[1];
}

/**
 * Fetch a paginated Canvas array endpoint, following Link-header `next` until exhausted.
 * Returns the concatenated items, or ok:false on the first non-2xx / non-array page.
 * Hard page cap guards against a pathological/looping Link header.
 */
async function fetchArrayPaged(
  fetchFn: typeof fetch,
  firstUrl: string,
  token: string,
): Promise<{ ok: boolean; status: number; items: unknown[] }> {
  const items: unknown[] = [];
  let url: string | undefined = firstUrl;
  let status = 0;
  for (let page = 0; url && page < 50; page++) {
    const res: Response = await fetchFn(url, { headers: authHeaders(token) });
    status = res.status;
    if (!res.ok) return { ok: false, status, items };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    if (!Array.isArray(body)) return { ok: false, status, items };
    items.push(...body);
    url = parseNextLink(res.headers.get('link'));
  }
  return { ok: true, status, items };
}

function toolName(t: ExternalTool): string | undefined {
  return t.name ?? t.domain;
}

/** Best-effort cascade: account → per-course → self-report. Injected fetch for testing. */
export async function scanCanvasTools(cfg: InstitutionConfigLike, fetchFn: typeof fetch): Promise<ScanResult> {
  if (!cfg.apiToken || !cfg.canvasUrl) {
    return { tier: 'self-report', tools: [], gaps: [] };
  }
  const base = cfg.canvasUrl.replace(/\/+$/, '');
  const gaps: string[] = [];

  // Tier 1: account-level
  try {
    const acct = await fetchArrayPaged(
      fetchFn,
      `${base}/api/v1/accounts/self/external_tools?per_page=100`,
      cfg.apiToken,
    );
    if (acct.ok) {
      const tools = (acct.items as ExternalTool[])
        .map(toolName)
        .filter((n): n is string => !!n)
        .map((rawName) => ({ rawName }));
      return { tier: 'account', tools, gaps };
    }
    gaps.push(`Account-level tool listing unavailable (HTTP ${acct.status}); used per-course scan.`);
  } catch {
    gaps.push('Account-level tool listing failed; used per-course scan.');
  }

  // Tier 2: per-course
  let courses: CourseRef[] = [];
  try {
    const courseRes = await fetchArrayPaged(
      fetchFn,
      `${base}/api/v1/courses?enrollment_type=teacher&per_page=100`,
      cfg.apiToken,
    );
    if (courseRes.ok) {
      courses = courseRes.items as CourseRef[];
    } else {
      gaps.push(`Could not list courses (HTTP ${courseRes.status}); self-report only.`);
      return { tier: 'self-report', tools: [], gaps };
    }
  } catch {
    gaps.push('Could not list courses; self-report only.');
    return { tier: 'self-report', tools: [], gaps };
  }

  const byName = new Map<string, Set<string>>(); // rawName → set of course names
  for (const c of courses) {
    const courseLabel = c.name ?? `course ${c.id}`;
    try {
      const r = await fetchArrayPaged(
        fetchFn,
        `${base}/api/v1/courses/${c.id}/external_tools?per_page=100`,
        cfg.apiToken,
      );
      if (!r.ok) {
        gaps.push(`Could not read tools for ${courseLabel} (HTTP ${r.status}).`);
        continue;
      }
      for (const t of r.items as ExternalTool[]) {
        const n = toolName(t);
        if (!n) continue;
        if (!byName.has(n)) byName.set(n, new Set());
        byName.get(n)!.add(courseLabel);
      }
    } catch {
      gaps.push(`Could not read tools for ${courseLabel}.`);
    }
  }

  const tools: DetectedTool[] = [...byName.entries()].map(([rawName, set]) => ({
    rawName,
    courses: [...set],
  }));
  return { tier: 'course', tools, gaps };
}
