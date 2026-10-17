import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GENERATED_END, splitGenerated, writeGeneratedFile } from '../../../../scripts/skills/lib/emit.mjs';

const roots: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skills-emit-'));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('writeGeneratedFile', () => {
  it('creates a file with the generated region, the marker, and the stub body', () => {
    const file = join(tempRoot(), 'nested', 'ops', 'x.md');
    const status = writeGeneratedFile(file, '---\nid: x\n---\n', { stub: '\n\n## When to use\n' });

    expect(status).toBe('created');
    expect(readFileSync(file, 'utf8')).toBe('---\nid: x\n---\n<!-- generated:end -->\n\n## When to use\n');
  });

  it('never rewrites the hand-written body below the marker', () => {
    const file = join(tempRoot(), 'ops_x.md');
    writeFileSync(file, '---\nid: x\n---\n<!-- generated:end -->\n\n## When to use\n\nHand-written guidance.\n');

    const status = writeGeneratedFile(file, '---\nid: x\n---\n', { stub: '\n\nSTUB\n' });

    expect(status).toBe('unchanged');
    expect(readFileSync(file, 'utf8')).toContain('Hand-written guidance.');
    expect(readFileSync(file, 'utf8')).not.toContain('STUB');
  });

  it('updates only the generated region when it changes', () => {
    const file = join(tempRoot(), 'ops_x.md');
    writeFileSync(file, '---\nid: x\nold\n---\n<!-- generated:end -->\n\nHand-written guidance.\n');

    const status = writeGeneratedFile(file, '---\nid: x\nnew\n---\n');

    expect(status).toBe('updated');
    expect(readFileSync(file, 'utf8')).toBe(
      '---\nid: x\nnew\n---\n<!-- generated:end -->\n\nHand-written guidance.\n',
    );
  });

  it('is idempotent: a second write of the same region is a no-op', () => {
    const file = join(tempRoot(), 'ops_x.md');
    const region = '---\nid: x\n---\n';

    expect(writeGeneratedFile(file, region, { stub: '\n\nbody\n' })).toBe('created');
    expect(writeGeneratedFile(file, region, { stub: '\n\nbody\n' })).toBe('unchanged');
  });

  it('preserves a markerless file by moving all of it below the marker', () => {
    const file = join(tempRoot(), 'ops_x.md');
    writeFileSync(file, 'Hand-written, no generated region yet.\n');

    expect(writeGeneratedFile(file, '---\nid: x\n---\n')).toBe('updated');
    expect(readFileSync(file, 'utf8')).toBe(
      '---\nid: x\n---\n<!-- generated:end -->\nHand-written, no generated region yet.\n',
    );
  });

  it('reports but does not write in check mode', () => {
    const dir = tempRoot();
    mkdirSync(join(dir, 'ops'));
    const file = join(dir, 'ops', 'x.md');

    expect(writeGeneratedFile(file, '---\nid: x\n---\n', { check: true })).toBe('would-create');
    expect(() => readFileSync(file, 'utf8')).toThrow();
  });
});

describe('splitGenerated', () => {
  it('splits at the marker, keeping the marker with the tail', () => {
    const { generated, tail } = splitGenerated('gen\n<!-- generated:end -->\nbody\n');
    expect(generated).toBe('gen\n');
    expect(tail).toBe('\nbody\n');
  });

  it('treats markerless text as the hand-written tail', () => {
    const { generated, tail } = splitGenerated('just prose\n');
    expect(generated).toBe('');
    expect(tail).toBe('\njust prose\n');
  });
});

// Keep the exported marker in one place: every writer and the lint share it.
it('exports the single marker constant', () => {
  expect(GENERATED_END).toBe('<!-- generated:end -->');
});
