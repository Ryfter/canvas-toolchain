import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  verdictToFamily,
  resolveResources,
} from '../../src/lib/verdict-template-resolver.js';

// Mock listInstalledResources to avoid real registry reads
vi.mock('../../src/registry/local_registry.js', () => ({
  listInstalledResources: vi.fn(() => []),
}));
import { listInstalledResources } from '../../src/registry/local_registry.js';
const mockListInstalled = vi.mocked(listInstalledResources);

describe('verdictToFamily()', () => {
  it('maps KEEP → standard', () => expect(verdictToFamily('KEEP')).toBe('standard'));
  it('maps UPDATE → refresh', () => expect(verdictToFamily('UPDATE')).toBe('refresh'));
  it('maps ADD → new-topic', () => expect(verdictToFamily('ADD')).toBe('new-topic'));
  it('maps DROP → null', () => expect(verdictToFamily('DROP')).toBeNull());
});

describe('resolveResources()', () => {
  it('returns null for DROP verdict', () => {
    expect(resolveResources('DROP', 'Assignment 1')).toBeNull();
  });

  it('falls back to cds-defaults when registry has no matching template', () => {
    mockListInstalled.mockReturnValue([]);
    const result = resolveResources('KEEP', 'Assignment 1');
    expect(result).not.toBeNull();
    expect(result!.templateId).toBe('assignment');
    expect(result!.templateVersion).toBe('1.0.0');
    expect(result!.themeId).toBe('cds-default');
    expect(result!.promptSetId).toBe('cds-default');
  });

  it('uses per-assignment override when present', () => {
    const result = resolveResources('KEEP', 'Assignment 1', {
      overrides: { 'Assignment 1': { templateId: 'custom-template', templateVersion: '2.0.0' } },
    });
    expect(result!.templateId).toBe('custom-template');
    expect(result!.templateVersion).toBe('2.0.0');
  });

  it('uses family preference over registry lookup', () => {
    const result = resolveResources('UPDATE', 'Assignment 2', {
      familyPreference: { refresh: { templateId: 'refresh-template', templateVersion: '1.1.0' } },
    });
    expect(result!.templateId).toBe('refresh-template');
    expect(result!.templateVersion).toBe('1.1.0');
  });

  it('uses custom themeId and promptSetId from prefs', () => {
    const result = resolveResources('KEEP', 'Assignment 1', {
      themeId: 'my-theme',
      themeVersion: '3.0.0',
      promptSetId: 'my-prompts',
      promptSetVersion: '2.0.0',
    });
    expect(result!.themeId).toBe('my-theme');
    expect(result!.themeVersion).toBe('3.0.0');
    expect(result!.promptSetId).toBe('my-prompts');
    expect(result!.promptSetVersion).toBe('2.0.0');
  });

  describe('registry lookup by family tag', () => {
    let tmpDir: string;
    let origCcHome: string | undefined;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'vtr-test-'));
      origCcHome = process.env.CC_HOME;
      process.env.CC_HOME = tmpDir;
    });

    afterEach(() => {
      if (origCcHome !== undefined) process.env.CC_HOME = origCcHome;
      else delete process.env.CC_HOME;
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('picks the registry template tagged family:standard + assignment', () => {
      const templateDir = join(tmpDir, 'registry', 'template', 'standard-assignment@1.5.0');
      mkdirSync(templateDir, { recursive: true });
      writeFileSync(
        join(templateDir, 'manifest.json'),
        JSON.stringify({ schemaVersion: 1, kind: 'template', id: 'standard-assignment', version: '1.5.0', tags: ['assignment', 'family:standard'] }),
      );

      mockListInstalled.mockReturnValue([
        {
          kind: 'template',
          id: 'standard-assignment',
          version: '1.5.0',
          installedAt: '2026-01-01T00:00:00.000Z',
          source: 'local',
          path: templateDir,
        },
      ]);

      const result = resolveResources('KEEP', 'Assignment 1');
      expect(result!.templateId).toBe('standard-assignment');
      expect(result!.templateVersion).toBe('1.5.0');
    });

    it('ignores templates missing the assignment tag', () => {
      const templateDir = join(tmpDir, 'registry', 'template', 'overview-standard@1.0.0');
      mkdirSync(templateDir, { recursive: true });
      writeFileSync(
        join(templateDir, 'manifest.json'),
        JSON.stringify({ schemaVersion: 1, kind: 'template', id: 'overview-standard', version: '1.0.0', tags: ['overview', 'family:standard'] }),
      );

      mockListInstalled.mockReturnValue([
        {
          kind: 'template',
          id: 'overview-standard',
          version: '1.0.0',
          installedAt: '2026-01-01T00:00:00.000Z',
          source: 'local',
          path: templateDir,
        },
      ]);

      const result = resolveResources('KEEP', 'Assignment 1');
      // Falls back to seed because no assignment-tagged template found
      expect(result!.templateId).toBe('assignment');
    });
  });
});
