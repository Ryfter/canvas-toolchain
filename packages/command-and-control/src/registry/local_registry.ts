import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

export const REGISTRY_SCHEMA_VERSION = 1 as const;

export const RESOURCE_KINDS = ['template', 'theme', 'prompt', 'adapter-config', 'bundle'] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export interface ResourceDependency {
  kind: ResourceKind;
  id: string;
  version?: string;
  minVersion?: string;
}

export interface ResourceManifest {
  schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  kind: ResourceKind;
  id: string;
  version: string;
  name?: string;
  description?: string;
  tier?: 'free' | 'premium';
  dependencies?: ResourceDependency[];
  files: string[];
  tags?: string[];
}

export interface RegistryIndexEntry {
  kind: ResourceKind;
  id: string;
  version: string;
  installedAt: string;
  source: string;
  path: string;
  includes?: ResourceDependency[];
}

export interface RegistryIndex {
  schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  installed: RegistryIndexEntry[];
}

export interface ResourceFilePayload {
  path: string;
  contents: string | Uint8Array;
}

export interface InstallResourceAtomicallyInput {
  manifest: ResourceManifest;
  source: string;
  files: ResourceFilePayload[];
  installedAt?: string;
}

export interface InstallResourceAtomicallyResult {
  entry: RegistryIndexEntry;
  index: RegistryIndex;
}

export interface ListInstalledResourcesInput {
  kind?: ResourceKind;
}

export interface UninstallResourceInput {
  kind: ResourceKind;
  id: string;
  version?: string;
}

export interface UninstallResourceResult {
  removed: RegistryIndexEntry[];
  index: RegistryIndex;
}

const kindSet = new Set<string>(RESOURCE_KINDS);
const segmentPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const versionPattern = /^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/;

export function getRegistryRootPath(): string {
  return join(getCcHomePath(), 'registry');
}

export function getResourceDirectory(kind: ResourceKind, id: string, version: string): string {
  assertSafeSegment(id, 'id');
  assertSafeVersion(version, 'version');
  return join(getRegistryRootPath(), kind, `${id}@${version}`);
}

export function readRegistryIndex(): RegistryIndex {
  const indexPath = getIndexPath();
  if (!existsSync(indexPath)) {
    return emptyIndex();
  }

  return normalizeRegistryIndex(JSON.parse(readFileSync(indexPath, 'utf-8')));
}

export function writeRegistryIndex(index: RegistryIndex): void {
  const normalized = normalizeRegistryIndex(index);
  mkdirSync(getRegistryRootPath(), { recursive: true });
  atomicWriteFile(getIndexPath(), `${JSON.stringify(normalized, null, 2)}\n`);
}

export function validateResourceManifest(value: unknown): string[] {
  const issues: string[] = [];

  if (!isRecord(value)) {
    return ['manifest must be an object'];
  }

  if (value.schemaVersion !== REGISTRY_SCHEMA_VERSION) {
    issues.push('schemaVersion must be 1');
  }

  if (typeof value.kind !== 'string' || !kindSet.has(value.kind)) {
    issues.push('kind must be template, theme, prompt, adapter-config, or bundle');
  }

  validateSafeSegment(value.id, 'id', issues);
  validateSafeVersion(value.version, 'version', issues);

  if (!Array.isArray(value.files) || value.files.length === 0) {
    issues.push('files must be a non-empty array');
  } else {
    value.files.forEach((file, index) => validateSafeRelativePath(file, `files[${index}]`, issues));
  }

  if (value.dependencies !== undefined) {
    if (!Array.isArray(value.dependencies)) {
      issues.push('dependencies must be an array when provided');
    } else {
      value.dependencies.forEach((dependency, index) => validateDependency(dependency, `dependencies[${index}]`, issues));
    }
  }

  if (value.tags !== undefined) {
    if (!Array.isArray(value.tags)) {
      issues.push('tags must be an array when provided');
    } else {
      value.tags.forEach((tag, index) => {
        if (typeof tag !== 'string' || tag.trim() === '') {
          issues.push(`tags[${index}] must be a non-empty string`);
        }
      });
    }
  }

  if (value.tier !== undefined && value.tier !== 'free' && value.tier !== 'premium') {
    issues.push('tier must be free or premium when provided');
  }

  return issues;
}

export function assertValidResourceManifest(value: unknown): asserts value is ResourceManifest {
  const issues = validateResourceManifest(value);
  if (issues.length > 0) {
    throw new Error(`Invalid resource manifest: ${issues.join('; ')}`);
  }
}

