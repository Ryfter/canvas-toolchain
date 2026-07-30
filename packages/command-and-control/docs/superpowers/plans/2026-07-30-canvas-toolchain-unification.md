# Canvas Toolchain Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npx canvas-toolchain` works everywhere (in-repo and from the npm registry), the product is named **Canvas Toolchain** consistently, shipped strings are model-agnostic, and the institution scrub is restored and CI-guarded — shipping as v2.2.0.

**Architecture:** npm-workspaces monorepo (13 packages) + Go/Fyne installer. The three unscoped packages move into the `@canvas-toolchain/` scope (directories unchanged); a tiny new `packages/canvas-toolchain` workspace owns the unscoped npx name and launches the Command & Control server; the monorepo root gains `prepare` so `npm install` auto-builds; a tag-triggered workflow publishes all packages with provenance.

**Tech Stack:** TypeScript (ESM, `dist/` builds), vitest 2, Node ≥20, Go 1.25/Fyne (installer), GitHub Actions.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-07-30-canvas-toolchain-unification-design.md`

## Global Constraints

- Branch: `feat/canvas-toolchain-unification` (already exists, spec committed). Commit per task; PR to `main` at the end. Never push tags in this plan.
- Package renames: `canvas-design-mcp` → `@canvas-toolchain/canvas-design-studio`, `curriculum-intelligence-mcp` → `@canvas-toolchain/curriculum-intelligence`, `command-and-control-mcp` → `@canvas-toolchain/command-and-control`. **Directory names never change.**
- All package versions lock to **2.2.0** (root monorepo too).
- **Do NOT change**: the data-dir name `~/.canvas-design-mcp` / `CANVAS_DESIGN_HOME` (existing installs depend on it), the Anthropic provider adapter, provider model IDs (e.g. `claude-haiku-4-5-20251001` in installer `configs.go` — that is an API model setting), harness files (`CLAUDE.md`, `AGENTS.md` structure, `GEMINI.md`), frozen docs under `docs/superpowers/` except the specific institution-string edits in Task 1.
- Public repo: zero institution identifiers. Placeholders are `example.edu` / `example.instructure.com`. Product names "Rhetorix" / "Rhetorix Lab" are NOT institution identifiers — keep them.
- MCP stdio discipline: nothing the launcher or server writes to **stdout** except protocol JSON; human messages go to stderr.
- Windows dev box: shell steps below are Git Bash (POSIX) unless marked PowerShell. `sed -i` is GNU sed (available in Git Bash).
- Verification floor before the PR: root `npm run build` exit 0, root `npm test` green, `npm run smoke:integration --workspace=packages/command-and-control` green, `node scripts/check-institution-scrub.mjs` green, `cd installer && go vet ./... && go test ./...` green.

---

### Task 1: Institution scrub guard (red → scrub → green)

**Files:**
- Create: `scripts/check-institution-scrub.mjs`
- Modify: `packages/module-peerassessment/src/build.ts:8-9`, `docs/architecture-modules.md`, `AGENTS.md`, `.github/RELEASE_TEMPLATE/installer-release.md`, `packages/command-and-control/docs/superpowers/specs/2026-06-12-oral-assessment-module-design.md`, `packages/command-and-control/docs/superpowers/specs/2026-06-14-peerassessment-export-design.md`, `packages/command-and-control/docs/superpowers/plans/2026-06-14-peerassessment-export-module.md`
- Modify: `.github/workflows/ci.yml` (add guard step)
- Test: the guard script itself is the test (must FAIL before the scrub, PASS after)

**Interfaces:**
- Produces: `node scripts/check-institution-scrub.mjs` — exit 0 = clean, exit 1 with `file:line: matched-text` listing. CI invokes it verbatim.

- [ ] **Step 1: Write the guard script**

```js
#!/usr/bin/env node
// check-institution-scrub.mjs — fails the build if institution identifiers
// re-enter the public tree. Lines that are themselves grep/guard commands
// (historical plan docs quoting the rule) are exempt; so is this script.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERN = /boise|(?<![\w@])bsu(?![\w])/i;
const LINE_EXEMPT = /\bgr[e]p\b|check-institution-scrub/i; // guard cmds quoting the rule
const FILE_SKIP = /^(package-lock\.json|scripts\/check-institution-scrub\.mjs)$|\.(png|svg|ico|pkg|exe|excalidraw)$/;

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => !FILE_SKIP.test(f));

