import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { AiasLevel } from '@canvas-toolchain/shared-types';

const FM_PATTERN = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function isAiasLevel(v: unknown): v is AiasLevel {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}

export interface AiasDefaults {
  level?: AiasLevel;
  note?: string;
}

function readFm(filePath: string): { fm: Record<string, unknown>; body: string } {
  const raw = readFileSync(filePath, 'utf-8');
  const m = raw.match(FM_PATTERN);
  if (!m) return { fm: {}, body: raw };
  let fm: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(m[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      fm = parsed as Record<string, unknown>;
    }
  } catch {}
  return { fm, body: m[2] };
}

export function readAiasDefaults(courseConfigPath: string): AiasDefaults {
  const { fm } = readFm(courseConfigPath);
  const level = isAiasLevel(fm.defaultAiasLevel) ? fm.defaultAiasLevel : undefined;
  const note = typeof fm.defaultAiasNote === 'string' && fm.defaultAiasNote.length > 0
    ? fm.defaultAiasNote
    : undefined;
  return { level, note };
}

export function writeAiasDefaults(courseConfigPath: string, level: AiasLevel, note?: string): void {
  const { fm, body } = readFm(courseConfigPath);
  const merged: Record<string, unknown> = { ...fm, defaultAiasLevel: level };
  if (note !== undefined && note.length > 0) {
    merged.defaultAiasNote = note;
  } else {
    delete merged.defaultAiasNote;
  }
  const fmYaml = stringifyYaml(merged).trimEnd();
  const output = `---\n${fmYaml}\n---\n${body.startsWith('\n') ? body : '\n' + body}`;

  const tmp = `${courseConfigPath}.tmp`;
  writeFileSync(tmp, output, 'utf-8');
  renameSync(tmp, courseConfigPath);
}
