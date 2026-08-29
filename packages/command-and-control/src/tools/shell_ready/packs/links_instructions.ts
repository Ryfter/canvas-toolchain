import type { ShellFinding, ShellResolvedWeek } from '../types.js';

const PLACEHOLDER_RE = /\b(TODO|TBD|lorem ipsum|CKEDITOR|HERO_IMAGE_URL)\b|\[.[^\]]*\]/i;

export async function probeLink(
  url: string,
  opts: { fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<'ok' | 'unreachable' | 'http_4xx' | 'http_5xx' | 'auth_wall'> {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetchFn(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetchFn(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    }
    if (res.status >= 500) return 'http_5xx';
    if (res.status === 401 || res.status === 403) return 'auth_wall';
    if (res.status >= 400) return 'http_4xx';
    return 'ok';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(tid);
  }
}

export function extractHrefs(html: string, canvasOrigin: string): string[] {
  const out: string[] = [];
  const re = /(?:href|src)=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1];
    if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('javascript:')) {
      if (raw?.startsWith('javascript:')) out.push(raw);
      continue;
    }
    try {
      const abs = new URL(raw, canvasOrigin).href;
      out.push(abs);
    } catch {
      /* skip */
    }
  }
  return out;
}

export async function runLinksPack(input: {
  week: ShellResolvedWeek;
  htmlBodies: Array<{ id: string; title: string; html: string }>;
  canvasOrigin: string;
  budget: number;
  fetchFn?: typeof fetch;
}): Promise<{ findings: ShellFinding[]; probed: number }> {
  const findings: ShellFinding[] = [];
  const seen = new Set<string>();
  let probed = 0;
  for (const body of input.htmlBodies) {
    for (const href of extractHrefs(body.html, input.canvasOrigin)) {
      if (href.startsWith('javascript:')) {
        findings.push({
          id: `js-link:${body.id}`,
          pack: 'links',
          severity: 'warning',
          message: `javascript: link in "${body.title}"`,
          weekRole: input.week.role,
          depth: input.week.depth,
          weekIndex: input.week.index,
          itemTitle: body.title,
          url: href,
        });
        continue;
      }
      if (seen.has(href)) continue;
      if (probed >= input.budget) {
        findings.push({
          id: `link-budget:${input.week.role}`,
          pack: 'links',
          severity: 'suggestion',
          message: `Link probe budget (${input.budget}) exceeded for ${input.week.role} week.`,
          weekRole: input.week.role,
          depth: input.week.depth,
          weekIndex: input.week.index,
        });
        return { findings, probed };
      }
      seen.add(href);
      probed += 1;
      const result = await probeLink(href, { fetchFn: input.fetchFn });
      if (result !== 'ok' && result !== 'auth_wall') {
        findings.push({
          id: `dead-link:${probed}:${input.week.index}`,
          pack: 'links',
          severity: 'warning',
          message: `Link ${result} for ${href} (from "${body.title}").`,
          weekRole: input.week.role,
          depth: input.week.depth,
          weekIndex: input.week.index,
          itemTitle: body.title,
          url: href,
        });
      }
    }
  }
  return { findings, probed };
}

export function runInstructionsPack(input: {
  week: ShellResolvedWeek;
  items: Array<{ id: number; title: string; body: string | null | undefined; points?: number | null }>;
}): ShellFinding[] {
  const out: ShellFinding[] = [];
  for (const item of input.items) {
    const body = (item.body ?? '').trim();
    if ((item.points ?? 0) > 0 && body.length === 0) {
      out.push({
        id: `empty-body:${item.id}`,
        pack: 'instructions',
        severity: 'warning',
        message: `"${item.title}" has points but empty description.`,
        weekRole: input.week.role,
        depth: input.week.depth,
        weekIndex: input.week.index,
        itemId: item.id,
        itemTitle: item.title,
      });
      continue;
    }
    if (body.length > 0 && body.length < 40) {
      out.push({
        id: `short-body:${item.id}`,
        pack: 'instructions',
        severity: input.week.depth === 'thorough' ? 'warning' : 'suggestion',
        message: `"${item.title}" description looks very short.`,
        weekRole: input.week.role,
        depth: input.week.depth,
        weekIndex: input.week.index,
        itemId: item.id,
        itemTitle: item.title,
      });
    }
    if (PLACEHOLDER_RE.test(body)) {
      out.push({
        id: `placeholder:${item.id}`,
        pack: 'instructions',
        severity: 'warning',
        message: `"${item.title}" still contains placeholder text (TODO/TBD/…).`,
        weekRole: input.week.role,
        depth: input.week.depth,
        weekIndex: input.week.index,
        itemId: item.id,
        itemTitle: item.title,
      });
    }
  }
  return out;
}
