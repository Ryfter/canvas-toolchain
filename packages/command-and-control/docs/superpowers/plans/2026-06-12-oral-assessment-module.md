# Oral Assessment Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an optional `oral-assessment` module — Rhetorix Lab as the recommended provider — that generates a paste-ready Rhetorix assessment spec plus a Canvas-safe wrapper page from an assignment brief or a topic+goal.

**Architecture:** A new `@canvas-toolchain/module-oral-assessment` package owns a provider seam (`OralAssessmentProvider` + `RhetorixProvider`, pure functions) and one LLM-backed `design_oral_assessment` ModuleTool that writes a CDS `oral-assessment` page-type `.md` and a faculty sidecar spec. Canvas Design Studio gains a generic `oral-assessment` page type that `generate_course` renders. Command & Control registers the module and lists Rhetorix in the `known-tools.yaml` catalog. No credentials; the only config is an optional institution launch domain in `course-config.md`.

**Tech Stack:** TypeScript (ESM, Node ≥20), `@modelcontextprotocol/sdk`, `@canvas-toolchain/module-contract`, `@canvas-toolchain/shared-llm`, vitest 3.

Spec: [`../specs/2026-06-12-oral-assessment-module-design.md`](../specs/2026-06-12-oral-assessment-module-design.md).

---

## File structure

**New package `packages/module-oral-assessment/`:**
- `package.json`, `tsconfig.json` — workspace config (copy module-video).
- `src/provider.ts` — `OralAssessmentProvider` interface + shared types (`AssessmentSpec`, `AssessmentDefaults`, `RubricCriterion`).
- `src/providers/rhetorix.ts` — `RhetorixProvider` (pure: `defaults`, `formatAssessment`, `buildLaunchUrl`, `recommendation`).
- `src/resolve.ts` — `resolveActiveOralAssessmentProvider(id?)` (default `rhetorix`).
- `src/llm.ts` — module-local `loadAnthropicConfig()` + `makeAnthropicLlm()` (shared-llm).
- `src/prompts.ts` — `SYSTEM_PROMPT` + `buildUserPrompt(input)` (two-mode).
- `src/render_md.ts` — `renderOralAssessmentMarkdown(spec, fm)` → page-type `.md`.
- `src/design.ts` — `designOralAssessment(input, hooks)` orchestrator + types + validation.
- `src/tools.ts` — `design_oral_assessment` ModuleTool array.
- `src/index.ts` — default-export `CanvasToolchainModule`.
- `tests/*.test.ts` — one suite per source unit.

**Canvas Design Studio (`packages/canvas-design-studio/src/`):**
- `course-types.ts` — add `'oral-assessment'` to `PAGE_TYPES` + label; add `oralAssessmentLaunchDomain?` to `CourseConfig`.
- `tools/course-config.ts` — parse `oral_assessment_launch_domain`.
- `tools/extract_oral_assessment.ts` — NEW: read page-type front matter.
- `tools/course-templates.ts` — `renderOralAssessment()` + dispatch in `renderPage`.
- `tools/generate-page.ts` — add `'oral-assessment'` to AIAS/TLDR eligibility + pass launch domain.

**Command & Control (`packages/command-and-control/`):**
- `src/modules/registry.ts` — add `oral-assessment` to `KNOWN_MODULES`.
- `package.json` — add `@canvas-toolchain/module-oral-assessment` dependency.
- `data/known-tools.yaml` — add the Rhetorix catalog entry.

---

## PHASE 1 — Module package scaffold + provider (pure functions)

### Task 1: Package scaffold

**Files:**
- Create: `packages/module-oral-assessment/package.json`
- Create: `packages/module-oral-assessment/tsconfig.json`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@canvas-toolchain/module-oral-assessment",
  "license": "MIT",
  "version": "1.0.0",
  "description": "Oral Assessment module for canvas-toolchain (Rhetorix Lab recommended provider).",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@canvas-toolchain/module-contract": "*",
    "@canvas-toolchain/shared-llm": "*",
    "@modelcontextprotocol/sdk": "^1.10.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^3.2.6"
  },
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Install workspace deps**

Run: `npm install` (from repo root)
Expected: completes; the new workspace is linked.

- [ ] **Step 4: Commit**

```bash
git add packages/module-oral-assessment/package.json packages/module-oral-assessment/tsconfig.json
git commit -m "feat(oral-assessment): scaffold module package"
```

---

### Task 2: Provider interface + shared types

**Files:**
- Create: `packages/module-oral-assessment/src/provider.ts`
- Test: `packages/module-oral-assessment/tests/provider-types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import type { AssessmentSpec, OralAssessmentProvider } from '../src/provider.js';

describe('provider types', () => {
  it('an AssessmentSpec is structurally usable', () => {
    const spec: AssessmentSpec = {
      title: 'Concept Check',
      promptSummary: 'Explain a concept aloud.',
      questions: [{ prompt: 'What is opportunity cost?' }],
      prepSeconds: 30,
      responseSeconds: 120,
      randomization: { pick: 1, of: 3 },
      attempts: 1,
      rubricCriteria: [{ name: 'Accuracy', description: 'Correctness', points: 10 }],
    };
    expect(spec.questions).toHaveLength(1);
  });

  it('a provider shape is assignable', () => {
    const p: Pick<OralAssessmentProvider, 'id' | 'recommended'> = { id: 'x', recommended: false };
    expect(p.id).toBe('x');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/module-oral-assessment -- provider-types`
Expected: FAIL — cannot find module `../src/provider.js`.

- [ ] **Step 3: Write `src/provider.ts`**

```typescript
export interface RubricCriterion {
  name: string;
  description: string;
  points: number;
}

export interface AssessmentQuestion {
  prompt: string;
}

export type AttemptsPolicy = number | 'unlimited';

export interface AssessmentDefaults {
  prepSeconds: number;
  responseSeconds: number;
  randomization: { pick: number; of: number };
  attempts: AttemptsPolicy;
}

export interface AssessmentSpec {
  title: string;
  promptSummary: string;
  questions: AssessmentQuestion[];
  prepSeconds: number;
  responseSeconds: number;
  randomization: { pick: number; of: number };
  attempts: AttemptsPolicy;
  rubricCriteria: RubricCriterion[];
}

/** A pluggable oral/video-assessment provider. Rhetorix is provider #1. */
export interface OralAssessmentProvider {
  id: string;
  name: string;
  /** True for the best-of-breed default provider surfaced as the recommendation. */
  recommended: boolean;
  /** Human-readable "why this provider" rationale. */
  recommendation(): string;
  /** Default timing/randomization, optionally tuned to an intent keyword. */
  defaults(intent?: string): AssessmentDefaults;
  /** Paste-ready setup text for the provider's own assignment creator. */
  formatAssessment(spec: AssessmentSpec): string;
  /** Build the LTI launch URL from a stored institution domain, or null. */
  buildLaunchUrl(domain: string | undefined): string | null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/module-oral-assessment -- provider-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-oral-assessment/src/provider.ts packages/module-oral-assessment/tests/provider-types.test.ts
git commit -m "feat(oral-assessment): provider interface + assessment types"
```

---

