# Follow-ups: npm 12 `allowScripts`, and the stale-override finding

**Date:** 2026-08-23
**Context:** A from-source `npm install` on Windows (npm 12) reported three blocked install
scripts. Fixing that surfaced a second, unrelated problem in the lockfile.

**Shipped in this commit:** an `allowScripts` policy in the root `package.json`, and a README
section explaining both classes of `npm install` warning.

**Everything below is deferred — noted here so it isn't lost, not scheduled.**

---

## 1. `esbuild@0.27.7` is in the tree despite the root override — root cause found

**Status:** diagnosed, not fixed.

### What we see

```
node_modules/esbuild                    0.28.1   (dev)
node_modules/vite/node_modules/esbuild  0.27.7   (dev)
```

…even though the root `package.json` has `overrides: { "esbuild": "^0.28.1" }`.

### Why

Two facts combine:

1. **`vite@7.3.5` declares `esbuild@^0.27.0`.** Vite is dev-only, reached via
   `vitest` → (`vite-node`, `@vitest/mocker`) → `vite`. `0.27.7` does not satisfy `^0.28.1`,
   so absent an override npm nests a second copy rather than deduping.
2. **The lockfile never recorded the override.** `package-lock.json` → `packages[""]` has
   **no `overrides` key at all** (it reads `null`), while `package.json` does. npm writes the
   root `overrides` into the lockfile when it applies them — its absence means this lockfile
   was written without the override ever being applied, and every `npm ci` / `npm install`
   since has faithfully reproduced the pre-override tree.

The override was added in `1933075` ("fix(deps): override esbuild to ^0.28.1, clearing
Dependabot #23/#24"). The lockfile has been regenerated since (last touched at `f8b8d54`,
v2.2.1) but still shows no `overrides` block — so the sync gap is real, not just historical
ordering.

### Why it hasn't bitten us

Both copies are `dev: true`. Nothing shipped to users contains either one. The practical
cost so far is the extra `install-scripts` warning line for `esbuild@0.27.7`, which the new
`allowScripts` entry already covers (it's keyed by bare name, so it matches every version).

### Suspected fix, when we get to it

Regenerate the lockfile so the override actually applies, then confirm it stuck:

```bash
rm package-lock.json && npm install
python3 -c "import json;print(json.load(open('package-lock.json'))['packages']['']['overrides'])"
npm ls esbuild --workspaces --all    # expect a single 0.28.1
```

**Verify before believing it.** A full lockfile regeneration on a 12-package workspace can
move far more than esbuild. Diff the lockfile, run `npm test` and `npm run build`, and treat
"the override block is now present" as the acceptance check — not "the warning went away."

### Open question

Whether the original Dependabot advisories (#23/#24) were ever actually resolved, or only
*appeared* resolved because the override looked right in `package.json` while the installed
tree still carried `0.27.x`. Worth re-checking when this is picked up.

---

## 2. Verify the installer on the next bundled-Node bump

**Status:** not yet a problem; will become one silently.

The native installer runs `npm install` and then `npm run build` with its **bundled** Node
(`installer/screens/install.go:177-182`), not the user's. That Node is pinned to **24.12.0**
(`installer/scripts/download-node.sh:18`), which ships npm 11 — no `allowScripts` enforcement.

When that pin moves to a Node that bundles npm 12+, the installer's `npm install` step will
start skipping `better-sqlite3` and `esbuild` install scripts. The `allowScripts` policy
added in this commit should prevent that, **provided the installer payload ships the updated
root `package.json`.** That is the thing to actually verify — a payload built from a stale
tree would reintroduce the failure, and the symptom would be a confusing mid-install
`npm run build` error rather than anything mentioning scripts.

Add to the Node-bump checklist: after bumping `NODE_VERSION`, run the installer end-to-end
and confirm the `npm install` step logs no `install-scripts` warnings.

---

## 3. Smaller things noticed in passing

- **`scripts/install.sh`** does not invoke `npm install` (only the Go installer does), so it
  needs no `allowScripts` handling today. Re-check if it grows a from-source path.
- **`allowScripts` entries are keyed by bare name** (`"esbuild": true`), deliberately. npm
  rejects semver ranges as policy keys, and `npm install-scripts approve` pins to the
  currently-installed version, which would go stale on every dependency bump and re-block the
  build. The tradeoff: a bare name permits install scripts from *any* future version of that
  package. Acceptable for two known build tools; don't let the list grow without thought.
- **`prepare` runs the full workspace build on every `npm install`.** That is intentional and
  documented ("install IS the build"), but it means an install-script failure surfaces as a
  build error, which is a confusing first experience. The new README section is the mitigation;
  a clearer failure message would be better.
