import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Interfaces matching registry resource types
export interface TemplateResource {
  manifest: {
    schemaVersion: number;
    kind: 'template';
    id: string;
    version: string;
    tier?: string;
    slots: string[];
    tags: string[];
    files: string[];
  };
  structureHtml: string;
  slotsJson: Record<string, { required: boolean; maxLength?: number }>;
}

export interface ThemeResource {
  manifest: {
    schemaVersion: number;
    kind: 'theme';
    id: string;
    version: string;
    compatibleSlots: string[];
    tags: string[];
    tier?: string;
    files: string[];
  };
  themeJson: {
    colors: Record<string, string>;
    typography?: Record<string, string>;
    slotStyles: Record<string, { css: string; imagePrompt: string }>;
    globalCss?: string;
    imageAssets?: Record<string, string | null>;
  };
}

export interface PromptSetResource {
  manifest: {
    schemaVersion: number;
    kind: 'prompt';
    id: string;
    version: string;
    slots: string[];
    tier?: string;
    files: string[];
  };
  promptsJson: Record<string, { prompt: string; outputSchema: any }>;
}

export interface BundleResource {
  manifest: {
    schemaVersion: number;
    kind: 'bundle';
    id: string;
    version: string;
    tier?: string;
    includes: { kind: string; id: string; version: string }[];
  };
}

/**
 * Gets the home directory for Command & Control config and data.
 */
export function getCcHomePath(): string {
  if (process.env.CC_HOME) {
    return process.env.CC_HOME;
  }
  return join(homedir(), '.command-and-control');
}

/**
 * Gets the root path for Command & Control registry resources.
 */
export function getRegistryRootPath(): string {
  return join(getCcHomePath(), 'registry');
}

/**
 * Gets the fallback seed registry directory packaged inside canvas-design-studio.
 */
export function getFallbackRootPath(): string {
  // Built files live in dist/utils/registry.js
  // Templates are located at templates/ relative to package root
  return resolve(__dirname, '..', '..', 'templates');
}

/**
 * Helper to sort and pick the latest version matching an ID from available folders.
 */
function getLatestVersion(dirs: string[], id: string): string | null {
  const prefix = `${id}@`;
  const matching = dirs
    .filter((d) => d.startsWith(prefix))
    .map((d) => d.slice(prefix.length));

  if (matching.length === 0) return null;

  matching.sort((a, b) => {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      if (aVal !== bVal) return bVal - aVal; // Descending
    }
    return b > a ? 1 : -1;
  });

  return matching[0];
}

/**
 * Resolves the directory path for a registry resource.
 * Checks the user registry directory first, then falls back to packaged seed resources.
 */
export function resolveResourcePath(kind: string, id: string, version?: string): string {
  const registryRoot = getRegistryRootPath();
  const fallbackRoot = getFallbackRootPath();

  // 1. Resolve version if not specified
  let targetVersion = version;
  if (!targetVersion) {
    const userKindDir = join(registryRoot, kind);
    const userDirs = existsSync(userKindDir) ? readdirSync(userKindDir) : [];
    let bestVersion = getLatestVersion(userDirs, id);

    if (!bestVersion) {
      const fallbackKindDir = join(fallbackRoot, kind);
      const fallbackDirs = existsSync(fallbackKindDir) ? readdirSync(fallbackKindDir) : [];
      bestVersion = getLatestVersion(fallbackDirs, id);
    }

    if (!bestVersion) {
      throw new Error(`Registry resource of kind '${kind}' with ID '${id}' not found in registry home or package fallback.`);
    }
    targetVersion = bestVersion;
  }

  // 2. Check CC_HOME path
  const userPath = join(registryRoot, kind, `${id}@${targetVersion}`);
  if (existsSync(userPath)) {
    return userPath;
  }

  // 3. Check fallback path
  const fallbackPath = join(fallbackRoot, kind, `${id}@${targetVersion}`);
  if (existsSync(fallbackPath)) {
    return fallbackPath;
  }

  throw new Error(`Registry resource of kind '${kind}' with ID '${id}' and version '${targetVersion}' not found.`);
}

/**
 * Loads a template resource from the registry.
 */
export function loadTemplate(id: string, version?: string): TemplateResource {
  const dir = resolveResourcePath('template', id, version);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8'));
  const structureHtml = readFileSync(join(dir, 'structure.html'), 'utf-8');
  const slotsJson = JSON.parse(readFileSync(join(dir, 'slots.json'), 'utf-8'));

  return { manifest, structureHtml, slotsJson };
}

/**
 * Loads a theme resource from the registry.
 */
export function loadTheme(id: string, version?: string): ThemeResource {
  const dir = resolveResourcePath('theme', id, version);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8'));
  const themeJson = JSON.parse(readFileSync(join(dir, 'theme.json'), 'utf-8'));

  return { manifest, themeJson };
}

/**
 * Loads a prompt set resource from the registry.
 */
export function loadPromptSet(id: string, version?: string): PromptSetResource {
  const dir = resolveResourcePath('prompt', id, version);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8'));
  const promptsJson = JSON.parse(readFileSync(join(dir, 'prompts.json'), 'utf-8'));

  return { manifest, promptsJson };
}

/**
 * Loads a bundle resource from the registry.
 */
export function loadBundle(id: string, version?: string): BundleResource {
  const dir = resolveResourcePath('bundle', id, version);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8'));

  return { manifest };
}
