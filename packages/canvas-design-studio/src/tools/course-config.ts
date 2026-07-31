import { readFileSync } from 'node:fs';
import Color from 'color';
import type { CourseConfig, CourseColors, PageType, WeekEntry } from '../course-types.js';
import { PAGE_TYPES } from '../course-types.js';
import { loadConfig } from '../config.js';

export const COURSE_CONFIG_FILENAME = 'course-config.md';

function deriveColors(primary: string): Pick<CourseColors, 'primaryDark' | 'primaryLight'> {
  const c = Color(primary);
  return {
    primaryDark: c.darken(0.25).hex(),
    primaryLight: c.lightness(93).hex(),
  };
}

function parseFrontMatterYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }

    const kvMatch = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kvMatch) { i++; continue; }

    const key = kvMatch[1];
    const rawVal = kvMatch[2].trim();

    if (rawVal === '') {
      const nested: Record<string, string> = {};
      const list: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        const listItem = next.match(/^  - (.+)$/);
        const nestedKv = next.match(/^  ([a-z_-]+):\s*(.*)$/);
        if (listItem) {
          list.push(listItem[1].trim());
          i++;
        } else if (nestedKv) {
          nested[nestedKv[1]] = nestedKv[2].replace(/^["']|["']$/g, '');
          i++;
        } else {
          break;
        }
      }
      result[key] = list.length > 0 ? list : nested;
      continue;
    }

    if (rawVal === 'true')  { result[key] = true;  i++; continue; }
    if (rawVal === 'false') { result[key] = false; i++; continue; }
    if (/^\d+$/.test(rawVal)) { result[key] = parseInt(rawVal, 10); i++; continue; }
    result[key] = rawVal.replace(/^["']|["']$/g, '');
    i++;
  }

  return result;
}

function parseWeekOutlineTable(body: string): WeekEntry[] {
  const rows: WeekEntry[] = [];
  const rowRegex = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm;
  let match;
  while ((match = rowRegex.exec(body)) !== null) {
    const weekNum = parseInt(match[1], 10);
    rows.push({
      week: weekNum,
      weekStr: String(weekNum).padStart(2, '0'),
      title: match[2].trim(),
      topic: match[3].trim(),
    });
  }
  return rows;
}

const FALLBACK_COLORS: CourseColors = {
  primary: '#0033A0',
  primaryDark: '#002277',
  primaryLight: '#E6ECF9',
  secondary: '#D64309',
};

function loadInstitutionColors(): CourseColors {
  try {
    const instConfig = loadConfig();
    const c = instConfig.colors as { primary: string; primaryDark: string; primaryLight: string; secondary: string };
    return {
      primary: c.primary ?? FALLBACK_COLORS.primary,
      primaryDark: c.primaryDark ?? FALLBACK_COLORS.primaryDark,
      primaryLight: c.primaryLight ?? FALLBACK_COLORS.primaryLight,
      secondary: c.secondary ?? FALLBACK_COLORS.secondary,
    };
  } catch {
    return FALLBACK_COLORS;
  }
}

export function parseCourseConfig(filePath: string): CourseConfig {
  const content = readFileSync(filePath, 'utf-8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) throw new Error(`No YAML front matter found in ${filePath}`);

  const fm = parseFrontMatterYaml(fmMatch[1]);
  const body = fmMatch[2];

  const inst = loadInstitutionColors();
  const colorBlock = (fm.colors ?? {}) as Record<string, string>;
  const primaryOverride = colorBlock.primary?.trim();
  const secondaryOverride = colorBlock.secondary?.trim();

  const primary = primaryOverride || inst.primary;
  const secondary = secondaryOverride || inst.secondary;
  const { primaryDark, primaryLight } = primaryOverride
    ? deriveColors(primaryOverride)
    : { primaryDark: inst.primaryDark, primaryLight: inst.primaryLight };

  const colors: CourseColors = { primary, primaryDark, primaryLight, secondary };

  const rawPageTypes = Array.isArray(fm.page_types) ? (fm.page_types as string[]) : [];
  const pageTypes = rawPageTypes.filter((t): t is PageType => (PAGE_TYPES as readonly string[]).includes(t));

  const heroImages = ((fm.hero_images ?? {}) as Record<string, string>) as Partial<Record<PageType, string>>;
  const weekOutline = parseWeekOutlineTable(body);

  return {
    institution: String(fm.institution ?? ''),
    courseName: String(fm.course_name ?? ''),
    courseNumber: String(fm.course_number ?? ''),
    professor: String(fm.professor ?? ''),
    semester: String(fm.semester ?? ''),
    weeks: typeof fm.weeks === 'number' ? fm.weeks : parseInt(String(fm.weeks ?? '16'), 10),
    pageTypes,
    layoutFixed: fm.layout_fixed !== false,
    colors,
    heroImages,
    weekOutline,
    oralAssessmentLaunchDomain:
      typeof fm.oral_assessment_launch_domain === 'string' && fm.oral_assessment_launch_domain.trim()
        ? String(fm.oral_assessment_launch_domain).trim()
        : undefined,
  };
}
