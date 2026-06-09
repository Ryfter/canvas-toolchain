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

async function getJson(
  fetchFn: typeof fetch,
  url: string,
  token: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetchFn(url, { headers: authHeaders(token) });
  let body: unknown = undefined;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  return { ok: res.ok, status: res.status, body };
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
    const acct = await getJson(fetchFn, `${base}/api/v1/accounts/self/external_tools?per_page=100`, cfg.apiToken);
    if (acct.ok && Array.isArray(acct.body)) {
      const tools = (acct.body as ExternalTool[])
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
    const courseRes = await getJson(
      fetchFn,
      `${base}/api/v1/courses?enrollment_type=teacher&per_page=100`,
      cfg.apiToken,
    );
    if (courseRes.ok && Array.isArray(courseRes.body)) {
      courses = courseRes.body as CourseRef[];
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
      const r = await getJson(fetchFn, `${base}/api/v1/courses/${c.id}/external_tools?per_page=100`, cfg.apiToken);
      if (!r.ok || !Array.isArray(r.body)) {
        gaps.push(`Could not read tools for ${courseLabel} (HTTP ${r.status}).`);
        continue;
      }
      for (const t of r.body as ExternalTool[]) {
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
