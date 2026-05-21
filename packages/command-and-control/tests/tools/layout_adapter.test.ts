import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractSlotsHeuristically,
  pasteLayout,
  saveLayoutAsTemplate,
} from '../../src/tools/layout_adapter.js';
import { readRegistryIndex } from '../../src/registry/local_registry.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-layout-test-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('Heuristic Slot Extractor', () => {
  it('extracts explicit data-slot elements', () => {
    const html = `
      <div data-slot="hero" class="my-hero"><h1>Hero Title</h1></div>
      <div data-slot="x-introduction"><h2>Intro</h2><p>Content</p></div>
    `;
    const slots = extractSlotsHeuristically(html);
    expect(slots.hero).toContain('class="my-hero"');
    expect(slots['x-introduction']).toContain('<h2>Intro</h2>');
  });

  it('extracts hero block based on styled visual heuristics', () => {
    const html = `
      <div style="background: url('hero.jpg'); padding: 20px;">
        <h2 style="font-size: 26px;">Big Title</h2>
      </div>
      <p>Normal paragraph.</p>
    `;
    const slots = extractSlotsHeuristically(html);
    expect(slots.hero).toContain("url('hero.jpg')");
    expect(slots.hero).toContain('Big Title');
  });

  it('extracts callout boxes based on light blue background styling', () => {
    const html = `
      <div style="background: #DBE7FF; padding: 15px;">
        <h3>Notes</h3>
        <p>This is a callout block.</p>
      </div>
    `;
    const slots = extractSlotsHeuristically(html);
    expect(slots.callout).toContain('background: #DBE7FF');
    expect(slots.callout).toContain('This is a callout block.');
  });

  it('extracts standard headings matching sectionHeadingMap', () => {
    const html = `
      <h2>This Week's Activities</h2>
      <p>Here is activity 1</p>
      <p>Here is activity 2</p>
      <h2>Readings</h2>
      <p>Read chapter 5</p>
    `;
    const slots = extractSlotsHeuristically(html);
    expect(slots['x-activities']).toContain("This Week's Activities");
    expect(slots['x-activities']).toContain('Here is activity 1');
    expect(slots['x-readings']).toContain('Readings');
    expect(slots['x-readings']).toContain('Read chapter 5');
  });

  it('slugifies and extracts custom headings', () => {
    const html = `
      <h2>My Dynamic AI Strategy</h2>
      <p>Custom strategic info.</p>
    `;
    const slots = extractSlotsHeuristically(html);
    expect(slots['x-my-dynamic-ai-strategy']).toContain('My Dynamic AI Strategy');
    expect(slots['x-my-dynamic-ai-strategy']).toContain('Custom strategic info.');
  });

  it('collects leftover content in body slot', () => {
    const html = `
      <p>This is lead-in text.</p>
      <div data-slot="hero"><h1>Hero</h1></div>
      <p>This is trailing text.</p>
    `;
    const slots = extractSlotsHeuristically(html);
    expect(slots.body).toContain('This is lead-in text.');
    expect(slots.body).toContain('This is trailing text.');
  });
});

describe('pasteLayout tool', () => {
  it('runs HTML and CSS through safe transform and extracts slots & a11y', async () => {
    const html = `
      <style>h1 { color: red; }</style>
      <div class="container">
        <h1>Welcome to ITM 370</h1>
        <script>alert("hack");</script>
        <img src="spacer.gif">
        <a href="/somewhere">click here</a>
        <h2>Introduction</h2>
        <p>Hello world.</p>
      </div>
    `;
    const css = `.container { background-color: #DBE7FF; }`;

    const adapted = await pasteLayout({ html, css });

    // JS stripped
    expect(adapted.canvasSafeHtml).not.toContain('alert("hack")');
    expect(adapted.canvasSafeHtml).not.toContain('script');

    // Convert h1 to h2
    expect(adapted.canvasSafeHtml).toContain('h2');
    expect(adapted.canvasSafeHtml).toContain('font-size: 26px');
    expect(adapted.removed).toContainEqual(
      expect.objectContaining({ tag: 'h1' })
    );

    // Slots extracted
    // Hero extracted due to h2 with font-size: 26px parent (which has background #DBE7FF)
    expect(adapted.slotMap.hero).toBeDefined();

    // Standard section heading mapped
    expect(adapted.slotMap['x-introduction']).toContain('Introduction');

    // Accessibility warnings checked
    // Missing alt on img, vague link text on a
    expect(adapted.accessibility.warnings.some(w => w.includes('Missing img alt attribute'))).toBe(true);
    expect(adapted.accessibility.warnings.some(w => w.includes("Vague link text 'click here'"))).toBe(true);
  });
});

describe('saveLayoutAsTemplate tool', () => {
  it('substitutes concrete slots, generates manifest/slots, and installs in registry', async () => {
    const html = `
      <div class="hero-block" style="background: url('hero.jpg'); font-size: 26px;">
        <h2>Title</h2>
      </div>
      <div class="intro-block">
        <h2>Introduction</h2>
        <p>Intro content.</p>
      </div>
    `;

    const adapted = await pasteLayout({ html });

    const saveResult = await saveLayoutAsTemplate({
      layout: adapted,
      templateId: 'test-timeline-template',
      templateVersion: '1.0.0',
    });

    const registryIndex = readRegistryIndex();
    expect(registryIndex.installed).toHaveLength(1);
    expect(registryIndex.installed[0].id).toBe('test-timeline-template');
    expect(registryIndex.installed[0].kind).toBe('template');

    const installedDir = saveResult.installedPath;
    expect(existsSync(join(installedDir, 'manifest.json'))).toBe(true);
    expect(existsSync(join(installedDir, 'structure.html'))).toBe(true);
    expect(existsSync(join(installedDir, 'slots.json'))).toBe(true);

    const structureHtml = readFileSync(join(installedDir, 'structure.html'), 'utf-8');
    expect(structureHtml).toContain('{{slot:hero}}');
    expect(structureHtml).toContain('{{slot:x-introduction}}');

    const slotsJson = JSON.parse(readFileSync(join(installedDir, 'slots.json'), 'utf-8'));
    expect(slotsJson.hero).toBeDefined();
    expect(slotsJson['x-introduction']).toBeDefined();
  });
});