export function installResourceAtomically(input: InstallResourceAtomicallyInput): InstallResourceAtomicallyResult {
  assertValidResourceManifest(input.manifest);
  validatePayload(input.manifest.files, input.files);

  const targetDir = getResourceDirectory(input.manifest.kind, input.manifest.id, input.manifest.version);
  const tempDir = `${targetDir}.tmp-${process.pid}-${Date.now()}`;

  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });

  try {
    atomicWriteFile(join(tempDir, 'manifest.json'), `${JSON.stringify(input.manifest, null, 2)}\n`);
    for (const file of input.files) {
      const outputPath = join(tempDir, ...file.path.split('/'));
      mkdirSync(dirname(outputPath), { recursive: true });
      atomicWriteFile(outputPath, file.contents);
    }

    rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(dirname(targetDir), { recursive: true });
    renameSync(tempDir, targetDir);

    const entry: RegistryIndexEntry = {
      kind: input.manifest.kind,
      id: input.manifest.id,
      version: input.manifest.version,
      installedAt: input.installedAt ?? new Date().toISOString(),
      source: input.source,
      path: targetDir,
    };
    const index = upsertRegistryIndexEntry(readRegistryIndex(), entry);
    writeRegistryIndex(index);

    return { entry, index };
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export function listInstalledResources(input: ListInstalledResourcesInput = {}): RegistryIndexEntry[] {
  const entries = input.kind
    ? readRegistryIndex().installed.filter((entry) => entry.kind === input.kind)
    : readRegistryIndex().installed;

  return [...entries].sort((a, b) => entryKey(a).localeCompare(entryKey(b)));
}

export function uninstallResource(input: UninstallResourceInput): UninstallResourceResult {
  assertSafeSegment(input.id, 'id');
  if (input.version !== undefined) {
    assertSafeVersion(input.version, 'version');
  }

  const index = readRegistryIndex();
  const directMatches = index.installed.filter((entry) => isUninstallMatch(entry, input));
  if (directMatches.length === 0) {
    return { removed: [], index };
  }

  const includeKeys = new Set(directMatches.flatMap((entry) => entry.includes ?? []).map(dependencyKey));
  const includedMatches = index.installed.filter((entry) => includeKeys.has(entryKey(entry)));
  const removed = uniqueEntries([...directMatches, ...includedMatches]).sort((a, b) => entryKey(a).localeCompare(entryKey(b)));
  const removedKeys = new Set(removed.map(entryKey));

  for (const entry of removed) {
    removeRegistryDirectory(entry.path);
  }

  const nextIndex: RegistryIndex = {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    installed: index.installed.filter((entry) => !removedKeys.has(entryKey(entry))),
  };
  writeRegistryIndex(nextIndex);

  return { removed, index: nextIndex };
}

export function upsertRegistryIndexEntry(index: RegistryIndex, entry: RegistryIndexEntry): RegistryIndex {
  const installed = normalizeRegistryIndex(index).installed.filter(
    (candidate) =>
      candidate.kind !== entry.kind ||
      candidate.id !== entry.id ||
      candidate.version !== entry.version,
  );

  installed.push(entry);
  installed.sort((a, b) => entryKey(a).localeCompare(entryKey(b)));

  return {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    installed,
  };
}

function emptyIndex(): RegistryIndex {
  return { schemaVersion: REGISTRY_SCHEMA_VERSION, installed: [] };
}

function getIndexPath(): string {
  return join(getRegistryRootPath(), 'index.json');
}

function normalizeRegistryIndex(value: unknown): RegistryIndex {
  if (!isRecord(value) || value.schemaVersion !== REGISTRY_SCHEMA_VERSION || !Array.isArray(value.installed)) {
    throw new Error('Invalid registry index: expected schemaVersion 1 and installed array');
  }

  return {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    installed: value.installed.map(normalizeRegistryIndexEntry),
  };
}

function normalizeRegistryIndexEntry(value: unknown): RegistryIndexEntry {
  if (!isRecord(value)) {
    throw new Error('Invalid registry index entry: expected object');
  }

  const required = ['kind', 'id', 'version', 'installedAt', 'source', 'path'] as const;
  for (const key of required) {
    if (typeof value[key] !== 'string' || value[key].trim() === '') {
      throw new Error(`Invalid registry index entry: ${key} must be a non-empty string`);
    }
  }

  if (typeof value.kind !== 'string' || !kindSet.has(value.kind)) {
    throw new Error('Invalid registry index entry: kind is unsupported');
  }

  return {
    kind: value.kind as ResourceKind,
    id: value.id as string,
    version: value.version as string,
    installedAt: value.installedAt as string,
    source: value.source as string,
    path: value.path as string,
    includes: Array.isArray(value.includes) ? value.includes.map((dependency, index) => normalizeDependency(dependency, `includes[${index}]`)) : undefined,
  };
}

function validateDependency(value: unknown, field: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${field} must be an object`);
    return;
  }

  if (typeof value.kind !== 'string' || !kindSet.has(value.kind)) {
      issues.push(`${field}.kind must be template, theme, prompt, adapter-config, or bundle`);
  }
  validateSafeSegment(value.id, `${field}.id`, issues);

  if (value.version !== undefined) {
    validateSafeVersion(value.version, `${field}.version`, issues);
  }
  if (value.minVersion !== undefined) {
    validateSafeVersion(value.minVersion, `${field}.minVersion`, issues);
  }
}

function normalizeDependency(value: unknown, field: string): ResourceDependency {
  const issues: string[] = [];
  validateDependency(value, field, issues);
  if (issues.length > 0) {
    throw new Error(`Invalid registry index entry: ${issues.join('; ')}`);
  }
  return value as ResourceDependency;
}

function validatePayload(expectedPaths: string[], files: ResourceFilePayload[]): void {
  const issues: string[] = [];
  const expected = new Set(expectedPaths);
  const actual = new Set<string>();

  for (const file of files) {
    validateSafeRelativePath(file.path, 'payload path', issues);
    actual.add(file.path);
    if (typeof file.contents !== 'string' && !(file.contents instanceof Uint8Array)) {
      issues.push(`payload ${file.path} contents must be a string or Uint8Array`);
    }
  }

  for (const expectedPath of expected) {
    if (!actual.has(expectedPath)) {
      issues.push(`missing payload file ${expectedPath}`);
    }
  }

  for (const actualPath of actual) {
    if (!expected.has(actualPath)) {
      issues.push(`unexpected payload file ${actualPath}`);
    }
  }

  if (issues.length > 0) {
    throw new Error(`Invalid resource payload: ${issues.join('; ')}`);
  }
}

function atomicWriteFile(filePath: string, contents: string | Uint8Array): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, contents);
  renameSync(tempPath, filePath);
}

function assertSafeSegment(value: string, field: string): void {
  const issues: string[] = [];
  validateSafeSegment(value, field, issues);
  if (issues.length > 0) {
    throw new Error(issues.join('; '));
  }
}

function assertSafeVersion(value: string, field: string): void {
  const issues: string[] = [];
  validateSafeVersion(value, field, issues);
  if (issues.length > 0) {
    throw new Error(issues.join('; '));
  }
}

function validateSafeSegment(value: unknown, field: string, issues: string[]): void {
  if (typeof value !== 'string' || !segmentPattern.test(value)) {
    issues.push(`${field} must be a safe registry segment`);
  }
}

function validateSafeVersion(value: unknown, field: string, issues: string[]): void {
  if (typeof value !== 'string' || !versionPattern.test(value)) {
    issues.push(`${field} must be a safe version`);
  }
}

function validateSafeRelativePath(value: unknown, field: string, issues: string[]): void {
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push(`${field} must be a safe relative path`);
    return;
  }

  const parts = value.split('/');
  if (
    value.includes('\\') ||
    isAbsolute(value) ||
    /^[a-zA-Z]:/.test(value) ||
    parts.some((part) => part === '' || part === '.' || part === '..')
  ) {
    issues.push(`${field} must be a safe relative path`);
  }
}

function entryKey(entry: Pick<RegistryIndexEntry, 'kind' | 'id' | 'version'>): string {
  return `${entry.kind}:${entry.id}:${entry.version}`;
}

function dependencyKey(dependency: ResourceDependency): string {
  return `${dependency.kind}:${dependency.id}:${dependency.version ?? dependency.minVersion ?? ''}`;
}

function isUninstallMatch(entry: RegistryIndexEntry, input: UninstallResourceInput): boolean {
  return entry.kind === input.kind && entry.id === input.id && (input.version === undefined || entry.version === input.version);
}

function uniqueEntries(entries: RegistryIndexEntry[]): RegistryIndexEntry[] {
  const seen = new Set<string>();
  const unique: RegistryIndexEntry[] = [];
  for (const entry of entries) {
    const key = entryKey(entry);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(entry);
    }
  }
  return unique;
}

function removeRegistryDirectory(path: string): void {
  const registryRoot = resolve(getRegistryRootPath());
  const target = resolve(path);
  const rel = relative(registryRoot, target);

  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Refusing to remove path outside registry root: ${path}`);
  }

  rmSync(target, { recursive: true, force: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
