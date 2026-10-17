import { describe, expect, it, vi } from 'vitest';
import {
  assertEndpointAllowed,
  classifyIpAddress,
  isEndpointAllowed,
  parseEndpointUrl,
  EndpointBlockedError,
} from '../src/endpoint-guard.js';

const lookupOf = (...addresses: string[]) => vi.fn(async () => addresses);

async function expectBlocked(rawUrl: string, reason: string, opts?: Parameters<typeof assertEndpointAllowed>[1]) {
  const err = await assertEndpointAllowed(rawUrl, opts).then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(EndpointBlockedError);
  expect(err).toMatchObject({ code: 'ENDPOINT_BLOCKED', reason });
  return err as EndpointBlockedError;
}

describe('parseEndpointUrl', () => {
  it('rejects non-http(s) schemes', () => {
    for (const url of ['file:///etc/passwd', 'ftp://localhost/x', 'gopher://localhost/', 'javascript:alert(1)']) {
      expect(() => parseEndpointUrl(url)).toThrowError(
        expect.objectContaining({ code: 'ENDPOINT_BLOCKED', reason: 'scheme' }),
      );
    }
  });

  it('rejects embedded credentials', () => {
    expect(() => parseEndpointUrl('http://user:pass@localhost:11434/')).toThrowError(
      expect.objectContaining({ reason: 'userinfo' }),
    );
  });

  it('rejects an unparseable URL without echoing it', () => {
    expect(() => parseEndpointUrl('http://')).toThrowError(
      expect.objectContaining({ reason: 'invalid-url' }),
    );
  });

  it('keeps a path, drops query/fragment and trailing slash, and strips brackets from IPv6', () => {
    expect(parseEndpointUrl('http://localhost:11434/').url).toBe('http://localhost:11434');
    expect(parseEndpointUrl('http://localhost:11434/v1').url).toBe('http://localhost:11434/v1');
    expect(parseEndpointUrl('http://localhost:11434/v1/').url).toBe('http://localhost:11434/v1');
    expect(parseEndpointUrl('http://localhost:11434/?a=b#c').url).toBe('http://localhost:11434');
    expect(parseEndpointUrl('http://[::1]:11434/').hostname).toBe('::1');
  });

  it('never echoes the raw input in an error message', () => {
    const err = (() => {
      try {
        parseEndpointUrl('http://user:sup3rsecret@localhost/');
        return null;
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err?.message).not.toContain('sup3rsecret');
  });

  it('strips a single trailing dot from a hostname', () => {
    expect(parseEndpointUrl('http://localhost.:11434').hostname).toBe('localhost');
    expect(parseEndpointUrl('http://localhost.:11434').url).toBe('http://localhost:11434');
    expect(parseEndpointUrl('http://example.com.').hostname).toBe('example.com');
    expect(parseEndpointUrl('https://example.com.:443/v1').url).toBe('https://example.com/v1');
  });
});

describe('assertEndpointAllowed — allowed targets', () => {
  it.each([
    'http://localhost:11434',
    'http://127.0.0.1:11434',
    'http://127.1.2.3:11434',
    'http://[::1]:11434',
    'http://192.168.1.50:11434',
    'http://10.0.0.5:11434',
    'http://172.16.0.9:11434',
    'http://100.101.102.103:11434',
    'http://[fd00::1]:11434',
    'https://8.8.8.8',
  ])('allows %s', async (url) => {
    const info = await assertEndpointAllowed(url);
    expect(info.url).toBe(new URL(url).protocol + '//' + new URL(url).host + (new URL(url).pathname === '/' ? '' : new URL(url).pathname));
  });

  it('does not touch the network for IP literals or localhost', async () => {
    const lookup = vi.fn();
    await assertEndpointAllowed('http://127.0.0.1:11434', { lookup });
    await assertEndpointAllowed('http://localhost:11434', { lookup });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('reports a public host as public', async () => {
    const info = await assertEndpointAllowed('https://1.1.1.1');
    expect(info.public).toBe(true);
  });

  it('short-circuits DNS only for the exact name "localhost"', async () => {
    const lookup = vi.fn(async () => ['127.0.0.1']);
    await assertEndpointAllowed('http://localhost:11434', { lookup });
    await assertEndpointAllowed('http://localhost.:11434', { lookup });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('resolves *.localhost through lookup and classifies the answer', async () => {
    const lookup = lookupOf('127.0.0.1');
    await expect(assertEndpointAllowed('http://app.localhost:11434', { lookup })).resolves.toMatchObject({
      public: false,
    });
    expect(lookup).toHaveBeenCalledWith('app.localhost');
    await expect(assertEndpointAllowed('http://evil.localhost:11434', { lookup: lookupOf('169.254.169.254') }))
      .rejects.toMatchObject({ code: 'ENDPOINT_BLOCKED', reason: 'metadata' });
  });
});

describe('IPv6 transition forms and reserved ranges', () => {
  it.each([
    ['2002:a9fe:a9fe::1', 'metadata'], // 6to4 embedding 169.254.169.254
    ['2002:808:808::1', 'public'], // 6to4 embedding 8.8.8.8
    ['2001:0:4136:e378:8000:63bf:5601:5601', 'reserved'], // Teredo (RFC 4380)
    ['64:ff9b:1::a9fe:a9fe', 'metadata'], // NAT64 local-use /48 (RFC 8215)
    ['64:ff9b:1::808:808', 'public'], // NAT64 local-use over a public v4
    ['::ffff:0:a9fe:a9fe', 'metadata'], // SIIT IPv4-translated (RFC 2765)
    ['::ffff:0:808:808', 'public'], // SIIT IPv4-translated over a public v4
    ['100::1', 'reserved'], // discard-only (RFC 6666)
    ['2001:db8::1', 'reserved'], // documentation (RFC 3849)
    ['2001:2::1', 'reserved'], // benchmarking (RFC 5180)
    ['2001:10::1', 'reserved'], // deprecated ORCHID (RFC 4843)
    ['3fff::1', 'reserved'], // documentation (RFC 9637)
    ['fec0::1', 'reserved'], // deprecated site-local (RFC 3879)
    ['5f00::1', 'reserved'], // SRv6 SIDs (RFC 9602)
    ['4000::1', 'reserved'], // outside global unicast 2000::/3
    ['192.0.0.1', 'reserved'],
    ['192.0.2.1', 'reserved'],
    ['192.88.99.1', 'reserved'],
    ['198.18.0.1', 'reserved'],
    ['198.19.255.255', 'reserved'],
    ['198.51.100.1', 'reserved'],
    ['203.0.113.1', 'reserved'],
    ['240.0.0.1', 'reserved'],
  ])('classifies %s as %s', (ip, kind) => {
    expect(classifyIpAddress(ip)).toBe(kind);
  });

  it.each([
    ['https://[2002:a9fe:a9fe::1]:11434', 'metadata'],
    ['https://[2001:0:4136:e378:8000:63bf:5601:5601]:11434', 'reserved'],
    ['https://[64:ff9b:1::a9fe:a9fe]:11434', 'metadata'],
    ['https://[::ffff:0:a9fe:a9fe]:11434', 'metadata'],
    ['http://[100::1]:11434', 'reserved'],
    ['http://[2001:db8::1]:11434', 'reserved'],
    ['http://[2001:2::1]:11434', 'reserved'],
    ['http://[fec0::1]:11434', 'reserved'],
    ['http://192.0.2.1:11434', 'reserved'],
    ['http://198.18.0.1:11434', 'reserved'],
    ['http://203.0.113.1:11434', 'reserved'],
  ])('refuses %s as %s without fetching', async (url, reason) => {
    await expectBlocked(url, reason);
  });

  it('still allows a 6to4 spelling of a private IPv4 target', async () => {
    // 2002:0a00:0001::/48 embeds 10.0.0.1, which is allowed over http.
    await expect(assertEndpointAllowed('http://[2002:a00:1::1]:11434')).resolves.toMatchObject({
      public: false,
    });
  });
});

describe('assertEndpointAllowed — blocked targets', () => {
  it('blocks link-local, metadata, unspecified and multicast literals', async () => {
    await expectBlocked('http://169.254.169.254/', 'metadata');
    await expectBlocked('http://100.100.100.200/', 'metadata');
    await expectBlocked('http://[fd00:ec2::254]/', 'metadata');
    await expectBlocked('http://169.254.1.1/', 'link-local');
    await expectBlocked('http://[fe80::1]/', 'link-local');
    await expectBlocked('http://0.0.0.0/', 'unspecified');
    await expectBlocked('http://[::]/', 'unspecified');
    await expectBlocked('http://224.0.0.1/', 'multicast');
    await expectBlocked('http://255.255.255.255/', 'broadcast');
  });

  it('blocks odd IPv4 encodings that normalize to a blocked address', async () => {
    await expectBlocked('http://2852039166/', 'metadata');
    await expectBlocked('http://0xA9FEA9FE/', 'metadata');
    await expectBlocked('http://[::ffff:169.254.169.254]/', 'metadata');
    await expectBlocked('http://[::ffff:a9fe:a9fe]/', 'metadata');
    await expectBlocked('http://[64:ff9b::a9fe:a9fe]/', 'metadata');
  });

  it('rejects plain http to a public host but allows https', async () => {
    await expectBlocked('http://8.8.8.8/', 'public-over-http');
    await expect(assertEndpointAllowed('https://8.8.8.8/')).resolves.toMatchObject({ public: true });
  });

  it('blocks a metadata hostname that resolves to a blocked IP', async () => {
    await expectBlocked('http://metadata.google.internal/', 'metadata', {
      lookup: lookupOf('169.254.169.254'),
    });
  });

  it('refuses a hostname that resolves to both a LAN and a link-local address', async () => {
    await expectBlocked('http://mixed.example/', 'link-local', {
      lookup: lookupOf('192.168.1.5', '169.254.1.1'),
    });
  });

  it('refuses an unresolvable host', async () => {
    await expectBlocked('http://nope.example/', 'unresolvable', {
      lookup: vi.fn(async () => {
        throw new Error('ENOTFOUND');
      }),
    });
  });

  it('refuses a hostname that resolves to a public address over http', async () => {
    await expectBlocked('http://mixed.example/', 'public-over-http', {
      lookup: lookupOf('192.168.1.5', '8.8.8.8'),
    });
  });

  it('re-checks on every call, so a rebinding lookup is refused', async () => {
    const lookup = vi
      .fn<Parameters<() => Promise<string[]>>, Promise<string[]>>()
      .mockResolvedValueOnce(['192.168.1.50'])
      .mockResolvedValueOnce(['169.254.169.254']);

    await expect(assertEndpointAllowed('http://lan.example:11434', { lookup })).resolves.toMatchObject({
      public: false,
    });
    await expectBlocked('http://lan.example:11434', 'metadata', { lookup });
  });
});

describe('classifyIpAddress', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['::1', 'loopback'],
    ['10.1.2.3', 'private'],
    ['172.31.0.1', 'private'],
    ['192.168.0.1', 'private'],
    ['100.64.0.1', 'cgnat'],
    ['100.127.255.254', 'cgnat'],
    ['fd12:3456::1', 'ula'],
    ['169.254.0.1', 'link-local'],
    ['fe80::abcd', 'link-local'],
    ['169.254.169.254', 'metadata'],
    ['100.100.100.200', 'metadata'],
    ['fd00:ec2::254', 'metadata'],
    ['0.0.0.0', 'unspecified'],
    ['::', 'unspecified'],
    ['::ffff:7f00:1', 'loopback'],
    ['::ffff:a9fe:a9fe', 'metadata'],
    ['::ffff:169.254.169.254', 'metadata'],
    ['64:ff9b::a9fe:a9fe', 'metadata'],
    ['64:ff9b::808:808', 'public'],
    ['::7f00:1', 'loopback'],
    ['239.1.1.1', 'multicast'],
    ['ff02::1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
    ['1.1.1.1', 'public'],
    ['2606:4700::1111', 'public'],
    ['not-an-ip', 'invalid'],
  ])('classifies %s as %s', (ip, kind) => {
    expect(classifyIpAddress(ip)).toBe(kind);
  });
});

describe('isEndpointAllowed', () => {
  it('returns boolean without throwing', async () => {
    await expect(isEndpointAllowed('http://localhost:11434')).resolves.toBe(true);
    await expect(isEndpointAllowed('http://169.254.169.254/')).resolves.toBe(false);
  });
});
