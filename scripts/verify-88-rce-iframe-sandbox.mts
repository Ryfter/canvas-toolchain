// scripts/verify-88-rce-iframe-sandbox.mts
// Verifies that the Canvas RCE preserves iframe sandbox attributes when a page is saved via API.
// Critical because some Canvas instances strip sandbox= attributes during HTML sanitization.
// Usage: npx tsx scripts/verify-88-rce-iframe-sandbox.mts <courseId>

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const courseId = process.argv[2];
if (!courseId) {
  console.error('Usage: tsx scripts/verify-88-rce-iframe-sandbox.mts <courseId>');
  process.exit(1);
}

const cfgPath = join(homedir(), '.command-and-control', 'canvas-config.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as { host: string; token: string };
const baseUrl = `https://${cfg.host}/api/v1`;
const auth = { Authorization: `Bearer ${cfg.token}` };

const probeSlug = 'widget-iframe-sandbox-probe';
const writtenSandbox = 'allow-scripts allow-same-origin allow-forms';
const writtenHtml = `<p>Probe page.</p>\n<iframe src="/courses/${courseId}/files/0/preview" width="100%" height="400" title="probe" sandbox="${writtenSandbox}" loading="lazy">fallback</iframe>`;

// Create or update the page (overwrite if it already exists from a prior run)
console.log(`Creating page "${probeSlug}" with iframe sandbox attrs...`);
const createRes = await fetch(`${baseUrl}/courses/${courseId}/pages`, {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json' },
  body: JSON.stringify({ wiki_page: { title: 'Widget Iframe Sandbox Probe', body: writtenHtml, published: false } }),
});

if (!createRes.ok && createRes.status !== 400) {
  console.error(`create failed: ${createRes.status} ${await createRes.text()}`);
  process.exit(2);
}

// If the page already exists, update it instead
if (createRes.status === 400) {
  console.log(`  page exists, updating instead...`);
  const updateRes = await fetch(`${baseUrl}/courses/${courseId}/pages/${probeSlug}`, {
    method: 'PUT',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ wiki_page: { body: writtenHtml } }),
  });
  if (!updateRes.ok) {
    console.error(`update failed: ${updateRes.status} ${await updateRes.text()}`);
    process.exit(3);
  }
}

// Fetch the page back to see what Canvas stored
console.log(`Fetching the page back to inspect what Canvas RCE preserved...`);
const getRes = await fetch(`${baseUrl}/courses/${courseId}/pages/${probeSlug}`, { headers: auth });
if (!getRes.ok) {
  console.error(`get failed: ${getRes.status} ${await getRes.text()}`);
  process.exit(4);
}
const page = await getRes.json() as { body: string };
const fetchedHtml = page.body;

console.log('\n--- Wrote to Canvas ---');
console.log(writtenHtml);
console.log('\n--- Read back from Canvas ---');
console.log(fetchedHtml);
console.log('');

const fetchedSandbox = fetchedHtml.match(/sandbox="([^"]*)"/)?.[1];

if (fetchedSandbox === writtenSandbox) {
  console.log(`PASS: Canvas RCE preserved sandbox attribute exactly: "${fetchedSandbox}"`);
  // Clean up the probe page
  await fetch(`${baseUrl}/courses/${courseId}/pages/${probeSlug}`, { method: 'DELETE', headers: auth });
  console.log('(cleaned up probe page)');
  process.exit(0);
}

if (!fetchedSandbox) {
  console.error(`FAIL: sandbox attribute was STRIPPED by Canvas RCE.`);
  console.error(`Wrote: sandbox="${writtenSandbox}"`);
  console.error(`Read:  sandbox=(missing)`);
  process.exit(10);
}

console.warn(`PARTIAL: sandbox attribute changed but still present.`);
console.warn(`Wrote: "${writtenSandbox}"`);
console.warn(`Read:  "${fetchedSandbox}"`);
console.warn('Architecture may still work depending on which permissions were preserved.');
process.exit(11);
