import { type SlotName, validateSlotName } from './slots.js';

export interface ThemeManifest {
  schemaVersion: 1;
  kind: 'theme';
  id: string;
  version: string;
  compatibleSlots: SlotName[];
  tags: string[];
  tier: 'free' | 'premium';
}

export interface ThemeSlotStyle {
  css: string;
  imagePrompt: string;
}

export interface ThemeJson {
  colors: Record<string, string>;
  typography?: Record<string, string>;
  slotStyles: Record<string, ThemeSlotStyle>;
  globalCss?: string;
  imageAssets?: Record<string, string | null>;
}

export interface ThemeResource {
  manifest: ThemeManifest;
  themeJson: ThemeJson;
}

export function validateThemeResource(resource: ThemeResource): string[] {
  const issues: string[] = [];
  validateThemeManifest(resource.manifest, issues);
  validateThemeJson(resource.themeJson, resource.manifest.compatibleSlots ?? [], issues);
  return issues;
}

export function validateThemeManifest(value: unknown, issues: string[] = []): string[] {
  if (!isRecord(value)) {
    issues.push('manifest must be an object');
    return issues;
  }

  if (value.schemaVersion !== 1) issues.push('manifest.schemaVersion must be 1');
  if (value.kind !== 'theme') issues.push('manifest.kind must be theme');
  validateSegment(value.id, 'manifest.id', issues);
  validateVersion(value.version, 'manifest.version', issues);

  if (!Array.isArray(value.compatibleSlots) || value.compatibleSlots.length === 0) {
    issues.push('manifest.compatibleSlots must be a non-empty array');
  } else {
    value.compatibleSlots.forEach((slot, index) => validateSlotName(slot, `manifest.compatibleSlots[${index}]`, issues));
  }

  if (!Array.isArray(value.tags)) {
    issues.push('manifest.tags must be an array');
  } else {
    value.tags.forEach((tag, index) => {
      if (typeof tag !== 'string' || tag.trim() === '') issues.push(`manifest.tags[${index}] must be a non-empty string`);
    });
  }

  if (value.tier !== 'free' && value.tier !== 'premium') {
    issues.push('manifest.tier must be free or premium');
  }

  return issues;
}

function validateThemeJson(value: unknown, compatibleSlots: SlotName[], issues: string[]): void {
  if (!isRecord(value)) {
    issues.push('theme.json must be an object');
    return;
  }

  validateColors(value.colors, issues);
  validateStringMap(value.typography, 'theme.json.typography', issues, true);

  if (!isRecord(value.slotStyles) || Object.keys(value.slotStyles).length === 0) {
    issues.push('theme.json.slotStyles must be a non-empty object');
  } else {
    validateSlotStyles(value.slotStyles, compatibleSlots, isRecord(value.colors) ? value.colors : {}, issues);
  }

  if (value.globalCss !== undefined && typeof value.globalCss !== 'string') {
    issues.push('theme.json.globalCss must be a string when provided');
  }

  if (value.imageAssets !== undefined) {
    validateImageAssets(value.imageAssets, compatibleSlots, issues);
  }
}

function validateColors(value: unknown, issues: string[]): void {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    issues.push('theme.json.colors must be a non-empty object');
    return;
  }

  for (const [key, color] of Object.entries(value)) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(key)) issues.push(`theme.json.colors.${key} must use a camelCase key`);
    if (typeof color !== 'string' || color.trim() === '') issues.push(`theme.json.colors.${key} must be a non-empty string`);
  }
}

function validateSlotStyles(
  value: Record<string, unknown>,
  compatibleSlots: SlotName[],
  colors: Record<string, unknown>,
  issues: string[],
): void {
  const compatibleSlotSet = new Set<string>(compatibleSlots);

  for (const [slot, style] of Object.entries(value)) {
    validateSlotName(slot, `theme.json.slotStyles key ${slot}`, issues);
    if (!compatibleSlotSet.has(slot)) {
      issues.push(`theme.json.slotStyles key ${slot} must be declared in manifest.compatibleSlots`);
    }

    if (!isRecord(style)) {
      issues.push(`theme.json.slotStyles.${slot} must be an object`);
      continue;
    }

    if (typeof style.css !== 'string' || style.css.trim() === '') {
      issues.push(`theme.json.slotStyles.${slot}.css must be a non-empty string`);
    }

    if (typeof style.imagePrompt !== 'string' || style.imagePrompt.trim() === '') {
      issues.push(`theme.json.slotStyles.${slot}.imagePrompt must be a non-empty string`);
    } else {
      validateImagePrompt(style.imagePrompt, colors, `theme.json.slotStyles.${slot}.imagePrompt`, issues);
    }
  }
}

function validateImagePrompt(prompt: string, colors: Record<string, unknown>, field: string, issues: string[]): void {
  for (const match of prompt.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)) {
    const placeholder = match[1] ?? '';
    if (placeholder === 'topic' || placeholder === 'semester') continue;

    if (placeholder.startsWith('colors.')) {
      const colorName = placeholder.slice('colors.'.length);
      if (typeof colors[colorName] !== 'string') {
        issues.push(`${field} references unknown color ${placeholder}`);
      }
      continue;
    }

    issues.push(`${field} contains unsupported placeholder ${placeholder}`);
  }
}

function validateImageAssets(value: unknown, compatibleSlots: SlotName[], issues: string[]): void {
  if (!isRecord(value)) {
    issues.push('theme.json.imageAssets must be an object when provided');
    return;
  }

  const compatibleSlotSet = new Set<string>(compatibleSlots);
  for (const [slot, assetPath] of Object.entries(value)) {
    validateSlotName(slot, `theme.json.imageAssets key ${slot}`, issues);
    if (!compatibleSlotSet.has(slot)) {
      issues.push(`theme.json.imageAssets key ${slot} must be declared in manifest.compatibleSlots`);
    }

    if (assetPath !== null && (typeof assetPath !== 'string' || assetPath.trim() === '' || assetPath.includes('..') || assetPath.startsWith('/') || /^[a-zA-Z]:/.test(assetPath))) {
      issues.push(`theme.json.imageAssets.${slot} must be a safe relative asset path`);
    }
  }
}

function validateStringMap(value: unknown, field: string, issues: string[], optional = false): void {
  if (value === undefined && optional) return;
  if (!isRecord(value)) {
    issues.push(`${field} must be an object`);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string' || item.trim() === '') issues.push(`${field}.${key} must be a non-empty string`);
  }
}

function validateSegment(value: unknown, field: string, issues: string[]): void {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
    issues.push(`${field} must be a safe registry segment`);
  }
}

function validateVersion(value: unknown, field: string, issues: string[]): void {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(value)) {
    issues.push(`${field} must be a safe version`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