### Task 3: RhetorixProvider — defaults & recommendation

**Files:**
- Create: `packages/module-oral-assessment/src/providers/rhetorix.ts`
- Test: `packages/module-oral-assessment/tests/rhetorix-defaults.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { RhetorixProvider } from '../src/providers/rhetorix.js';

const p = new RhetorixProvider();

describe('RhetorixProvider defaults & recommendation', () => {
  it('is the recommended provider with id rhetorix', () => {
    expect(p.id).toBe('rhetorix');
    expect(p.recommended).toBe(true);
  });

  it('recommendation mentions AI-resilient video and Canvas grade passback', () => {
    const r = p.recommendation().toLowerCase();
    expect(r).toContain('ai-resilient');
    expect(r).toContain('grade passback');
  });

  it('default intent: 30s prep, 120s response, 1-of-3, single attempt', () => {
    const d = p.defaults();
    expect(d).toEqual({ prepSeconds: 30, responseSeconds: 120, randomization: { pick: 1, of: 3 }, attempts: 1 });
  });

  it('discussion intent allows advance viewing and unlimited attempts', () => {
    const d = p.defaults('AI-resilient oral discussion');
    expect(d.prepSeconds).toBe(0);
    expect(d.responseSeconds).toBe(180);
    expect(d.randomization).toEqual({ pick: 1, of: 1 });
    expect(d.attempts).toBe('unlimited');
  });

  it('impromptu intent uses a short 15s prep', () => {
    expect(p.defaults('impromptu speaking').prepSeconds).toBe(15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/module-oral-assessment -- rhetorix-defaults`
Expected: FAIL — cannot find `../src/providers/rhetorix.js`.

- [ ] **Step 3: Write `src/providers/rhetorix.ts` (defaults + recommendation only)**

```typescript
import type { AssessmentDefaults, AssessmentSpec, OralAssessmentProvider } from '../provider.js';

export class RhetorixProvider implements OralAssessmentProvider {
  readonly id = 'rhetorix';
  readonly name = 'Rhetorix Lab';
  readonly recommended = true;

  recommendation(): string {
    return (
      'Rhetorix Lab is the recommended oral-assessment provider: AI-resilient async ' +
      'video capture, native Canvas integration with grade passback over LTI, and a ' +
      'design built to verify genuine student understanding rather than detect AI.'
    );
  }

  defaults(intent?: string): AssessmentDefaults {
    const i = (intent ?? '').toLowerCase();
    if (i.includes('discussion')) {
      return { prepSeconds: 0, responseSeconds: 180, randomization: { pick: 1, of: 1 }, attempts: 'unlimited' };
    }
    if (i.includes('impromptu')) {
      return { prepSeconds: 15, responseSeconds: 120, randomization: { pick: 1, of: 3 }, attempts: 1 };
    }
    return { prepSeconds: 30, responseSeconds: 120, randomization: { pick: 1, of: 3 }, attempts: 1 };
  }

  // formatAssessment + buildLaunchUrl added in Task 4.
  formatAssessment(_spec: AssessmentSpec): string {
    throw new Error('not implemented');
  }
  buildLaunchUrl(_domain: string | undefined): string | null {
    throw new Error('not implemented');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/module-oral-assessment -- rhetorix-defaults`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-oral-assessment/src/providers/rhetorix.ts packages/module-oral-assessment/tests/rhetorix-defaults.test.ts
git commit -m "feat(oral-assessment): RhetorixProvider defaults + recommendation"
```

---

### Task 4: RhetorixProvider — formatAssessment & buildLaunchUrl

**Files:**
- Modify: `packages/module-oral-assessment/src/providers/rhetorix.ts`
- Test: `packages/module-oral-assessment/tests/rhetorix-format.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { RhetorixProvider } from '../src/providers/rhetorix.js';
import type { AssessmentSpec } from '../src/provider.js';

const p = new RhetorixProvider();
const spec: AssessmentSpec = {
  title: 'Ethics of Generative AI',
  promptSummary: 'Discuss the ethics of generative AI in your field.',
  questions: [{ prompt: 'What is one ethical risk of generative AI in your field?' }, { prompt: 'How would you mitigate it?' }],
  prepSeconds: 30,
  responseSeconds: 120,
  randomization: { pick: 1, of: 2 },
  attempts: 'unlimited',
  rubricCriteria: [{ name: 'Insight', description: 'Depth of reasoning', points: 10 }],
};

describe('RhetorixProvider.formatAssessment', () => {
  it('produces paste-ready markdown with timing, questions, and rubric', () => {
    const md = p.formatAssessment(spec);
    expect(md).toContain('Ethics of Generative AI');
    expect(md).toContain('Prep: 30s');
    expect(md).toContain('Response: 2:00');
    expect(md).toContain('Randomization: 1 of 2');
    expect(md).toContain('Attempts: unlimited');
    expect(md).toContain('1. What is one ethical risk');
    expect(md).toContain('2. How would you mitigate it?');
    expect(md).toContain('Insight (10 pts): Depth of reasoning');
  });
});

