# Bundle Install With Dependency Resolution (#18)

## Status

Implemented in commit `abea768`.

## Scope

- Bundle manifests support `kind: "bundle"` and an `includes` array of pinned resources.
- `installResource()` installs included resources before recording the bundle itself.
- Nested bundle cycles are rejected through the existing dependency traversal guard.
- The registry entry stores `includes` metadata so `uninstall_resource` can cascade from a bundle to its installed components.

## Reasoning

Bundles are manifest-only registry resources. The useful payload is the pinned compatibility set, not a separate file. Installing the included template, theme, and prompt-set first keeps the index truthful: a bundle is only recorded after its component installs have succeeded.

Cycle detection reuses the install traversal path instead of adding a second bundle-only graph walker. That keeps GitHub, `file://`, and `ryfter://` dependency behavior consistent.

## Verification

```powershell
npm test --workspace=packages/command-and-control -- tests/registry/bundle_install.test.ts
```

Result: 2 tests passed.
