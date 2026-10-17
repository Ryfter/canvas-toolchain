// Test-only network stub, loaded into the CLI under test via
// NODE_OPTIONS=--import=file://<this>. Any fetch call is recorded and refused, so
// a test can prove "no network" or "probed" without touching the real network.
import { writeFileSync } from 'node:fs';

globalThis.fetch = async (url) => {
  writeFileSync(process.env.NET_STUB_MARKER, String(url));
  throw new Error('network blocked by test stub');
};
