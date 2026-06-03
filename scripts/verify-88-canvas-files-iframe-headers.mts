// scripts/verify-88-canvas-files-iframe-headers.mts
// Verifies that Canvas Files /preview URL returns iframe-friendly headers
// (no X-Frame-Options: DENY, no restrictive CSP frame-ancestors).
//
// Plan A Task 0.1 — modified from the original plan to do upload via API
// instead of the manual UI step, so this script runs fully autonomously.
//
// Usage: npx tsx scripts/verify-88-canvas-files-iframe-headers.mts <courseId>

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const courseId = process.argv[2];
if (!courseId) {
  console.error('Usage: tsx scripts/verify-88-canvas-files-iframe-headers.mts <courseId>');
  process.exit(1);
}

const cfgPath = join(homedir(), '.command-and-control', 'canvas-config.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as { host: string; token: string };
const baseUrl = `https://${cfg.host}/api/v1`;
const auth = { Authorization: `Bearer ${cfg.token}` };

const filename = 'widget-iframe-probe.html';
const body = '<!DOCTYPE html><html><body><p>iframe probe</p></body></html>';

// Step 1: request upload URL from Canvas
console.log(`Step 1: requesting upload URL for ${filename}...`);
const initRes = await fetch(`${baseUrl}/courses/${courseId}/files`, {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json' },
  body: JSON.stringify({
    name: filename,
    size: body.length,
    content_type: 'text/html',
    on_duplicate: 'overwrite',
    parent_folder_path: '/widget-probes',
  }),
});
if (!initRes.ok) {
  console.error(`init failed: ${initRes.status} ${await initRes.text()}`);
  process.exit(2);
}
const init = await initRes.json() as { upload_url: string; upload_params: Record<string, string>; file_param: string };
console.log(`  upload_url: ${init.upload_url}`);

// Step 2: POST file to S3
console.log(`Step 2: uploading file bytes...`);
const form = new FormData();
for (const [k, v] of Object.entries(init.upload_params)) form.append(k, v);
form.append(init.file_param, new Blob([body], { type: 'text/html' }), filename);
const putRes = await fetch(init.upload_url, { method: 'POST', body: form, redirect: 'manual' });
if (putRes.status !== 301 && putRes.status !== 302 && !putRes.ok) {
  console.error(`put failed: ${putRes.status}`);
  process.exit(3);
}

// Step 3: confirm
const confirmUrl = putRes.headers.get('location');
if (!confirmUrl) {
  console.error('no Location header for confirm');
  process.exit(4);
}
console.log(`Step 3: confirming...`);
const confirmRes = await fetch(confirmUrl, { method: 'GET', headers: auth });
if (!confirmRes.ok) {
  console.error(`confirm failed: ${confirmRes.status} ${await confirmRes.text()}`);
  process.exit(5);
}
const confirmed = await confirmRes.json() as { id: number };
const fileId = confirmed.id;
console.log(`  file_id: ${fileId}`);

// Step 4: probe the /preview URL headers
const previewUrl = `https://${cfg.host}/courses/${courseId}/files/${fileId}/preview`;
console.log(`\nProbing ${previewUrl} ...`);
const probeRes = await fetch(previewUrl, {
  method: 'GET',
  headers: auth,
  redirect: 'manual',
});

console.log(`Status: ${probeRes.status}`);
console.log('Relevant headers:');
for (const h of ['x-frame-options', 'content-security-policy', 'content-type', 'location']) {
  console.log(`  ${h}: ${probeRes.headers.get(h) ?? '(absent)'}`);
}

const xfo = probeRes.headers.get('x-frame-options')?.toLowerCase() ?? '';
const csp = probeRes.headers.get('content-security-policy')?.toLowerCase() ?? '';
const frameAncestorsBlocked = csp.includes("frame-ancestors 'none'");

console.log('');
if (xfo === 'deny' || frameAncestorsBlocked) {
  console.error('FAIL: Canvas Files /preview cannot be iframe-embedded. Architecture invalid.');
  process.exit(10);
}
if (xfo === 'sameorigin' || xfo === '') {
  console.log(`PASS: iframe embedding works from same-origin Canvas page. (x-frame-options="${xfo || '(absent)'}")`);
  process.exit(0);
}
console.warn(`UNCLEAR: x-frame-options="${xfo}", csp="${csp}". Manual inspection required.`);
process.exit(20);