describe('RhetorixProvider.buildLaunchUrl', () => {
  it('builds the lti/launch URL from a domain', () => {
    expect(p.buildLaunchUrl('rhetorixlab.example.edu')).toBe('https://rhetorixlab.example.edu/lti/launch');
  });
  it('returns null without a domain', () => {
    expect(p.buildLaunchUrl(undefined)).toBeNull();
    expect(p.buildLaunchUrl('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/module-oral-assessment -- rhetorix-format`
Expected: FAIL — throws "not implemented".

- [ ] **Step 3: Replace the two stub methods in `src/providers/rhetorix.ts`**

Replace the `formatAssessment` and `buildLaunchUrl` stubs with:

```typescript
  formatAssessment(spec: AssessmentSpec): string {
    const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const lines: string[] = [
      `# ${spec.title} — paste into Rhetorix Lab assignment creator`,
      '',
      `Prep: ${spec.prepSeconds}s  ·  Response: ${mmss(spec.responseSeconds)}  ·  ` +
        `Randomization: ${spec.randomization.pick} of ${spec.randomization.of}  ·  ` +
        `Attempts: ${spec.attempts}`,
      '',
      '## Questions',
      ...spec.questions.map((q, i) => `${i + 1}. ${q.prompt}`),
      '',
      '## Rubric',
      ...spec.rubricCriteria.map((c) => `- ${c.name} (${c.points} pts): ${c.description}`),
      '',
    ];
    return lines.join('\n');
  }

  buildLaunchUrl(domain: string | undefined): string | null {
    if (!domain || !domain.trim()) return null;
    return `https://${domain.trim()}/lti/launch`;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/module-oral-assessment -- rhetorix-format`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-oral-assessment/src/providers/rhetorix.ts packages/module-oral-assessment/tests/rhetorix-format.test.ts
git commit -m "feat(oral-assessment): Rhetorix formatAssessment + buildLaunchUrl"
```

---

### Task 5: Active-provider resolver

**Files:**
- Create: `packages/module-oral-assessment/src/resolve.ts`
- Test: `packages/module-oral-assessment/tests/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { resolveActiveOralAssessmentProvider } from '../src/resolve.js';

describe('resolveActiveOralAssessmentProvider', () => {
  it('defaults to Rhetorix', () => {
    expect(resolveActiveOralAssessmentProvider().id).toBe('rhetorix');
  });
  it('resolves rhetorix explicitly', () => {
    expect(resolveActiveOralAssessmentProvider('rhetorix').id).toBe('rhetorix');
  });
  it('throws on an unknown provider id', () => {
    expect(() => resolveActiveOralAssessmentProvider('nope')).toThrow(/unknown oral-assessment provider/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/module-oral-assessment -- resolve`
Expected: FAIL — cannot find `../src/resolve.js`.

- [ ] **Step 3: Write `src/resolve.ts`**

```typescript
import type { OralAssessmentProvider } from './provider.js';
import { RhetorixProvider } from './providers/rhetorix.js';

/** Resolve the active provider. Default + only provider today: rhetorix. */
export function resolveActiveOralAssessmentProvider(id = 'rhetorix'): OralAssessmentProvider {
  switch (id) {
    case 'rhetorix':
      return new RhetorixProvider();
    default:
      throw new Error(`Unknown oral-assessment provider: '${id}'`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/module-oral-assessment -- resolve`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-oral-assessment/src/resolve.ts packages/module-oral-assessment/tests/resolve.test.ts
git commit -m "feat(oral-assessment): active-provider resolver"
```

---

## PHASE 2 — Generation orchestrator (hermetic LLM)

### Task 6: Module-local Anthropic loader

**Files:**
- Create: `packages/module-oral-assessment/src/llm.ts`
- Test: `packages/module-oral-assessment/tests/llm.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadAnthropicConfig } from '../src/llm.js';

const saved = process.env.CC_HOME;
afterEach(() => { if (saved === undefined) delete process.env.CC_HOME; else process.env.CC_HOME = saved; });

describe('loadAnthropicConfig', () => {
  it('throws ANTHROPIC_NOT_CONFIGURED when absent', () => {
    process.env.CC_HOME = mkdtempSync(join(tmpdir(), 'oa-llm-'));
    expect(() => loadAnthropicConfig()).toThrow(/ANTHROPIC_NOT_CONFIGURED/);
  });
  it('reads apiKey + model when present', () => {
    const home = mkdtempSync(join(tmpdir(), 'oa-llm-'));
    process.env.CC_HOME = home;
    writeFileSync(join(home, 'anthropic-config.json'), JSON.stringify({ apiKey: 'sk-x', model: 'claude-y' }));
    const cfg = loadAnthropicConfig();
    expect(cfg.apiKey).toBe('sk-x');
    expect(cfg.model).toBe('claude-y');
    rmSync(home, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/module-oral-assessment -- llm`
Expected: FAIL — cannot find `../src/llm.js`.

- [ ] **Step 3: Write `src/llm.ts`**

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AnthropicLlmClient, type LlmClient } from '@canvas-toolchain/shared-llm';

function ccHome(): string {
  return process.env.CC_HOME ?? join(homedir(), '.command-and-control');
}

export interface ModuleAnthropicConfig {
  apiKey: string;
  model: string;
}

const DEFAULT_MODEL = 'claude-haiku-4-5';

/** Read ~/.command-and-control/anthropic-config.json. Throws if not configured. */
export function loadAnthropicConfig(): ModuleAnthropicConfig {
  const path = join(ccHome(), 'anthropic-config.json');
  if (!existsSync(path)) {
    throw new Error('ANTHROPIC_NOT_CONFIGURED: Run setup_anthropic with your Anthropic API key.');
  }
  let parsed: Partial<ModuleAnthropicConfig>;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<ModuleAnthropicConfig>;
  } catch {
    throw new Error('ANTHROPIC_NOT_CONFIGURED: anthropic-config.json is corrupt. Re-run setup_anthropic.');
  }
  if (!parsed.apiKey) {
    throw new Error('ANTHROPIC_NOT_CONFIGURED: anthropic-config.json is missing apiKey. Re-run setup_anthropic.');
  }
  return { apiKey: parsed.apiKey, model: parsed.model ?? DEFAULT_MODEL };
}

/** Construct the production LLM client. Tests inject their own LlmClient instead. */
export function makeAnthropicLlm(): LlmClient {
  const cfg = loadAnthropicConfig();
  return new AnthropicLlmClient({ apiKey: cfg.apiKey, model: cfg.model });
}
```

> Note: confirm `AnthropicLlmClient`'s constructor signature in `packages/shared-llm/src/`. If it takes positional args or a different shape, match it here — the rest of the plan only depends on the `LlmClient.complete(system, user, opts)` interface.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/module-oral-assessment -- llm`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add packages/module-oral-assessment/src/llm.ts packages/module-oral-assessment/tests/llm.test.ts
git commit -m "feat(oral-assessment): module-local Anthropic config loader"
```

---

### Task 7: Prompts (two-mode input)

**Files:**
- Create: `packages/module-oral-assessment/src/prompts.ts`
- Test: `packages/module-oral-assessment/tests/prompts.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, buildUserPrompt } from '../src/prompts.js';

describe('prompts', () => {
  it('system prompt asks for a strict JSON AssessmentSpec', () => {
    expect(SYSTEM_PROMPT).toContain('JSON');
    expect(SYSTEM_PROMPT).toContain('questions');
    expect(SYSTEM_PROMPT).toContain('rubricCriteria');
  });

  it('brief mode includes the brief and the question count', () => {
    const u = buildUserPrompt({ assignmentBrief: 'Write a memo on pricing.', questionCount: 3, outputPath: '/x.md' });
    expect(u).toContain('ASSIGNMENT BRIEF');
    expect(u).toContain('Write a memo on pricing.');
    expect(u).toContain('3');
  });

  it('topic mode includes topic + learning goal', () => {
    const u = buildUserPrompt({ topic: 'opportunity cost', learningGoal: 'explain trade-offs', outputPath: '/x.md' });
    expect(u).toContain('TOPIC');
    expect(u).toContain('opportunity cost');
    expect(u).toContain('LEARNING GOAL');
    expect(u).toContain('explain trade-offs');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/module-oral-assessment -- prompts`
Expected: FAIL — cannot find `../src/prompts.js`.

- [ ] **Step 3: Write `src/prompts.ts`**

```typescript
import type { DesignOralAssessmentInput } from './design.js';

export const SYSTEM_PROMPT = [
  'You design short oral/video assessments for university courses.',
  'Return ONLY a JSON object (no prose, no code fences) with this exact shape:',
  '{',
  '  "title": string,',
  '  "promptSummary": string,            // one student-facing sentence',
  '  "questions": [{ "prompt": string }],// the randomization pool',
  '  "rubricCriteria": [{ "name": string, "description": string, "points": number }]',
  '}',
  'Write prompts a student answers by speaking on camera for 1-3 minutes.',
  'Favor prompts that require genuine understanding and are resistant to AI ghost-writing.',
].join('\n');

export function buildUserPrompt(input: DesignOralAssessmentInput): string {
  const parts: string[] = [];
  if (input.assignmentBrief) {
    parts.push('ASSIGNMENT BRIEF:', input.assignmentBrief);
  } else {
    parts.push('TOPIC:', input.topic ?? '', '', 'LEARNING GOAL:', input.learningGoal ?? '');
  }
  if (input.courseContext) parts.push('', 'COURSE CONTEXT:', input.courseContext);
  const n = input.questionCount ?? 3;
  parts.push('', `Produce ${n} distinct question(s) for the randomization pool.`);
  return parts.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/module-oral-assessment -- prompts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-oral-assessment/src/prompts.ts packages/module-oral-assessment/tests/prompts.test.ts
git commit -m "feat(oral-assessment): two-mode generation prompts"
```

---

### Task 8: Page-type markdown renderer

**Files:**
- Create: `packages/module-oral-assessment/src/render_md.ts`
- Test: `packages/module-oral-assessment/tests/render_md.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { renderOralAssessmentMarkdown } from '../src/render_md.js';
import type { AssessmentSpec } from '../src/provider.js';

const spec: AssessmentSpec = {
  title: 'Concept Check',
  promptSummary: 'Explain opportunity cost aloud.',
  questions: [{ prompt: 'What is opportunity cost?' }],
  prepSeconds: 30,
  responseSeconds: 120,
  randomization: { pick: 1, of: 3 },
  attempts: 1,
  rubricCriteria: [{ name: 'Accuracy', description: 'Correctness', points: 10 }],
};

describe('renderOralAssessmentMarkdown', () => {
  it('writes oral-assessment front matter (flat fields) + body', () => {
    const md = renderOralAssessmentMarkdown(spec, { week: 4, launchUrl: 'https://r.edu/lti/launch', aiasLevel: 3 });
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('week: 4');
    expect(md).toContain('title: "Concept Check"');
    expect(md).toContain('prep_seconds: 30');
    expect(md).toContain('response_seconds: 120');
    expect(md).toContain('randomize_pick: 1');
    expect(md).toContain('randomize_of: 3');
    expect(md).toContain('attempts: "1"');
    expect(md).toContain('launch_url: "https://r.edu/lti/launch"');
    expect(md).toContain('aiasLevel: 3');
    expect(md).toContain('## What to expect');
    expect(md).toContain('Explain opportunity cost aloud.');
    expect(md).toContain('## Rubric');
    expect(md).toContain('## Criterion 1: Accuracy — 10 pts');
  });

  it('omits launch_url and aiasLevel when not provided', () => {
    const md = renderOralAssessmentMarkdown(spec, {});
    expect(md).not.toContain('launch_url');
    expect(md).not.toContain('aiasLevel');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/module-oral-assessment -- render_md`
Expected: FAIL — cannot find `../src/render_md.js`.

- [ ] **Step 3: Write `src/render_md.ts`**

```typescript
import type { AssessmentSpec } from './provider.js';

export interface PageFrontMatterOptions {
  week?: number;
  title?: string;
  launchUrl?: string | null;
  aiasLevel?: number;
}

export function renderOralAssessmentMarkdown(spec: AssessmentSpec, fm: PageFrontMatterOptions): string {
  const title = (fm.title ?? spec.title).replace(/"/g, '\\"');
  const lines: string[] = ['---'];
  if (typeof fm.week === 'number') lines.push(`week: ${fm.week}`);
  lines.push(`title: "${title}"`);
  lines.push('hero_image: ""');
  lines.push(`prep_seconds: ${spec.prepSeconds}`);
  lines.push(`response_seconds: ${spec.responseSeconds}`);
  lines.push(`randomize_pick: ${spec.randomization.pick}`);
  lines.push(`randomize_of: ${spec.randomization.of}`);
  lines.push(`attempts: "${spec.attempts}"`);
  if (fm.launchUrl) lines.push(`launch_url: "${fm.launchUrl}"`);
  if (typeof fm.aiasLevel === 'number') lines.push(`aiasLevel: ${fm.aiasLevel}`);
  lines.push('---', '');

  lines.push('## What to expect', '', spec.promptSummary, '');
  lines.push('## Rubric', '');
  spec.rubricCriteria.forEach((c, i) => {
    lines.push(`## Criterion ${i + 1}: ${c.name} — ${c.points} pts`, '', c.description, '');
  });
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/module-oral-assessment -- render_md`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-oral-assessment/src/render_md.ts packages/module-oral-assessment/tests/render_md.test.ts
git commit -m "feat(oral-assessment): page-type markdown renderer"
```

---

### Task 9: The `designOralAssessment` orchestrator

**Files:**
- Create: `packages/module-oral-assessment/src/design.ts`
- Test: `packages/module-oral-assessment/tests/design.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { designOralAssessment } from '../src/design.js';
import type { LlmClient, LlmResponse } from '@canvas-toolchain/shared-llm';

function fakeLlm(json: object): LlmClient & { calls: Array<{ system: string; user: string }> } {
  const calls: Array<{ system: string; user: string }> = [];
  return {
    calls,
    async complete(system: string, user: string): Promise<LlmResponse> {
      calls.push({ system, user });
      return { text: JSON.stringify(json), usage: { inputTokens: 10, outputTokens: 20 } };
    },
  };
}

const RESP = {
  title: 'Concept Check',
  promptSummary: 'Explain opportunity cost aloud.',
  questions: [{ prompt: 'What is opportunity cost?' }, { prompt: 'Give an example.' }, { prompt: 'Why does it matter?' }],
  rubricCriteria: [{ name: 'Accuracy', description: 'Correctness', points: 10 }],
};

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('designOralAssessment', () => {
  it('writes the page .md and the rhetorix sidecar, returns recommendation', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oa-design-'));
    const outputPath = join(dir, 'oral-assessment.md');
    const llm = fakeLlm(RESP);
    const result = await designOralAssessment(
      { assignmentBrief: 'Memo on pricing', week: 4, outputPath, launchDomain: 'rhetorixlab.example.edu', aiasLevel: 3 },
      { llm },
    );
    expect(existsSync(result.pagePath)).toBe(true);
    expect(existsSync(result.specPath)).toBe(true);
    expect(result.specPath.endsWith('.rhetorix.md')).toBe(true);
    expect(result.questionCount).toBe(3);
    expect(result.recommendation.toLowerCase()).toContain('rhetorix');

    const page = readFileSync(result.pagePath, 'utf-8');
    expect(page).toContain('launch_url: "https://rhetorixlab.example.edu/lti/launch"');
    expect(page).toContain('aiasLevel: 3');

    const sidecar = readFileSync(result.specPath, 'utf-8');
    expect(sidecar).toContain('paste into Rhetorix Lab');
    expect(sidecar).toContain('1. What is opportunity cost?');
  });

  it('rejects when neither brief nor topic+goal is provided', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oa-design-'));
    await expect(
      designOralAssessment({ outputPath: join(dir, 'x.md') }, { llm: fakeLlm(RESP) }),
    ).rejects.toThrow(/assignmentBrief.*or.*topic/i);
  });

  it('passes provider default timing into the spec when caller omits overrides', async () => {
    dir = mkdtempSync(join(tmpdir(), 'oa-design-'));
    const result = await designOralAssessment(
      { topic: 'X', learningGoal: 'Y', outputPath: join(dir, 'p.md') },
      { llm: fakeLlm(RESP) },
    );
    const page = readFileSync(result.pagePath, 'utf-8');
    expect(page).toContain('prep_seconds: 30');
    expect(page).toContain('response_seconds: 120');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/module-oral-assessment -- design`
Expected: FAIL — cannot find `../src/design.js`.

- [ ] **Step 3: Write `src/design.ts`**

```typescript
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve, basename, join } from 'node:path';
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import type { AssessmentSpec, AttemptsPolicy } from './provider.js';
import { resolveActiveOralAssessmentProvider } from './resolve.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
import { renderOralAssessmentMarkdown } from './render_md.js';
import { makeAnthropicLlm } from './llm.js';

export interface DesignOralAssessmentInput {
  assignmentBrief?: string;
  topic?: string;
  learningGoal?: string;
  courseContext?: string;
  questionCount?: number;
  prepSeconds?: number;
  responseSeconds?: number;
  attempts?: AttemptsPolicy;
  aiasLevel?: number;
  week?: number;
  title?: string;
  outputPath: string;
  launchDomain?: string;
  provider?: string;
}

export interface DesignOralAssessmentHooks {
  llm?: LlmClient;
}

export interface DesignOralAssessmentResult {
  pagePath: string;
  specPath: string;
  providerSpec: string;
  recommendation: string;
  questionCount: number;
  usage?: { inputTokens: number; outputTokens: number };
}

interface LlmAssessmentFields {
  title: string;
  promptSummary: string;
  questions: Array<{ prompt: string }>;
  rubricCriteria: Array<{ name: string; description: string; points: number }>;
}

function parseFields(text: string): LlmAssessmentFields {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const obj = JSON.parse(trimmed) as LlmAssessmentFields;
  if (!Array.isArray(obj.questions) || !Array.isArray(obj.rubricCriteria)) {
    throw new Error('LLM response missing questions/rubricCriteria.');
  }
  return obj;
}

export async function designOralAssessment(
  input: DesignOralAssessmentInput,
  hooks: DesignOralAssessmentHooks = {},
): Promise<DesignOralAssessmentResult> {
  const hasBrief = Boolean(input.assignmentBrief && input.assignmentBrief.trim());
  const hasTopic = Boolean(input.topic && input.learningGoal);
  if (!hasBrief && !hasTopic) {
    throw new Error('Provide either assignmentBrief, or topic + learningGoal.');
  }

  const provider = resolveActiveOralAssessmentProvider(input.provider);
  const intent = input.assignmentBrief ?? `${input.topic ?? ''} ${input.learningGoal ?? ''}`;
  const defaults = provider.defaults(intent);

  const llm = hooks.llm ?? makeAnthropicLlm();
  const response = await llm.complete(SYSTEM_PROMPT, buildUserPrompt(input), { maxTokens: 2048 });
  const fields = parseFields(response.text);

  const spec: AssessmentSpec = {
    title: input.title ?? fields.title,
    promptSummary: fields.promptSummary,
    questions: fields.questions,
    prepSeconds: input.prepSeconds ?? defaults.prepSeconds,
    responseSeconds: input.responseSeconds ?? defaults.responseSeconds,
    randomization: { pick: defaults.randomization.pick, of: input.questionCount ?? fields.questions.length },
    attempts: input.attempts ?? defaults.attempts,
    rubricCriteria: fields.rubricCriteria,
  };

  const launchUrl = provider.buildLaunchUrl(input.launchDomain);
  const md = renderOralAssessmentMarkdown(spec, {
    week: input.week,
    title: input.title,
    launchUrl,
    aiasLevel: input.aiasLevel,
  });

  const pagePath = resolve(input.outputPath);
  mkdirSync(dirname(pagePath), { recursive: true });
  if (existsSync(pagePath)) copyFileSync(pagePath, `${pagePath}.bak`);
  writeFileSync(pagePath, md, 'utf-8');

  const providerSpec = provider.formatAssessment(spec);
  const base = basename(pagePath).replace(/\.md$/, '');
  const specPath = join(dirname(pagePath), `${base}.${provider.id}.md`);
  writeFileSync(specPath, providerSpec, 'utf-8');

  return {
    pagePath,
    specPath,
    providerSpec,
    recommendation: provider.recommendation(),
    questionCount: spec.questions.length,
    usage: response.usage,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/module-oral-assessment -- design`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add packages/module-oral-assessment/src/design.ts packages/module-oral-assessment/tests/design.test.ts
git commit -m "feat(oral-assessment): design orchestrator (brief|topic -> page + sidecar)"
```

---

## PHASE 3 — Module tool + export

### Task 10: `design_oral_assessment` ModuleTool

**Files:**
- Create: `packages/module-oral-assessment/src/tools.ts`
- Test: `packages/module-oral-assessment/tests/tools.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { oralAssessmentTools } from '../src/tools.js';

describe('oralAssessmentTools', () => {
  it('exposes design_oral_assessment with a required outputPath', () => {
    const t = oralAssessmentTools.find((x) => x.schema.name === 'design_oral_assessment');
    expect(t).toBeDefined();
    const schema = t!.schema.inputSchema as { required?: string[]; properties: Record<string, unknown> };
    expect(schema.required).toContain('outputPath');
    expect(schema.properties.assignmentBrief).toBeDefined();
    expect(schema.properties.topic).toBeDefined();
    expect(schema.properties.learningGoal).toBeDefined();
    expect(typeof t!.handler).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/module-oral-assessment -- tools`
Expected: FAIL — cannot find `../src/tools.js`.

- [ ] **Step 3: Write `src/tools.ts`**

```typescript
import type { ModuleTool } from '@canvas-toolchain/module-contract';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { designOralAssessment, type DesignOralAssessmentInput } from './design.js';

const text = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }] });

const designTool: ModuleTool = {
  schema: {
    name: 'design_oral_assessment',
    description:
      'Design an oral/video assessment (recommended provider: Rhetorix Lab) from an ' +
      'assignment brief OR a topic + learning goal. Writes a CDS oral-assessment page ' +
      '(.md, rendered by generate_course) and a paste-ready provider spec sidecar, and ' +
      'returns the "why Rhetorix" rationale. Run setup_anthropic first.',
    inputSchema: {
      type: 'object' as const,
      required: ['outputPath'],
      properties: {
        assignmentBrief: { type: 'string', description: 'Mode A: the assignment to turn into an oral assessment.' },
        topic: { type: 'string', description: 'Mode B: topic the assessment should cover (with learningGoal).' },
        learningGoal: { type: 'string', description: 'Mode B: what students should be able to do.' },
        courseContext: { type: 'string', description: 'Optional course title/level/modality for tone.' },
        questionCount: { type: 'number', description: 'Randomization pool size. Default 3.' },
        prepSeconds: { type: 'number', description: 'Override prep time.' },
        responseSeconds: { type: 'number', description: 'Override response limit.' },
        attempts: { description: 'Override attempts policy: a number or "unlimited".' },
        aiasLevel: { type: 'number', description: 'AI Assessment Scale level (1-5) for the page callout.' },
        week: { type: 'number', description: 'Front matter: week number.' },
        title: { type: 'string', description: 'Front matter: page title override.' },
        outputPath: { type: 'string', description: 'Absolute path to write the page .md.' },
        launchDomain: { type: 'string', description: 'Institution Rhetorix domain, e.g. rhetorixlab.example.edu.' },
        provider: { type: 'string', description: 'Provider id. Default "rhetorix".' },
      },
    },
  },
  handler: async (args) => {
    const result = await designOralAssessment(args as DesignOralAssessmentInput);
    return text(JSON.stringify(result, null, 2));
  },
};

export const oralAssessmentTools: ModuleTool[] = [designTool];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/module-oral-assessment -- tools`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-oral-assessment/src/tools.ts packages/module-oral-assessment/tests/tools.test.ts
git commit -m "feat(oral-assessment): design_oral_assessment ModuleTool"
```

---

### Task 11: Module default export + contract

**Files:**
- Create: `packages/module-oral-assessment/src/index.ts`
- Test: `packages/module-oral-assessment/tests/module.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { isCanvasToolchainModule } from '@canvas-toolchain/module-contract';
import mod from '../src/index.js';

describe('oral-assessment module', () => {
  it('satisfies the module contract', () => {
    expect(isCanvasToolchainModule(mod)).toBe(true);
  });
  it('has the expected identity and handles rhetorix', () => {
    expect(mod.id).toBe('oral-assessment');
    expect(mod.name).toBe('Oral Assessment');
    expect(mod.handles).toContain('rhetorix');
    expect(mod.tools.map((t) => t.schema.name)).toContain('design_oral_assessment');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/module-oral-assessment -- module`
Expected: FAIL — cannot find `../src/index.js`.

- [ ] **Step 3: Write `src/index.ts`**

```typescript
import type { CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { oralAssessmentTools } from './tools.js';

export const MODULE_ID = 'oral-assessment';

const oralAssessmentModule: CanvasToolchainModule = {
  id: MODULE_ID,
  name: 'Oral Assessment',
  description:
    'Author oral/video assessments and a Canvas wrapper page. Recommended provider: ' +
    'Rhetorix Lab (AI-resilient async video, native Canvas grade passback via LTI).',
  version: '1.0.0',
  handles: ['rhetorix'],
  tools: oralAssessmentTools,
};

export default oralAssessmentModule;

export { resolveActiveOralAssessmentProvider } from './resolve.js';
export { RhetorixProvider } from './providers/rhetorix.js';
export type { OralAssessmentProvider, AssessmentSpec } from './provider.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/module-oral-assessment -- module`
Expected: PASS.

- [ ] **Step 5: Build the package**

Run: `npm run build --workspace=packages/module-oral-assessment`
Expected: tsc completes with no errors; `dist/` is produced.

- [ ] **Step 6: Commit**

```bash
git add packages/module-oral-assessment/src/index.ts packages/module-oral-assessment/tests/module.test.ts
git commit -m "feat(oral-assessment): module default export + contract test"
```

---

## PHASE 4 — Command & Control wiring

### Task 12: Register the module + dependency

**Files:**
- Modify: `packages/command-and-control/package.json`
- Modify: `packages/command-and-control/src/modules/registry.ts`
- Test: `packages/command-and-control/tests/modules/registry.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test (extend the registry suite)**

Add to `packages/command-and-control/tests/modules/registry.test.ts`:

```typescript
import { knownModuleIds } from '../../src/modules/registry.js';

describe('oral-assessment is a known module', () => {
  it('appears in knownModuleIds', () => {
    expect(knownModuleIds()).toContain('oral-assessment');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/command-and-control -- registry`
Expected: FAIL — `knownModuleIds()` does not include `oral-assessment`.

- [ ] **Step 3: Add the dependency in `packages/command-and-control/package.json`**

In the `"dependencies"` block, after the `@canvas-toolchain/module-video` line, add:

```json
    "@canvas-toolchain/module-oral-assessment": "*",
```

- [ ] **Step 4: Register in `packages/command-and-control/src/modules/registry.ts`**

Change the `KNOWN_MODULES` map to:

```typescript
export const KNOWN_MODULES: Record<string, () => Promise<CanvasToolchainModule>> = {
  video: async () => (await import('@canvas-toolchain/module-video')).default,
  'oral-assessment': async () => (await import('@canvas-toolchain/module-oral-assessment')).default,
};
```

- [ ] **Step 5: Re-link workspaces and run the test**

Run: `npm install` then `npm test --workspace=packages/command-and-control -- registry`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/package.json packages/command-and-control/src/modules/registry.ts packages/command-and-control/tests/modules/registry.test.ts
git commit -m "feat(oral-assessment): register module in C&C registry"
```

---

### Task 13: Catalog entry (#76 discovery)

**Files:**
- Modify: `packages/command-and-control/data/known-tools.yaml`
- Test: `packages/command-and-control/tests/...` (add a small catalog test next to the existing tool-discovery tests; locate the catalog-loading test file first)

- [ ] **Step 1: Write the failing test**

Locate the existing catalog/discovery test (search for `known-tools` under `packages/command-and-control/tests/`) and add:

```typescript
it('catalog lists rhetorix mapped to the oral-assessment module', () => {
  const cat = loadKnownTools(); // use the same loader the discovery code uses
  const rhetorix = cat.find((t) => t.id === 'rhetorix');
  expect(rhetorix).toBeDefined();
  expect(rhetorix!.module).toBe('oral-assessment');
});
```

If the discovery tests import a specific loader (e.g. `readKnownToolsCatalog`), use that exact symbol and shape instead.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/command-and-control -- known-tools`
Expected: FAIL — no `rhetorix` entry.

- [ ] **Step 3: Add the entry to `packages/command-and-control/data/known-tools.yaml`**

Append under `tools:`:

```yaml
  - id: rhetorix
    name: Rhetorix Lab
    identifiers: [rhetorix, rhetorix lab, rhetorixlab, rhetorixlab.io, rhetorixlab.example.edu]
    module: oral-assessment
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/command-and-control -- known-tools`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/data/known-tools.yaml packages/command-and-control/tests
git commit -m "feat(oral-assessment): catalog Rhetorix as the oral-assessment tool (#76)"
```

---

## PHASE 5 — CDS `oral-assessment` page type

### Task 14: Register the page type

**Files:**
- Modify: `packages/canvas-design-studio/src/course-types.ts`
- Test: `packages/canvas-design-studio/tests/course-types.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { PAGE_TYPES, PAGE_TYPE_LABELS } from '../src/course-types.js';

describe('oral-assessment page type', () => {
  it('is a registered page type with a label', () => {
    expect((PAGE_TYPES as readonly string[]).includes('oral-assessment')).toBe(true);
    expect(PAGE_TYPE_LABELS['oral-assessment']).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- course-types`
Expected: FAIL — `'oral-assessment'` not in `PAGE_TYPES`.

- [ ] **Step 3: Edit `course-types.ts`**

Add `'oral-assessment'` to the `PAGE_TYPES` array (before `'custom'`), and add to `PAGE_TYPE_LABELS`:

```typescript
  'oral-assessment': 'Oral Assessment (video oral-exam wrapper page + launch link)',
```

Then add the optional field to the `CourseConfig` interface:

```typescript
  oralAssessmentLaunchDomain?: string;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/canvas-design-studio -- course-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/course-types.ts packages/canvas-design-studio/tests/course-types.test.ts
git commit -m "feat(oral-assessment): register CDS oral-assessment page type"
```

---

### Task 15: Parse the launch domain from course-config

**Files:**
- Modify: `packages/canvas-design-studio/src/tools/course-config.ts`
- Test: `packages/canvas-design-studio/tests/tools/course-config.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test**

```typescript
it('reads oral_assessment_launch_domain when present', () => {
  // Write a temp course-config.md with `oral_assessment_launch_domain: rhetorixlab.example.edu`
  // in the front matter, then:
  const cfg = parseCourseConfig(tmpConfigPath);
  expect(cfg.oralAssessmentLaunchDomain).toBe('rhetorixlab.example.edu');
});
```

Use the suite's existing temp-config helper for the fixture; mirror how an existing field (e.g. `institution`) is tested.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- course-config`
Expected: FAIL — `oralAssessmentLaunchDomain` is `undefined`.

- [ ] **Step 3: Edit `course-config.ts`**

In the object returned by `parseCourseConfig`, add:

```typescript
    oralAssessmentLaunchDomain:
      typeof fm.oral_assessment_launch_domain === 'string' && fm.oral_assessment_launch_domain.trim()
        ? String(fm.oral_assessment_launch_domain).trim()
        : undefined,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/canvas-design-studio -- course-config`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/course-config.ts packages/canvas-design-studio/tests/tools/course-config.test.ts
git commit -m "feat(oral-assessment): parse oral_assessment_launch_domain from course-config"
```

---

### Task 16: Front-matter extractor

**Files:**
- Create: `packages/canvas-design-studio/src/tools/extract_oral_assessment.ts`
- Test: `packages/canvas-design-studio/tests/tools/extract_oral_assessment.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractOralAssessmentFromFile } from '../../src/tools/extract_oral_assessment.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('extractOralAssessmentFromFile', () => {
  it('reads flat timing + randomization + launch_url fields', () => {
    dir = mkdtempSync(join(tmpdir(), 'oa-extract-'));
    const p = join(dir, 'oral-assessment.md');
    writeFileSync(p, [
      '---', 'prep_seconds: 30', 'response_seconds: 120',
      'randomize_pick: 1', 'randomize_of: 3', 'attempts: "1"',
      'launch_url: "https://r.edu/lti/launch"', '---', '', '## What to expect', 'Speak.',
    ].join('\n'));
    const oa = extractOralAssessmentFromFile(p);
    expect(oa).toEqual({
      prepSeconds: 30, responseSeconds: 120,
      randomization: { pick: 1, of: 3 }, attempts: '1',
      launchUrl: 'https://r.edu/lti/launch',
    });
  });

  it('returns undefined when timing fields are absent', () => {
    dir = mkdtempSync(join(tmpdir(), 'oa-extract-'));
    const p = join(dir, 'x.md');
    writeFileSync(p, '---\ntitle: "X"\n---\nbody');
    expect(extractOralAssessmentFromFile(p)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- extract_oral_assessment`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `extract_oral_assessment.ts`** (mirror `extract_aias.ts`)

```typescript
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

const FM_PATTERN = /^---\n([\s\S]*?)\n---/;

export interface PageOralAssessment {
  prepSeconds: number;
  responseSeconds: number;
  randomization: { pick: number; of: number };
  attempts: string;
  launchUrl?: string;
}

export function extractOralAssessmentFromFile(mdPath: string): PageOralAssessment | undefined {
  const raw = readFileSync(mdPath, 'utf-8');
  const m = raw.match(FM_PATTERN);
  if (!m) return undefined;
  let parsed: unknown;
  try {
    parsed = parseYaml(m[1]);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const o = parsed as Record<string, unknown>;
  if (typeof o.prep_seconds !== 'number' || typeof o.response_seconds !== 'number') return undefined;
  const pick = typeof o.randomize_pick === 'number' ? o.randomize_pick : 1;
  const of = typeof o.randomize_of === 'number' ? o.randomize_of : 1;
  const result: PageOralAssessment = {
    prepSeconds: o.prep_seconds,
    responseSeconds: o.response_seconds,
    randomization: { pick, of },
    attempts: String(o.attempts ?? '1'),
  };
  if (typeof o.launch_url === 'string' && o.launch_url.length > 0) result.launchUrl = o.launch_url;
  return result;
}
```

> Confirm the YAML import style matches the other extractors (`extract_aias.ts` / `extract_tiers.ts` use `parse as parseYaml` from `yaml`); match it exactly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/canvas-design-studio -- extract_oral_assessment`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/extract_oral_assessment.ts packages/canvas-design-studio/tests/tools/extract_oral_assessment.test.ts
git commit -m "feat(oral-assessment): CDS front-matter extractor"
```

---

### Task 17: The page renderer + dispatch

**Files:**
- Modify: `packages/canvas-design-studio/src/tools/course-templates.ts`
- Test: `packages/canvas-design-studio/tests/tools/render-oral-assessment.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { renderPage } from '../../src/tools/course-templates.js';
import type { PageContent, CourseConfig } from '../../src/course-types.js';

const cfg = {
  institution: 'Example U', courseName: 'X', courseNumber: '101', professor: 'Dr. Smith',
  semester: 'Fall 2026', weeks: 16, pageTypes: ['oral-assessment'], layoutFixed: true,
  colors: { primary: '#0033A0', primaryDark: '#001F60', primaryLight: '#E6ECF9', secondary: '#F18F01' },
  heroImages: {}, weekOutline: [],
} as unknown as CourseConfig;

const content = {
  pageType: 'oral-assessment',
  frontMatter: { week: 4, title: 'Concept Check', prep_seconds: 30, response_seconds: 120, randomize_pick: 1, randomize_of: 3, attempts: '1', launch_url: 'https://r.edu/lti/launch' },
  sections: { 'What to expect': 'Explain opportunity cost aloud.' },
} as unknown as PageContent;

describe('renderPage(oral-assessment)', () => {
  it('renders a what-to-expect card, timing, and a launch button', () => {
    const html = renderPage(content, cfg);
    expect(html).toContain('What to expect');
    expect(html).toContain('Explain opportunity cost aloud.');
    expect(html).toContain('2:00');           // response time formatted
    expect(html).toContain('1 of 3');          // randomization
    expect(html.toLowerCase()).toContain('launch');
    expect(html).toContain('https://r.edu/lti/launch');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- render-oral-assessment`
Expected: FAIL — `renderPage` falls through to the template registry and throws / omits the launch button.

- [ ] **Step 3: Add the renderer + dispatch in `course-templates.ts`**

Add a dispatch branch in `renderPage`, immediately after the existing `rubric` branch:

```typescript
  if (content.pageType === 'oral-assessment') {
    return renderOralAssessment(content, config);
  }
```

Then add the renderer function (reuse the file's existing `wrap`, `heroHtml`, `card`, `callout`, `escapeHtml`, `markdownToHtml`, `sectionHeading` helpers — match their real names in this file):

```typescript
function renderOralAssessment(c: PageContent, cfg: CourseConfig): string {
  const fm = c.frontMatter as Record<string, unknown>;
  const week = typeof fm.week === 'number' ? fm.week : undefined;
  const title = typeof fm.title === 'string' ? fm.title : 'Oral Assessment';
  const prep = typeof fm.prep_seconds === 'number' ? fm.prep_seconds : 0;
  const resp = typeof fm.response_seconds === 'number' ? fm.response_seconds : 0;
  const pick = typeof fm.randomize_pick === 'number' ? fm.randomize_pick : 1;
  const of = typeof fm.randomize_of === 'number' ? fm.randomize_of : 1;
  const attempts = String(fm.attempts ?? '1');
  const launchUrl = typeof fm.launch_url === 'string' ? fm.launch_url : '';
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const summary = c.sections['What to expect'] ?? c.sections['What to Expect'] ?? '';

  const whatToExpect = card(
    sectionHeading('What to expect') +
    `<div style="font-family: Lato, sans-serif; font-size:15px; line-height:1.7; color:#1A1A1A;">${markdownToHtml(summary)}</div>` +
    `<ul style="font-family: Lato, sans-serif; font-size:14px; color:#555550; margin:12px 0 0; padding-left:1.25em;">` +
    `<li>Prep time: ${prep}s</li>` +
    `<li>Response limit: ${mmss(resp)}</li>` +
    `<li>You will answer ${pick} of ${of} question(s)</li>` +
    `<li>Attempts: ${escapeHtml(attempts)}</li>` +
    `</ul>`,
  );

  const launch = launchUrl
    ? `<div style="margin:1.5em 0;"><a href="${escapeHtml(launchUrl)}" style="display:inline-block; background:${cfg.colors.primary}; color:#fff; font-family: Lato, sans-serif; font-weight:700; padding:12px 24px; border-radius:6px; text-decoration:none;">Launch the assessment</a></div>`
    : `<p style="font-family: Lato, sans-serif; font-size:14px; color:#854F0B;"><em>Launch link will appear here once your institution's assessment tool is linked in Canvas.</em></p>`;

  return wrap([
    heroHtml(cfg, 'oral-assessment', week, title, '', typeof fm.hero_image === 'string' ? fm.hero_image : undefined),
    whatToExpect,
    launch,
  ]);
}
```

> Match each helper's real signature in `course-templates.ts` (the explore notes show `renderRubric` using `wrap`, `heroHtml`, `card`, `callout`, `sectionHeading`, `escapeHtml`, `markdownToHtml`). If `heroHtml`'s arity differs, adapt the call.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/canvas-design-studio -- render-oral-assessment`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/course-templates.ts packages/canvas-design-studio/tests/tools/render-oral-assessment.test.ts
git commit -m "feat(oral-assessment): CDS page renderer + dispatch"
```

---

### Task 18: Wire AIAS + rubric eligibility into generate-page

**Files:**
- Modify: `packages/canvas-design-studio/src/tools/generate-page.ts`
- Test: `packages/canvas-design-studio/tests/tools/generate-page.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test**

```typescript
it('renders the AIAS callout on an oral-assessment page when aiasLevel is set', () => {
  // Fixture: a course folder with course-config.md and a week-04/oral-assessment.md
  // whose front matter has aiasLevel: 3 and the oral-assessment timing fields.
  const { html } = generatePage({ mdPath: oralMdPath, courseDir });
  expect(html).toContain('AI Use Policy');     // from renderAiasCallout
  expect(html).toContain('Launch the assessment');
});
```

Build the fixture the way the existing generate-page tests do (look for an existing rubric/assignment fixture helper and copy it).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- generate-page`
Expected: FAIL — AIAS callout absent (oral-assessment not in the eligibility check).

- [ ] **Step 3: Edit `generate-page.ts`**

Update the AIAS eligibility line (currently `pageType === 'assignment' || pageType === 'rubric'`) to include the new type:

```typescript
const isAiasEligible =
  pageType === 'assignment' || pageType === 'rubric' || pageType === 'oral-assessment';
```

(Leave CLO/TLDR eligibility unchanged unless the test requires it — the spec only calls for AIAS reuse on this page type.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/canvas-design-studio -- generate-page`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/generate-page.ts packages/canvas-design-studio/tests/tools/generate-page.test.ts
git commit -m "feat(oral-assessment): AIAS callout on oral-assessment pages"
```

---

## PHASE 6 — Integration verification

### Task 19: Whole-repo build + test + smoke

**Files:** none (verification only)

- [ ] **Step 1: Build every package**

Run: `npm run build`
Expected: all packages compile, including `module-oral-assessment`. If the root build script enumerates packages explicitly, confirm `module-oral-assessment` is included (the module-architecture work fixed a similar omission for module-contract/module-video — check `package.json` root `build` script and add the new package if needed).

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all packages green, including the new `module-oral-assessment` suites and the extended C&C/CDS suites. Zero regressions.

- [ ] **Step 3: Run the C&C integration smoke**

Run: `npm run smoke:integration --workspace=packages/command-and-control`
Expected: exit 0.

- [ ] **Step 4: Manual module-enable sanity (optional, documented)**

In a scratch `CC_HOME`, enable the module and confirm `list_modules` reports it:

```bash
# set_module_enabled { module: "oral-assessment", enabled: true }
# list_modules  -> oral-assessment present, handles ["rhetorix"]
```

- [ ] **Step 5: Commit any build-script fix**

```bash
git add package.json
git commit -m "build: include module-oral-assessment in root build"
```

(Skip if no root-script change was needed.)

---

## Self-review notes (already reconciled against the spec)

- **§2 deliverables** → page `.md` (Task 8/9/17/18) + paste-ready sidecar (Task 4/9). ✓
- **§3 D3/D4** capability seam + Rhetorix recommended/default → Tasks 2/3/5/11/13. ✓
- **§4.3 no creds** → no `setup_*`; only `launchDomain` (Task 9) / `oral_assessment_launch_domain` (Task 15). ✓
- **§5 page type** → Tasks 14–18. ✓
- **§6 two-mode tool** → Tasks 7/9/10. ✓
- **§7 defaults** → Task 3. ✓
- **§8 recommendation mechanics** → Tasks 3/11 (rationale + default), 13 (catalog). ✓
- **§9 deferred** → no results ingestion / 2nd provider / LTI auto-placement tasks present. ✓
- **§10 hermetic TDD** → every LLM test injects a fake `LlmClient`. ✓

**Open confirmations for the implementer (resolve while coding, not blockers):**
1. `AnthropicLlmClient` constructor signature in `@canvas-toolchain/shared-llm` (Task 6 note).
2. Exact helper names/arity in `course-templates.ts` (`heroHtml`, `card`, etc.) (Task 17 note).
3. The known-tools catalog loader symbol used by the discovery tests (Task 13).
4. Root `build` script enumeration of packages (Task 19).
