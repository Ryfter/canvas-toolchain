# deploy-public.ps1
# Strips internal docs and pushes a clean version to the public repo (origin).
#
# Workflow:
#   git push backup master        <- full private backup (everything)
#   .\scripts\deploy-public.ps1   <- clean push to public GitHub
#
# How it works: creates a temporary branch from master, removes private files
# from git tracking on that branch, force-pushes it to origin/master, then
# deletes the temp branch. Your master branch is never modified.

param()
$ErrorActionPreference = "Stop"

# Abort if working tree is dirty — avoids confusing partial state
$dirty = git status --porcelain
if ($dirty) {
    Write-Error "Working tree has uncommitted changes. Commit or stash them first."
    exit 1
}

$branch = "_deploy-$(Get-Random)"

$privateItems = @(
    "AGENTS.md"
    "docs/AI-Personas-ideas_Student-Personas.csv"
    "docs/Student-Personas.md"
    "docs/design-alternatives.md"
    "docs/handoff-to-Claude.md"
    "docs/handoff-to-codex.md"
    "docs/roadmap-image-prompt.md"
    "docs/technical-roadmap.md"
    "docs/superpowers"
)

try {
    Write-Host "Creating deploy branch $branch from master..."
    git checkout -b $branch

    Write-Host "Removing private files from git tracking..."
    foreach ($item in $privateItems) {
        # Suppress output — git rm warns if a file isn't tracked, which is fine
        git rm -r --cached $item 2>&1 | Out-Null
    }

    git commit -m "chore: strip internal docs for public release"

    Write-Host "Pushing to public remote (origin)..."
    # --force is required: stripped history diverges from public remote's history
    git push origin "${branch}:master" --force

    Write-Host ""
    Write-Host "Done. Public repo updated at https://github.com/Ryfter/canvas-design-studio"
} catch {
    Write-Error "Deploy failed: $_"
    exit 1
} finally {
    # Always return to master and delete the temp branch.
    # -f is required: private files are untracked on the deploy branch but
    # tracked on master — git refuses checkout without it.
    # Suppress NativeCommandError: PS 5.1 raises errors when git writes to stderr,
    # even for informational messages like "Switched to branch 'master'".
    $ErrorActionPreference = "Continue"
    git checkout -f master | Out-Null
    git branch -D $branch | Out-Null
    $ErrorActionPreference = "Stop"
    Write-Host "Deploy branch cleaned up."
}
