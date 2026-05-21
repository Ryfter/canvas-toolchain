# npm Publishing Runbook

Canvas Design Studio is published on npm as `canvas-design-mcp`.

Current verified package state:

- npm package: `canvas-design-mcp`
- Current version: `0.9.5`
- Current dist-tag: `latest -> 0.9.5`
- Public source repository: `https://github.com/Ryfter/canvas-design-studio`
- Successful publish workflow: GitHub Actions run `25761059017`, tag `v0.9.5`

Professors can install from npm:

```bash
npm install -g canvas-design-mcp
```

## How Publishing Works

Publishing is handled by `.github/workflows/publish.yml` in the public repository.

The workflow runs when a public tag matching `v*` is pushed. It has three jobs:

| Job | Purpose |
|---|---|
| `test` | Runs `npm ci` and `npm test` before release work starts. |
| `publish-npm` | Builds TypeScript and runs `npm publish --provenance --access public`. |
| `publish-docker` | Builds and pushes `ghcr.io/ryfter/canvas-design-studio` tags. |

The npm job uses:

```yaml
permissions:
  contents: read
  id-token: write
```

and publishes with:

```bash
npm publish --provenance --access public
```

`--provenance` publishes build provenance from GitHub Actions. npm requires `package.json` repository metadata to match the public GitHub source repository for provenance validation.

## Required GitHub Secret

The public GitHub repository has an Actions secret named `NPM_TOKEN`.

Do not store the token value in the repository or docs. If the secret must be replaced:

1. Create an npm token that can publish `canvas-design-mcp`.
2. Use a token mode that works with automation and does not require an interactive one-time password during `npm publish`.
3. Save it in the public GitHub repo as `NPM_TOKEN`.

```powershell
gh secret set NPM_TOKEN --repo Ryfter/canvas-design-studio
```

Known token pitfalls:

- `E403` usually means the token cannot publish this package.
- `EOTP` means the token still requires interactive two-factor authentication for writes.
- `E422` with provenance repository text means `package.json` repository metadata does not match the public repository.

## Version and Tag Process

Do normal development in the private repository first.

```powershell
npm version <new-version> --no-git-tag-version
npm test
npm run build
npm pack --dry-run
git add package.json package-lock.json <changed-files>
git commit -m "..."
git push backup master
```

Then update the public repository only through the deploy script:

```powershell
.\scripts\deploy-public.ps1
```

Create and push the release tag on the public stripped commit, not directly on the private commit:

```powershell
git fetch origin master
git tag -a v<new-version> origin/master -m "<new-version>"
git push origin v<new-version>
```

Watch the release:

```powershell
gh run list --repo Ryfter/canvas-design-studio --workflow Publish --limit 5
gh run watch <run-id> --repo Ryfter/canvas-design-studio --exit-status
```

Verify npm:

```powershell
npm view canvas-design-mcp version dist-tags repository --json
```

## Historical Release Notes

- `v0.9.0`: first successful package contents were prepared, but early publish attempts failed while npm token permissions were being corrected.
- `v0.9.1`: failed npm provenance because `package.json` had missing repository metadata.
- `v0.9.2`: superseded during publish troubleshooting.
- `v0.9.3`: first end-to-end successful npm and Docker release.
- `v0.9.4`: npm published, Docker failed because Buildx attestations were requested without the container driver.
- `v0.9.5`: current successful npm and Docker release. `latest` points here.

Do not rerun old failed tag workflows. Publish future fixes as a new version/tag.
