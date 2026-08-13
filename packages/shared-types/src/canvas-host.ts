/**
 * Canonical Canvas host handling for everything that reads or writes
 * ~/.command-and-control/canvas-config.json.
 *
 * This is the TypeScript twin of installer/tasks/canvashost.go. Both the Go
 * installer and the setup_canvas MCP tool write that same file, so both must
 * agree on what a host looks like — otherwise the value a professor typed in
 * one entry point is unusable from the other, and every downstream consumer
 * (our Canvas clients, Canvas Backup) inherits the broken value.
 *
 * Keep the two in lockstep; tests/lib/canvas_host.test.ts pins the shared table.
 */

/**
 * Turn whatever the user typed into a bare, resolvable hostname.
 *
 * Forgiving on purpose: people paste full URLs, leave trailing slashes, or —
 * most commonly — type only their school's subdomain because the example text
 * made the ".instructure.com" suffix look like it was already there. A bare
 * label is completed so it resolves instead of failing DNS as "no such host".
 * Vanity domains (anything already containing a dot) are left alone.
 *
 * Idempotent: normalizing an already-normalized host returns it unchanged.
 */
export function normalizeCanvasHost(raw: string): string {
  let host = raw.trim().toLowerCase();
  if (!host) return '';

  host = host.replace(/^https?:\/\//, '');

  // Keep only the host[:port] portion, dropping any path or query.
  const cut = host.search(/[/?]/);
  if (cut >= 0) host = host.slice(0, cut);

  host = host.trim().replace(/\.+$/, '');
  if (!host) return '';

  // A bare label (no dot) is almost certainly a school subdomain — complete it.
  if (!host.includes('.')) host += '.instructure.com';

  return host;
}

/**
 * Build the full origin Canvas API calls hang off, e.g. "https://x.instructure.com".
 *
 * Throws rather than returning something unusable: a silently malformed base URL
 * surfaces later as an opaque TLS or auth failure, which is exactly the failure
 * mode this module exists to prevent.
 */
export function canvasBaseUrl(raw: string): string {
  const host = normalizeCanvasHost(raw);
  if (!host) {
    throw new Error(
      'CANVAS_HOST_INVALID: no Canvas hostname configured. Run setup_canvas with your ' +
        'school\'s Canvas host (e.g. "example.instructure.com").',
    );
  }
  return `https://${host}`;
}
