import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

/**
 * Guard for user-supplied *local inference* endpoint URLs (Ollama today, an
 * LM Studio provider later). These URLs reach `fetch()` with the professor's
 * own network position, so an attacker-supplied value turns a convenience
 * setting into an SSRF primitive (cloud metadata, link-local services).
 *
 * Policy:
 *  - http and https only; no userinfo (user:pass@); host required.
 *  - A path is allowed (LM Studio serves under /v1); query and fragment are
 *    dropped from the canonical URL.
 *  - Loopback, RFC1918, CGNAT (100.64/10, Tailscale) and IPv6 ULA are allowed
 *    over http or https.
 *  - Link-local, cloud metadata, unspecified, multicast, broadcast and
 *    reserved addresses are refused, including their IPv4-mapped/compatible
 *    IPv6 spellings.
 *  - Globally routable addresses are allowed over https only.
 *
 * Callers MUST use the returned `url` to build requests, and MUST re-check
 * immediately before every outbound request (DNS can change between the setup
 * check and the request — see the TOCTOU note on `assertEndpointAllowed`).
 */

export type EndpointBlockReason =
  | 'invalid-url'
  | 'scheme'
  | 'userinfo'
  | 'host-missing'
  | 'unresolvable'
  | 'link-local'
  | 'metadata'
  | 'unspecified'
  | 'multicast'
  | 'broadcast'
  | 'reserved'
  | 'public-over-http'
  | 'redirect';

export type LookupFn = (hostname: string) => Promise<string[]>;

export interface EndpointGuardOptions {
  /** DNS resolver override. Defaults to `dns.promises.lookup({ all: true })`.
   *  Injected by tests so no test ever touches real DNS. */
  lookup?: LookupFn;
}

export interface ParsedEndpointUrl {
  /** Canonical base URL: scheme://host[:port][/path], no query/fragment, no trailing slash. */
  url: string;
  protocol: 'http:' | 'https:';
  /** Lowercased hostname without brackets (IPv6 literals are unbracketed). */
  hostname: string;
  port: number | null;
}

export interface EndpointInfo extends ParsedEndpointUrl {
  /** True when any resolved address is globally routable. */
  public: boolean;
  /** Every address that was classified. */
  addresses: string[];
}

export type IpClassification =
  | 'loopback'
  | 'private'
  | 'cgnat'
  | 'ula'
  | 'link-local'
  | 'metadata'
  | 'unspecified'
  | 'multicast'
  | 'broadcast'
  | 'reserved'
  | 'public'
  | 'invalid';

const ALLOWED_KINDS: ReadonlySet<IpClassification> = new Set(['loopback', 'private', 'cgnat', 'ula']);

const BLOCKED_KINDS: ReadonlySet<string> = new Set([
  'link-local',
  'metadata',
  'unspecified',
  'multicast',
  'broadcast',
  'reserved',
]);

type BlockedIpKind = 'link-local' | 'metadata' | 'unspecified' | 'multicast' | 'broadcast' | 'reserved';

function isBlockReason(kind: IpClassification): kind is BlockedIpKind {
  return BLOCKED_KINDS.has(kind);
}

const FIX_PRIVATE = [
  'Use http://localhost:11434 for a local Ollama server',
  'Or use a private LAN address, e.g. http://192.168.1.50:11434',
];

/** Fix steps returned with each block reason. */
const FIX_BY_REASON: Record<EndpointBlockReason, string[]> = {
  'invalid-url': ['Use a full URL like http://localhost:11434 or http://192.168.1.50:11434'],
  scheme: [
    'Use http://localhost:11434 for a local Ollama server',
    'Use https://<host> for a hosted inference endpoint',
  ],
  userinfo: [
    'Remove the user:password@ part of the URL',
    'Credentials belong in the provider config, never in the endpoint URL',
  ],
  'host-missing': ['Include a hostname, e.g. http://localhost:11434'],
  unresolvable: [
    'Check the hostname for typos',
    'Use http://localhost:11434 or a LAN address this machine can reach',
  ],
  'link-local': FIX_PRIVATE,
  metadata: [
    'Local inference must run on localhost or a private LAN address, never a cloud metadata endpoint',
  ],
  unspecified: FIX_PRIVATE,
  multicast: FIX_PRIVATE,
  broadcast: FIX_PRIVATE,
  reserved: FIX_PRIVATE,
  'public-over-http': [
    'Use https:// for a hosted inference endpoint',
    'Use http:// only with localhost or a private LAN address (e.g. http://192.168.1.50:11434)',
  ],
  redirect: [
    'Point the provider directly at the final endpoint URL',
    'Redirects from a local inference endpoint are not followed for security',
  ],
};

