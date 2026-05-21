import { extractColors, suggestColors } from '../utils/color-extraction.js';
import { formatError } from '../utils/errors.js';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_STYLESHEETS = 5;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractInlineStyles(html: string): string {
  const parts: string[] = [];
  const regex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    parts.push(m[1]);
  }
  return parts.join('\n');
}

function extractStylesheetLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const linkTagRegex = /<link[^>]+>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = linkTagRegex.exec(html)) !== null) {
    const tagStr = tag[0];
    if (/rel=["']stylesheet["']/i.test(tagStr)) {
      const hrefMatch = /href=["']([^"']+)["']/i.exec(tagStr);
      if (hrefMatch) {
        try {
          links.push(new URL(hrefMatch[1], baseUrl).href);
        } catch {
          // Skip unparseable hrefs
        }
      }
    }
  }
  return links.slice(0, MAX_STYLESHEETS);
}

function brandUrlError(url: string, cause: string): string {
  return formatError({
    title: 'Canvas Design Studio — Brand URL Unreachable',
    message: `Could not fetch ${url}.`,
    cause,
    fix: [
      'Confirm the URL is correct and publicly accessible',
      'Try opening it in a browser to verify',
      'If the page requires login, copy the hex values manually',
    ],
    context: 'fetch_brand_colors unreachable URL',
  });
}

export async function fetchBrandColors(url: string): Promise<string> {
  if (!url.startsWith('https://')) {
    return brandUrlError(url, 'URL must start with https://');
  }

  let html: string;
  try {
    const resp = await fetchWithTimeout(url);
    html = await resp.text();
  } catch (err) {
    return brandUrlError(url, err instanceof Error ? err.message : String(err));
  }

  const hostname = new URL(url).hostname;
  const inlineCSS = extractInlineStyles(html);
  const stylesheetLinks = extractStylesheetLinks(html, url);

  const stylesheetTexts = await Promise.all(
    stylesheetLinks.map(async (href) => {
      try {
        const resp = await fetchWithTimeout(href);
        return await resp.text();
      } catch {
        return '';
      }
    }),
  );

  const allCSS = [inlineCSS, ...stylesheetTexts].join('\n');
  const colors = extractColors(allCSS);

  if (colors.length === 0) {
    return [
      `No hex colors found at ${url}.`,
      '',
      'The page may load colors via JavaScript or a CDN that requires a browser to render.',
      'Try opening the URL manually and copying hex values from the brand guidelines.',
    ].join('\n');
  }

  const suggestion = suggestColors(colors);
  const lines: string[] = [`## Brand Colors — ${hostname}`, ''];

  if (suggestion) {
    const primaryLabel =
      suggestion.source === 'css-variables' && suggestion.primary.cssVar
        ? `${suggestion.primary.cssVar}, ${suggestion.primary.count} uses`
        : `frequency ranking, ${suggestion.primary.count} uses`;
    lines.push(`Suggested primary:   ${suggestion.primary.hex}  (${primaryLabel})`);

    if (suggestion.secondary) {
      const secondaryLabel =
        suggestion.source === 'css-variables' && suggestion.secondary.cssVar
          ? `${suggestion.secondary.cssVar}, ${suggestion.secondary.count} uses`
          : `frequency ranking, ${suggestion.secondary.count} uses`;
      lines.push(`Suggested secondary: ${suggestion.secondary.hex}  (${secondaryLabel})`);
    } else {
      lines.push(
        'No distinct secondary color found — all non-structural colors are similar hues.',
      );
    }
  }

  lines.push('', 'Full color list:');
  for (const c of colors) {
    const varPart = c.cssVar ? `   ${c.cssVar}` : '';
    const structPart = c.structural ? '   (structural)' : '';
    lines.push(`  ${c.hex}  ${String(c.count).padStart(2)} uses${varPart}${structPart}`);
  }

  const primaryHex = suggestion?.primary.hex ?? '…';
  const secondaryHex = suggestion?.secondary?.hex ?? '…';
  lines.push('');
  lines.push('To apply: run setup_institution and enter these hex values when prompted,');
  lines.push(`or say "set primary to ${primaryHex} and secondary to ${secondaryHex}".`);

  return lines.join('\n');
}