const hits = [];
for (const file of files) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  if (text.includes('\u0000')) continue; // binary
  text.split('\n').forEach((line, i) => {
    if (PATTERN.test(line) && !LINE_EXEMPT.test(line)) {
      hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
}

if (hits.length) {
  console.error(`Institution scrub FAILED — ${hits.length} hit(s):`);
  for (const h of hits) console.error('  ' + h);
  process.exit(1);
}
console.log(`Institution scrub clean (${files.length} files checked).`);
```

- [ ] **Step 2: Run it — must FAIL (red)**

Run: `node scripts/check-institution-scrub.mjs`
Expected: exit 1 listing at minimum `packages/module-peerassessment/src/build.ts`, `AGENTS.md`, `docs/architecture-modules.md`, `.github/RELEASE_TEMPLATE/installer-release.md`, and the two 2026-06-1x spec/plan docs. If it lists MORE files than the spec named, scrub those too in Step 3 by the same rules.

- [ ] **Step 3: Scrub every hit**

Exact replacements (adjust surrounding prose so sentences read naturally; these are the canonical rewrites):

| Location | Old | New |
| --- | --- | --- |
| `packages/module-peerassessment/src/build.ts:9` | `'PeerAssessment.com is BSU-approved; this file contains student PII (name, email, login, student ID). Handle per FERPA.'` | `'PeerAssessment.com is institution-approved; this file contains student PII (name, email, login, student ID). Handle per FERPA.'` |
| `AGENTS.md:104` | `**BSU has an institutional contract** with the vendor` | `**the institution holds a contract** with the vendor` |
| `docs/architecture-modules.md:275` | `a BSU-contracted, FERPA-approved vendor` | `an institution-contracted, FERPA-approved vendor` |
| `.github/RELEASE_TEMPLATE/installer-release.md:199` | `a BSU-contracted, FERPA-approved vendor` | `an institution-contracted, FERPA-approved vendor` |
| oral-assessment spec:15 | `Built by a Boise State professor; \`rhetorixlab.example.edu\` is the BSU deployment` | `Built by a university professor; \`rhetorixlab.example.edu\` is the institutional deployment` |
| oral-assessment spec:17 | `**The decisive finding (BSU instructor resources page).**` | `**The decisive finding (the university's instructor-resources page).**` |
| peerassessment spec:25 & :98, plan:1135 | `BSU-approved` / `PeerAssessment.com is BSU-approved` | `institution-approved` (same sentence shape as build.ts) |

- [ ] **Step 4: Run guard — must PASS (green)**

Run: `node scripts/check-institution-scrub.mjs`
Expected: `Institution scrub clean (...)`. Also run the peerassessment package tests (a test may assert the FERPA note text): `npx vitest run --root packages/module-peerassessment`. If a test asserts the old string, update the assertion to the new string.

- [ ] **Step 5: Wire into CI**

In `.github/workflows/ci.yml`, in the `typescript` job, insert immediately after the `Install dependencies` step:

```yaml
      - name: Institution scrub guard
        run: node scripts/check-institution-scrub.mjs
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(scrub): re-genericize institution strings; add CI scrub guard"
```

---

### Task 2: Scope renames + import rewrite

**Files:**
- Modify: `packages/canvas-design-studio/package.json`, `packages/curriculum-intelligence/package.json`, `packages/command-and-control/package.json` (names, deps)
- Modify: every consumer package.json listing the old names (`packages/command-and-control/package.json` deps; check others)
- Modify: ~56 TS files importing `canvas-design-mcp/dist/…` or `curriculum-intelligence-mcp/dist/…`
- Test: full `npm run build` + `npm test`

**Interfaces:**
- Produces: package names `@canvas-toolchain/canvas-design-studio`, `@canvas-toolchain/curriculum-intelligence`, `@canvas-toolchain/command-and-control`. Bins: `canvas-toolchain-design-studio` (CDS), `canvas-toolchain-curriculum-intelligence` (CI), `canvas-toolchain-server` + `canvas-toolchain-dashboard` (C&C). Later tasks (launcher, wizard, docs) rely on these exact names.

- [ ] **Step 1: Rename the three packages and their bins**

```bash
npm pkg set name="@canvas-toolchain/canvas-design-studio" --prefix packages/canvas-design-studio
npm pkg set name="@canvas-toolchain/curriculum-intelligence" --prefix packages/curriculum-intelligence
npm pkg set name="@canvas-toolchain/command-and-control" --prefix packages/command-and-control
# bins: one product prefix everywhere
npm pkg delete bin.canvas-design-mcp --prefix packages/canvas-design-studio
npm pkg set bin.canvas-toolchain-design-studio="dist/index.js" --prefix packages/canvas-design-studio
npm pkg delete bin.curriculum-intelligence-mcp --prefix packages/curriculum-intelligence
npm pkg set bin.canvas-toolchain-curriculum-intelligence="dist/index.js" --prefix packages/curriculum-intelligence
npm pkg delete bin.command-and-control-mcp --prefix packages/command-and-control
npm pkg set bin.canvas-toolchain-server="dist/index.js" --prefix packages/command-and-control
```

- [ ] **Step 2: Rewrite dependency references and imports**

```bash
# package.json deps (C&C depends on both; sweep all manifests to be safe)
git grep -l '"canvas-design-mcp"\|"curriculum-intelligence-mcp"' -- 'packages/*/package.json' \
  | xargs sed -i 's#"canvas-design-mcp"#"@canvas-toolchain/canvas-design-studio"#g; s#"curriculum-intelligence-mcp"#"@canvas-toolchain/curriculum-intelligence"#g'
# TS/JS imports (src, tests, scripts)
git grep -lE "canvas-design-mcp/|curriculum-intelligence-mcp/" -- 'packages' 'scripts' ':!*.md' \
  | xargs sed -i "s#canvas-design-mcp/#@canvas-toolchain/canvas-design-studio/#g; s#curriculum-intelligence-mcp/#@canvas-toolchain/curriculum-intelligence/#g"
```

- [ ] **Step 3: Straggler audit**

Run: `git grep -nE "canvas-design-mcp|curriculum-intelligence-mcp|command-and-control-mcp" -- ':!*.md' ':!package-lock.json'`
Expected remaining hits ONLY: the `~/.canvas-design-mcp` home-dir literal and `CANVAS_DESIGN_HOME` fallback in `packages/command-and-control/src/lib/kb-bridge.ts` (+ any other data-dir literals). Those stay. Anything else (vitest configs, module build scripts, smoke scripts) gets the same rename by hand. Markdown/docs references are handled in Task 8.

- [ ] **Step 4: Reinstall links, build, test**

```bash
npm install          # refreshes workspace links + lockfile for the new names
npm run build
npm test
```
Expected: build exit 0; full suite green. Typical failure mode: a test importing an old deep path — fix with the same substitution.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(naming): move unscoped packages into @canvas-toolchain scope; unify bin names"
```

---

### Task 3: Version lockstep 2.2.0 + publish metadata + server identity

**Files:**
- Modify: all 13 `packages/*/package.json` + root `package.json` (version, files, publishConfig, repository, license)
- Modify: `packages/command-and-control/src/index.ts:94-97`, `packages/canvas-design-studio/src/index.ts:69`, `packages/curriculum-intelligence/src/index.ts` (Server registration block)
- Test: `packages/command-and-control/tests/server_identity.test.ts` (new)

**Interfaces:**
- Produces: every package `"version": "2.2.0"`, `"license": "MIT"`, `"publishConfig": {"access": "public"}`, `"files": ["dist"]` (+ package-specific runtime assets), `"repository": {"type": "git", "url": "git+https://github.com/Ryfter/canvas-toolchain.git", "directory": "packages/<dir>"}`. C&C MCP server registers as **`canvas-toolchain`** with the version read from its package.json.

- [ ] **Step 1: Failing test for server identity**

Create `packages/command-and-control/tests/server_identity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('server identity', () => {
  it('registers as canvas-toolchain at the package version', () => {
    const src = readFileSync(join(pkgDir, 'src', 'index.ts'), 'utf8');
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    expect(src).toContain("name: 'canvas-toolchain'");
    expect(src).not.toContain("name: 'command-and-control'");
    expect(src).toContain('pkg.version'); // version comes from package.json, not a literal
    expect(pkg.version).toBe('2.2.0');
  });
});
```

Run: `npx vitest run tests/server_identity.test.ts --root packages/command-and-control` → Expected: FAIL (name still `command-and-control`, version still 1.0.0).

- [ ] **Step 2: Set versions + publish metadata everywhere**

```bash
npm pkg set version=2.2.0
npm pkg set version=2.2.0 --workspaces
npm pkg set license=MIT publishConfig.access=public --workspaces
npm pkg set repository.type=git "repository.url=git+https://github.com/Ryfter/canvas-toolchain.git" --workspaces
for d in packages/*/; do npm pkg set "repository.directory=${d%/}" --prefix "$d"; done
npm pkg set files[0]=dist --workspaces
```

Then audit runtime assets: `git grep -n "fileURLToPath(import.meta.url)" -- 'packages/*/src' | grep -viE "dist|test"` and inspect each hit — any package whose compiled code reads a non-`dist` directory at runtime (templates, kb seeds) gets that directory appended to its `files` array. Record what you added in the commit message.

- [ ] **Step 3: Make the three MCP servers self-identify**

In `packages/command-and-control/src/index.ts` (top of file, with existing imports):

```ts
import { createRequire } from 'node:module';
const pkg = createRequire(import.meta.url)('../package.json') as { version: string };
```

and change the registration block at ~line 94:

```ts
const server = new Server(
  { name: 'canvas-toolchain', version: pkg.version },
  { capabilities: { tools: {} } }
);
```

Apply the same `createRequire` version pattern to `packages/canvas-design-studio/src/index.ts:69` (`name: 'canvas-design-studio'` **stays**, version becomes `pkg.version`) and the equivalent registration in `packages/curriculum-intelligence/src/index.ts` (component name stays, version from pkg). Note: compiled location is `dist/index.js`, so `'../package.json'` resolves to the package root — correct in both src (via tsx/vitest) and dist.

- [ ] **Step 4: Verify**

```bash
npx vitest run tests/server_identity.test.ts --root packages/command-and-control   # PASS
npm run build && npm test
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(release): lockstep all packages at 2.2.0; publish metadata; C&C registers as canvas-toolchain"
```

---

### Task 4: The `canvas-toolchain` launcher package + root `prepare`

**Files:**
- Create: `packages/canvas-toolchain/package.json`, `packages/canvas-toolchain/bin/canvas-toolchain.mjs`, `packages/canvas-toolchain/README.md`
- Modify: root `package.json` (rename root, add `prepare`, add launcher to build chain — launcher has no build, skip)
- Test: `scripts/smoke-npx.mjs` (new; also used by CI in Task 5)

**Interfaces:**
- Consumes: `@canvas-toolchain/command-and-control` `dist/index.js` (Task 2/3 names).
- Produces: unscoped npm package **`canvas-toolchain`** with bin `canvas-toolchain`; root package renamed **`canvas-toolchain-monorepo`** (private) so the workspace owns the public name; `npm install` at root auto-builds via `prepare`. `node scripts/smoke-npx.mjs <command> [args…]` exits 0 iff the spawned command answers an MCP `initialize` on stdio.

- [ ] **Step 1: Write the smoke test (failing first)**

Create `scripts/smoke-npx.mjs`:

```js
#!/usr/bin/env node
// smoke-npx.mjs — spawn an MCP server command, send initialize, expect a reply.
// Usage: node scripts/smoke-npx.mjs npx canvas-toolchain
import { spawn } from 'node:child_process';

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) { console.error('usage: smoke-npx.mjs <command> [args...]'); process.exit(2); }

const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'], shell: process.platform === 'win32' });
const req = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
  protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke-npx', version: '0.0.0' } } };

let out = '';
const timer = setTimeout(() => { console.error('TIMEOUT: no initialize reply in 30s'); child.kill(); process.exit(1); }, 30_000);

child.stdout.on('data', (d) => {
  out += d;
  for (const line of out.split('\n')) {
    try {
      const msg = JSON.parse(line);
      if (msg.id === 1 && msg.result?.serverInfo) {
        clearTimeout(timer);
        console.log(`OK: ${msg.result.serverInfo.name}@${msg.result.serverInfo.version}`);
        child.kill();
        process.exit(0);
      }
    } catch { /* partial line */ }
  }
});
child.on('exit', (code) => { clearTimeout(timer); console.error(`server exited early (code ${code})`); process.exit(1); });
child.stdin.write(JSON.stringify(req) + '\n');
```

Run: `node scripts/smoke-npx.mjs npx canvas-toolchain`
Expected: **FAIL** — npm still says "could not determine executable to run" (the bug being fixed), so the script reports early exit.

- [ ] **Step 2: Create the launcher package**

`packages/canvas-toolchain/package.json`:

```json
{
  "name": "canvas-toolchain",
  "version": "2.2.0",
  "description": "Canvas Toolchain — course-refresh toolchain for Canvas LMS. Runs the unified MCP server; use from any MCP-capable AI client.",
  "license": "MIT",
  "type": "module",
  "bin": { "canvas-toolchain": "bin/canvas-toolchain.mjs" },
  "files": ["bin"],
  "engines": { "node": ">=20" },
  "publishConfig": { "access": "public" },
  "repository": { "type": "git", "url": "git+https://github.com/Ryfter/canvas-toolchain.git", "directory": "packages/canvas-toolchain" },
  "dependencies": { "@canvas-toolchain/command-and-control": "2.2.0" }
}
```

`packages/canvas-toolchain/bin/canvas-toolchain.mjs`:

```js
#!/usr/bin/env node
// Canvas Toolchain entrypoint: launches the unified MCP server (Command & Control).
// stdout belongs to the MCP protocol — all human output goes to stderr.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
let serverPath;
try {
  serverPath = require.resolve('@canvas-toolchain/command-and-control/dist/index.js');
} catch {
  console.error(
    'Canvas Toolchain: server build not found.\n' +
    'From a source checkout, run `npm install` in the repo root first — install builds the toolchain.'
  );
  process.exit(1);
}

const child = spawn(process.execPath, [serverPath, ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
```

`packages/canvas-toolchain/README.md`:

```markdown
# canvas-toolchain

The [Canvas Toolchain](https://github.com/Ryfter/canvas-toolchain) entrypoint. `npx canvas-toolchain`
starts the unified MCP server; wire it into any MCP-capable AI client (Claude, Codex, Gemini,
Grok, local models). Full docs: https://github.com/Ryfter/canvas-toolchain#readme
```

- [ ] **Step 3: Root package changes**

In root `package.json`: change `"name"` to `"canvas-toolchain-monorepo"` (the workspace now owns the public name — root and a workspace may not share a name), and add to `"scripts"`:

```json
    "prepare": "npm run build",
```

- [ ] **Step 4: Verify — Dan's exact scenario**

```bash
npm install                      # must auto-build everything via prepare
node scripts/smoke-npx.mjs npx canvas-toolchain   # Expected: OK: canvas-toolchain@2.2.0
```

Then the clean-copy rehearsal (space + parens in the path, no dist):

```bash
TMP="$TMPDIR/Canvas Toolchain (K Rank)"; mkdir -p "$TMP"
git archive HEAD | tar -x -C "$TMP"
cd "$TMP" && npm install && node scripts/smoke-npx.mjs npx canvas-toolchain
```
Expected: `OK: canvas-toolchain@2.2.0`. Clean up the temp dir afterwards.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(entrypoint): npx canvas-toolchain — launcher package + root prepare auto-build"
```

---

### Task 5: CI — onboarding job + Node 26

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `scripts/smoke-npx.mjs` (Task 4), `scripts/check-institution-scrub.mjs` (Task 1).

- [ ] **Step 1: Extend the matrix and add the onboarding job**

In `ci.yml`: change the matrix line to `node: ['20', '24', '26']` and update its comment to `# 20 = engines floor; 24 = the runtime bundled by the installer; 26 = current.` Then append a job:

```yaml
  from-source-onboarding:
    name: npx canvas-toolchain from a fresh copy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: '24'
      # Mirror a colleague's real folder: spaces and parentheses in the path.
      - name: Copy tree to a hostile path and install
        run: |
          DEST="$RUNNER_TEMP/Canvas Toolchain (Copy)/canvas-toolchain"
          mkdir -p "$DEST"
          git archive HEAD | tar -x -C "$DEST"
          cd "$DEST"
          npm install
          node scripts/smoke-npx.mjs npx canvas-toolchain
```

- [ ] **Step 2: Sanity-check YAML locally**

Run: `node -e "console.log('ok')" && npx --yes yaml-lint .github/workflows/ci.yml 2>/dev/null || python -c "import yaml,sys;yaml.safe_load(open('.github/workflows/ci.yml'));print('yaml ok')"`
Expected: `yaml ok` (either linter).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: from-source onboarding job (hostile path + npx smoke); add Node 26 to matrix"
```

---

### Task 6: Model-agnostic pass — TypeScript sources

**Files:**
- Modify: `packages/canvas-design-studio/src/index.ts` (7 strings), `src/tools/course-scaffold.ts` (5), `src/tools/ingest.ts` (comment), `src/tools/philosophy.ts` (comment), `src/tools/setup-course.ts` (1), `src/wizard.ts` (6); `packages/command-and-control/src/channel/install.ts` (2), `src/passthrough/ci_tools.ts` (2), `src/tools/rubric/render_md.ts` (1); `packages/curriculum-intelligence/src/index.ts` (1)
- Test: existing suites (several assert these strings)

**Interfaces:**
- Produces: shipped strings say "the model" / "your AI assistant" / "your MCP host"; no model brand where it means "the assistant".

- [ ] **Step 1: Apply the canonical rewrites**

| Pattern (all occurrences in the files above) | Replacement |
| --- | --- |
| `Claude will rewrite` / `Claude rewrites` | `the model rewrites` |
| `for Claude to reason about` / `to reason over` | `for the model to reason about` / `to reason over` |
| `for Claude to address` / `to complete the redesign` / `to use when reviewing` | `for the model to …` (same verb) |
| `Helps Claude in comprehensive mode.` | `Helps the model in comprehensive mode.` |
| `deeper Claude analysis` | `deeper model analysis` |
| `so Claude can review` (ingest comment + index.ts:237) | `so the model can review` |
| `Tell Claude: "Generate the course…"` (index.ts:800, setup-course.ts:155) | `Tell your AI assistant: "Generate the course…"` |
| `returned to Claude when no KB file exists` | `returned to the model when no KB file exists` |
| `Claude uses it to tailor` / `build it in Claude later` / `build it in Claude anytime` / `What should Claude know` (wizard.ts) | `The model uses it to tailor` / `build it with your AI assistant later` / `…anytime` / `What should the model know` |
| `Add this to your Claude Code MCP settings:` (wizard.ts:35) | `Add this to your MCP client settings:` |
| `Restart Claude Code (or your MCP host) to activate.` | `Restart your MCP client to activate.` |
| `Works in: Claude Code · VS Code · ChatGPT Codex · any MCP host` | `Works in: Claude · Codex · Gemini · Cursor · VS Code · any MCP host` |
| `Takes effect on the next Claude reconnect/restart` (install.ts ×2) | `Takes effect on the next MCP host reconnect/restart` |
| `Ask Claude what's new in a given topic area` (ci_tools.ts:254) | `Ask the model what's new in a given topic area` |
| `paste it into ChatGPT, Claude, or any LLM` (render_md.ts:58) | `paste it into any AI assistant` |

Also in `wizard.ts` (~line 27): the printed config becomes

```ts
  const config = {
    mcpServers: {
      'canvas-toolchain-design-studio': {
        command: 'npx',
        args: ['canvas-toolchain-design-studio'],
      },
    },
  };
```

- [ ] **Step 2: Sweep for stragglers**

Run: `git grep -niE "\bclaude\b|\bchatgpt\b" -- 'packages/*/src' | grep -viE "claude-haiku|claude-sonnet|claude-opus|anthropic"`
Expected: zero lines. Any survivor gets the same treatment (or, if it is a genuine provider/model-ID reference, leave it and note why in the commit body).

- [ ] **Step 3: Build + tests (assertions will need syncing)**

```bash
npm run build && npm test
```
Expected failures to fix: `packages/canvas-design-studio/tests/get-started.test.ts` and any wizard/scaffold snapshot asserting the old copy — update assertions to the new strings, never revert the strings.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(copy): model-agnostic strings — the model / your AI assistant, no brand names in shipped copy"
```

---

### Task 7: Model-agnostic pass — installer (Go)

**Files:**
- Modify: `installer/screens/workflows.go:78-79,96`, `installer/screens/summary.go:65-71`
- Test: `installer/screens/summary_test.go` (extend), `go test ./...`

**Interfaces:**
- Consumes: `st.WiredHosts` map (already populated with host IDs like `"claude-desktop"`).
- Produces: launch button appears only when `claude-desktop` was wired; assistant copy is brand-neutral.

- [ ] **Step 1: Extend the summary test (failing first)**

In `installer/screens/summary_test.go`, add a test asserting that when `WiredHosts` does NOT contain `"claude-desktop"`, the summary screen contains no "Launch" button (walk the rendered object tree the same way the existing test finds widgets; follow the file's established helper pattern). Run `cd installer && go test ./screens/` → Expected: FAIL (button is unconditional today).

- [ ] **Step 2: Make the launch button host-driven**

In `summary.go`, wrap the button:

```go
	var launchBtn fyne.CanvasObject = layout.NewSpacer()
	if st.WiredHosts["claude-desktop"] {
		launchBtn = ui.NewHoverButton("Launch Claude Desktop", ui.ButtonPrimary, func() {
			_ = launchClaudeDesktop()
			onClose()
		})
	}
	done := ui.NewHoverButton("Done", ui.ButtonDefault, onClose)
	bottom := container.NewBorder(nil, nil, done, launchBtn)
```

(The label stays "Launch Claude Desktop" — the *action* is Claude-Desktop-specific; the fix is that it is driven by what got wired. Add the `fyne.io/fyne/v2/layout` import if absent.)

- [ ] **Step 3: Neutralize the module hints**

In `workflows.go`:
- Line 78-79 → `"These install later through your AI assistant — checking one just queues the request. Next time you open your MCP client it will offer to install them, or just ask: \"install the <module> module\"."`
- Line 96 → `"Module catalog unavailable — you can install modules later by asking your AI assistant."`

- [ ] **Step 4: Verify**

```bash
cd installer && go vet ./... && go test ./...
```
Expected: all green, including the new summary test.

- [ ] **Step 5: Commit**

```bash
git add installer
git commit -m "refactor(installer): host-driven launch button; brand-neutral assistant copy"
```

---

### Task 8: Naming pass — docs say Canvas Toolchain

**Files:**
- Modify: `README.md` (Task 9 rewrites it fully — here only the naming sweep of OTHER docs), `docs/tool-overview.md`, `docs/user-guide.md`, `docs/commands-and-credentials.md`, `docs/architecture-modules.md`, `docs/modules.md` header source (`scripts/generate-module-docs.mjs` if it emits a title), package READMEs (`packages/*/README.md`)
- Test: grep-based

**Interfaces:**
- Produces: living docs title the product **Canvas Toolchain**; components presented as "Canvas Toolchain — Design Studio" / "— Curriculum Intelligence" / "— Command & Control" on first mention; old bin names replaced by the Task 2 names.

- [ ] **Step 1: Sweep living docs (NOT `docs/superpowers/` history)**

```bash
# find drift: lowercase product name used as prose, old bins, old package names in living docs
git grep -nE "canvas-design-mcp|curriculum-intelligence-mcp|command-and-control-mcp" -- '*.md' ':!*docs/superpowers/*'
```
For each hit in living docs: package-name references → the new `@canvas-toolchain/...` names; bin invocations → the new bin names; prose "canvas-toolchain" as a *product* name (not a path, repo slug, config key, or code block) → **Canvas Toolchain**. Repo slug `Ryfter/canvas-toolchain`, file paths, and the MCP server key `"canvas-toolchain"` in config JSON are code — leave them.

- [ ] **Step 2: First-mention component style**

In `docs/tool-overview.md`, `docs/user-guide.md`, `docs/architecture-modules.md`: ensure the first mention of each app reads "Canvas Toolchain — Design Studio (canvas-design-studio)" style, then the short component name is fine.

- [ ] **Step 3: Verify + commit**

Run: `git grep -nE "canvas-design-mcp|curriculum-intelligence-mcp|command-and-control-mcp" -- '*.md' ':!*docs/superpowers/*' ':!*node_modules*'` → Expected: zero hits (data-dir `.canvas-design-mcp` literals in living docs, if any, are exempt — annotate them as legacy data dir).

```bash
git add -A
git commit -m "docs(naming): product is Canvas Toolchain throughout living docs; new bin/package names"
```

---

### Task 9: README quickstarts + host wiring (no undocumented steps)

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: bin names (Task 2), launcher (Task 4).

- [ ] **Step 1: Replace the "Where to start" section**

New content (verbatim; keep the existing intro, pipeline diagram, docs table, and "What lives where" below it):

````markdown
## Where to start

**Canvas Toolchain** runs as an MCP server you talk to from any MCP-capable AI client —
Claude (Desktop/Code), Codex, Gemini, Cursor, VS Code, Grok, or a local model via any MCP host.

### Fastest: no install

```bash
npx canvas-toolchain
```

That starts the unified MCP server (it speaks MCP on stdio — wire it into a client below;
it is not an interactive CLI).

### Native installer

Download the Windows x64 / macOS arm64 installer from
[Releases](https://github.com/Ryfter/canvas-toolchain/releases) — it bundles Node, the
toolchain, and an auto-updater, and writes the MCP config for every client it detects.

### From source

```bash
git clone https://github.com/Ryfter/canvas-toolchain.git
cd canvas-toolchain
npm install        # install IS the build — no separate build step
npx canvas-toolchain   # smoke: starts the MCP server (Ctrl+C to stop)
```

> Requires Node ≥ 20. If your checkout lives in a folder with spaces (e.g.
> `C:\Users\you\Documents\Canvas Toolchain`), quote the path anywhere it appears in JSON config.

### Wire it into your client

Everywhere below, `npx canvas-toolchain` also accepts an absolute path form:
`node <checkout>/packages/command-and-control/dist/index.js`.

**Claude Desktop** (`claude_desktop_config.json`) / **Claude Code** (`.mcp.json`) / **Cursor** / **VS Code** — mcpServers JSON:

```json
{
  "mcpServers": {
    "canvas-toolchain": { "command": "npx", "args": ["canvas-toolchain"] }
  }
}
```

**Codex CLI:**

```bash
codex mcp add canvas-toolchain -- npx canvas-toolchain
```

**Gemini CLI** (`~/.gemini/settings.json`):

```json
{ "mcpServers": { "canvas-toolchain": { "command": "npx", "args": ["canvas-toolchain"] } } }
```

**Anything else (Grok, local models, other MCP hosts):** any client that can run a
stdio MCP server works — command `npx`, args `["canvas-toolchain"]`. Restart the client
after editing its config.

**Working on this repo (human or AI agent)?** Read [`AGENTS.md`](AGENTS.md) first.
````

- [ ] **Step 2: Verify every documented command**

Run each documented command that can run locally: the from-source block in a temp copy (already rehearsed in Task 4 Step 4 — rerun if anything changed), and `npx canvas-toolchain` in-repo. Both must behave exactly as documented.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): npx + installer + from-source quickstarts; per-client MCP wiring"
```

---

### Task 10: npm publish workflow + runbook

**Files:**
- Create: `.github/workflows/release-npm.yml`, `docs/npm-publishing.md`
- Test: `npm pack` dry-run locally

**Interfaces:**
- Consumes: publish metadata (Task 3), launcher package (Task 4).
- Produces: tag `vX.Y.Z` → all workspaces published with provenance. Manual prerequisites documented.

- [ ] **Step 1: Local pack rehearsal (the publish test)**

```bash
npm pack --workspaces --pack-destination "$TMPDIR/ct-pack"
ls "$TMPDIR/ct-pack"
```
Expected: 13 tarballs. Then inspect the two that matter most:

```bash
cd "$TMPDIR/ct-pack"
tar -tzf canvas-toolchain-2.2.0.tgz              # must contain package/bin/canvas-toolchain.mjs
tar -tzf canvas-toolchain-command-and-control-2.2.0.tgz | head -20   # must contain package/dist/index.js
tar -xzf canvas-toolchain-2.2.0.tgz package/package.json -O | grep '"@canvas-toolchain/command-and-control"'
```
The last grep must show the concrete `"2.2.0"` version, **not** `"*"` — npm rewrites workspace `*` deps at pack time; if `*` leaked, set the dependency versions explicitly in the consuming package.json and re-verify. Check C&C's manifest the same way (`tar -xzf canvas-toolchain-command-and-control-2.2.0.tgz package/package.json -O | grep '@canvas-toolchain'`). Clean up the pack dir.

- [ ] **Step 2: Write the workflow**

`.github/workflows/release-npm.yml`:

```yaml
name: Release npm packages

on:
  push:
    tags:
      - 'v*.*.*'

permissions:
  contents: read
  id-token: write   # npm provenance

jobs:
  publish:
    if: github.repository == 'Ryfter/canvas-toolchain'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'
          cache: npm

      - name: Verify tag matches package versions
        run: |
          TAG="${GITHUB_REF_NAME#v}"
          PKG="$(node -p "require('./package.json').version")"
          if [ "$TAG" != "$PKG" ]; then
            echo "Tag v$TAG does not match package version $PKG"; exit 1
          fi

      - name: Install (builds via prepare)
        run: npm ci

      - name: Test
        run: npm test

      - name: Publish all workspaces with provenance
        run: npm publish --workspaces --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 3: Write the runbook**

`docs/npm-publishing.md`:

```markdown
# npm publishing — runbook

Canvas Toolchain publishes 13 packages to npm on every `vX.Y.Z` tag: the unscoped
[`canvas-toolchain`](https://www.npmjs.com/package/canvas-toolchain) entrypoint plus the
`@canvas-toolchain/*` workspace packages. The workflow is
`.github/workflows/release-npm.yml`; it runs alongside the installer release on the same tag.

## One-time setup (repo owner)

1. Create the free **canvas-toolchain** organization on npmjs.com (owns the
   `@canvas-toolchain` scope): npmjs.com → profile → Add Organization.
2. Create a **granular access token**: npmjs.com → Access Tokens → Generate New Token →
   Granular; permissions *Read and write* scoped to the `canvas-toolchain` org **and** the
   `canvas-toolchain` package; no IP allowlist (Actions IPs rotate); expiry ≤ 1 year
   (calendar the renewal).
3. Add it to the repo: GitHub → Settings → Secrets and variables → Actions →
   `NPM_TOKEN`.

## Every release

Nothing manual — pushing the `vX.Y.Z` tag publishes. Versions are locked: every
package.json carries the release version (CI fails the publish if the tag disagrees).

## Post-publish smoke (run once after each release)

```bash
cd "$(mktemp -d)"
npx canvas-toolchain@latest &   # should start silently (MCP server on stdio)
```

Or wire `npx canvas-toolchain` into an MCP client and confirm the tool list loads.
First publish note: the very first `npm publish` of a new scope may require
`npm publish --access public` from a logged-in shell once if the org was created
seconds earlier — if the workflow's first run 403s, run
`npm publish --workspaces --access public` locally with `npm login`, then re-tag.

## Token expiry / rotation

Regenerate the granular token, update the `NPM_TOKEN` secret. No code changes.
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release-npm.yml docs/npm-publishing.md
git commit -m "feat(release): npm publish workflow (tag-triggered, provenance) + runbook"
```

---

### Task 11: Final verification, AGENTS.md status, PR

**Files:**
- Modify: `AGENTS.md` (status note), `docs/roadmap.md` (v2.2.0 entry)
- Test: the full floor

- [ ] **Step 1: Full verification floor**

```bash
npm run build
npm test
npm run smoke:integration --workspace=packages/command-and-control
node scripts/check-institution-scrub.mjs
node scripts/smoke-npx.mjs npx canvas-toolchain
cd installer && go vet ./... && go test ./... && cd ..
```
Expected: everything green. Fix anything red before proceeding (and if a fix touches an earlier task's area, re-run that task's verification too).

- [ ] **Step 2: Update AGENTS.md + roadmap**

AGENTS.md: add to the current-status section — packages renamed into `@canvas-toolchain` scope (dirs unchanged), `npx canvas-toolchain` entrypoint + `prepare` auto-build, npm publishing on tag (needs `NPM_TOKEN` + org, see `docs/npm-publishing.md`), model-agnostic copy, scrub guard in CI. `docs/roadmap.md`: add v2.2.0 with the same one-liners.

- [ ] **Step 3: Commit, push, PR**

```bash
git add -A
git commit -m "docs(status): v2.2.0 unification — AGENTS.md + roadmap"
git push -u origin feat/canvas-toolchain-unification
gh pr create --title "v2.2.0: Canvas Toolchain unification — npx everywhere, one name, any model" --body "$(cat <<'EOF'
## Summary
- `npx canvas-toolchain` works in-repo (root `prepare` auto-build + launcher) and, once `NPM_TOKEN`/org exist, from the registry (new `canvas-toolchain` package + tag-triggered publish workflow with provenance)
- Unscoped packages renamed into the `@canvas-toolchain` scope (directories unchanged — installer wiring untouched); all versions locked to 2.2.0; C&C registers as `canvas-toolchain`
- Model-agnostic copy in shipped strings and installer screens; launch button host-driven
- Institution scrub restored + CI guard; from-source onboarding CI job (hostile path + MCP smoke); Node 26 in matrix
- README: npx / installer / from-source quickstarts + per-client wiring (Claude, Codex, Gemini, Cursor, VS Code, generic stdio)

## Manual steps before tagging v2.2.0 (owner)
1. Create the `canvas-toolchain` org on npmjs.com  2. Add `NPM_TOKEN` repo secret (see docs/npm-publishing.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** W1 → Tasks 2,3,4,5,10; W2 → Tasks 2,3,8,9; W3 → Tasks 6,7; W4 → Task 1. Manual npm-org/token steps → Task 10 runbook + PR body. Colleague's second error transcript → out of scope per spec.
- **Order rationale:** scrub first (smallest, closes the public-repo exposure), renames before anything that references new names, launcher before CI job that smokes it, docs after the names they document exist.
- **Known risk left open:** registry-side npx smoke can only run post-publish (documented in runbook); `files` completeness is gated by the Task 10 pack inspection + Task 4 hostile-path rehearsal.