export class EndpointBlockedError extends Error {
  readonly code = 'ENDPOINT_BLOCKED';

  constructor(
    public readonly reason: EndpointBlockReason,
    message: string,
    public readonly fix: string[] = FIX_BY_REASON[reason],
  ) {
    super(message);
    this.name = 'EndpointBlockedError';
  }
}

function block(reason: EndpointBlockReason, message: string): EndpointBlockedError {
  return new EndpointBlockedError(reason, message);
}

/** Parse + syntax-validate a user-supplied endpoint URL. Never echoes the raw
 *  input (it could carry credentials), so callers cannot leak a secret via the
 *  error message. */
export function parseEndpointUrl(rawUrl: string): ParsedEndpointUrl {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw block('invalid-url', 'Local inference endpoint is not a valid URL.');
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw block('scheme', `Local inference endpoint must use http:// or https:// (got "${u.protocol}").`);
  }
  if (u.username !== '' || u.password !== '') {
    throw block('userinfo', 'Local inference endpoint must not embed credentials (user:pass@host).');
  }
  if (u.hostname === '') {
    throw block('host-missing', 'Local inference endpoint URL is missing a host.');
  }

  const path = u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, '');
  const protocol = u.protocol as 'http:' | 'https:';
  return {
    url: `${protocol}//${u.host}${path}`,
    protocol,
    hostname: u.hostname.startsWith('[') ? u.hostname.slice(1, -1) : u.hostname,
    port: u.port ? Number(u.port) : protocol === 'https:' ? 443 : 80,
  };
}

/** True for `localhost` and any RFC 6761 `*.localhost` name. */
function isLocalhostName(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost');
}

function parseIpv4(s: string): number[] | null {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

function parseIpv6Words(s: string): number[] | null {
  if (s === '') return [];
  const out: number[] = [];
  for (const part of s.split(':')) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    out.push(parseInt(part, 16));
  }
  return out;
}

/** Expand an IPv6 literal (no brackets) to 16 bytes, or null if malformed. */
function parseIpv6ToBytes(input: string): number[] | null {
  let s = input.toLowerCase();
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);
  if (s === '') return null;

  if (s.includes('.')) {
    const idx = s.lastIndexOf(':');
    if (idx === -1) return null;
    const v4 = parseIpv4(s.slice(idx + 1));
    if (!v4) return null;
    const w1 = ((v4[0]! << 8) | v4[1]!).toString(16);
    const w2 = ((v4[2]! << 8) | v4[3]!).toString(16);
    s = `${s.slice(0, idx + 1)}${w1}:${w2}`;
  }

  const dbl = s.indexOf('::');
  if (dbl !== -1 && s.indexOf('::', dbl + 1) !== -1) return null;

  let words: number[];
  if (dbl === -1) {
    const all = parseIpv6Words(s);
    if (!all || all.length !== 8) return null;
    words = all;
  } else {
    const head = parseIpv6Words(s.slice(0, dbl));
    const tail = parseIpv6Words(s.slice(dbl + 2));
    if (!head || !tail) return null;
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    words = [...head, ...new Array<number>(missing).fill(0), ...tail];
  }

  const bytes: number[] = [];
  for (const w of words) bytes.push((w >> 8) & 0xff, w & 0xff);
  return bytes.length === 16 ? bytes : null;
}

function v4FromBytes(bytes: number[]): string {
  return bytes.join('.');
}

/** fd00:ec2::254 (AWS IMDS) expanded to 16 bytes. */
const EC2_METADATA_V6 = [0xfd, 0x00, 0x0e, 0xc2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x02, 0x54];

