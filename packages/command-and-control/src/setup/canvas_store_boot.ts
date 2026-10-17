import { migrateCanvasStores, type CanvasStoreMigrationResult } from '@canvas-toolchain/shared-types';

/**
 * Reconcile the two Canvas credential stores once, at Command & Control startup
 * (#151 R7, decision D1).
 *
 * Startup is a *reader-visible* moment, not a setup one: it may promote Canvas
 * Design Studio's credentials into the canonical store and repair an existing
 * institution.json, but it never creates that file. A file this bridge
 * synthesized has no institution name and only placeholder colors, and its mere
 * existence switches Canvas Design Studio out of its first-run brand setup — so
 * creation belongs to `ct_setup canvas` and the Design Studio wizard.
 *
 * The outcome (including the path of any backup) is written to the migration
 * journal by `migrateCanvasStores` for the doctor to surface, because a
 * professor never sees stderr from an MCP host. Returns null when the bridge
 * could not run — an unwritable or read-only home must never stop the server
 * booting.
 */
export function bridgeCanvasStoresAtStartup(): CanvasStoreMigrationResult | null {
  try {
    const migration = migrateCanvasStores();
    if (migration.changed || migration.action === 'corrupt') {
      console.error(`[canvas-store] ${migration.detail}`);
    }
    return migration;
  } catch (err) {
    console.error(
      `[canvas-store] migration skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