/** Classify one numeric address. Pure — no network. */
export function classifyIpAddress(ip: string): IpClassification {
  if (isIP(ip) === 4) {
    const octets = ip.split('.').map(Number);
    const [a, b] = octets as [number, number, number, number];
    if (a === 0) return 'unspecified';
    if (a === 127) return 'loopback';
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
    if (a === 100 && b >= 64 && b <= 127) {
      return ip === '100.100.100.200' ? 'metadata' : 'cgnat';
    }
    if (a === 169 && b === 254) {
      return ip === '169.254.169.254' ? 'metadata' : 'link-local';
    }
    if (a >= 224 && a <= 239) return 'multicast';
    if (a >= 240) return ip === '255.255.255.255' ? 'broadcast' : 'reserved';
    return 'public';
  }

  if (isIP(ip) !== 6) return 'invalid';
  const bytes = parseIpv6ToBytes(ip);
  if (!bytes) return 'invalid';

  if (bytes.every((b) => b === 0)) return 'unspecified';
  if (bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1) return 'loopback';
  // IPv4-mapped ::ffff:0:0/96 and IPv4-compatible ::/96 — classify the embedded v4.
  if (bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return classifyIpAddress(v4FromBytes(bytes.slice(12)));
  }
  if (bytes.slice(0, 12).every((b) => b === 0)) {
    return classifyIpAddress(v4FromBytes(bytes.slice(12)));
  }
  // NAT64 well-known prefix 64:ff9b::/96 also wraps an IPv4 address.
  if (
    bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b
    && bytes.slice(4, 12).every((b) => b === 0)
  ) {
    return classifyIpAddress(v4FromBytes(bytes.slice(12)));
  }
  if ((bytes[0]! & 0xfe) === 0xfc) {
    // fd00:ec2::254 — the AWS IMDS IPv6 endpoint, inside the ULA range.
    const isEc2Metadata = bytes.every((b, i) => b === EC2_METADATA_V6[i]);
    return isEc2Metadata ? 'metadata' : 'ula';
  }
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) return 'link-local';
  if (bytes[0] === 0xff) return 'multicast';
  return 'public';
}

async function defaultLookup(hostname: string): Promise<string[]> {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
}

function kindMessage(reason: EndpointBlockReason, hostname: string, address: string): string {
  switch (reason) {
    case 'link-local':
      return `Refusing to connect to link-local address ${address} (host "${hostname}").`;
    case 'metadata':
      return `Refusing to connect to cloud metadata address ${address} (host "${hostname}").`;
    case 'unspecified':
      return `Refusing to connect to unspecified address ${address} (host "${hostname}").`;
    case 'multicast':
      return `Refusing to connect to multicast address ${address} (host "${hostname}").`;
    case 'broadcast':
      return `Refusing to connect to broadcast address ${address} (host "${hostname}").`;
    case 'reserved':
      return `Refusing to connect to reserved address ${address} (host "${hostname}").`;
    default:
      return `Refusing to connect to blocked address ${address} (host "${hostname}").`;
  }
}

/**
 * Validate the URL and every address it resolves to. Throws
 * `EndpointBlockedError` (code `ENDPOINT_BLOCKED`) with a fix list when the
 * endpoint is not allowed. Returns the canonical base URL plus the checked
 * addresses.
 *
 * TOCTOU: DNS is resolved here and the socket connects later, so a hostile
 * resolver could swap the record in between. There is no dependency-free way
 * to pin the socket to the vetted address, so the window stays open; callers
 * must therefore call this again immediately before each request and must set
 * `redirect: 'manual'` so a 3xx cannot redirect the request to a fresh,
 * unvetted host.
 */
export async function assertEndpointAllowed(
  rawUrl: string,
  opts: EndpointGuardOptions = {},
): Promise<EndpointInfo> {
  const parsed = parseEndpointUrl(rawUrl);
  const { hostname } = parsed;

  let addresses: string[];
  if (isLocalhostName(hostname)) {
    addresses = ['127.0.0.1'];
  } else if (isIP(hostname) !== 0) {
    addresses = [hostname];
  } else {
    const lookup = opts.lookup ?? defaultLookup;
    try {
      addresses = await lookup(hostname);
    } catch {
      throw block('unresolvable', `Could not resolve host "${hostname}".`);
    }
    if (addresses.length === 0) {
      throw block('unresolvable', `Could not resolve host "${hostname}" to any address.`);
    }
  }

  let anyPublic = false;
  for (const address of addresses) {
    const kind = classifyIpAddress(address);
    if (kind === 'public') {
      anyPublic = true;
      continue;
    }
    if (ALLOWED_KINDS.has(kind)) continue;
    if (isBlockReason(kind)) throw block(kind, kindMessage(kind, hostname, address));
    throw block('unresolvable', `Host "${hostname}" resolved to an unrecognized address.`);
  }

  if (anyPublic && parsed.protocol === 'http:') {
    throw block('public-over-http', `Refusing plain http:// to public host "${hostname}".`);
  }

  return { ...parsed, public: anyPublic, addresses };
}

/** Non-throwing variant for probe/status code paths. */
export async function isEndpointAllowed(
  rawUrl: string,
  opts: EndpointGuardOptions = {},
): Promise<boolean> {
  try {
    await assertEndpointAllowed(rawUrl, opts);
    return true;
  } catch {
    return false;
  }
}

/** Build the redirect-refusal error used after a `redirect: 'manual'` fetch. */
export function redirectBlocked(url: string): EndpointBlockedError {
  return block('redirect', `Refusing to follow redirect from local inference endpoint ${url}.`);
}
