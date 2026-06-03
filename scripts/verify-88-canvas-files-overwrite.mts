// scripts/verify-88-canvas-files-overwrite.mts
// Verifies that re-uploading a file with on_duplicate=overwrite returns the SAME file_id.
// Critical for the widget update story (re-render → re-publish should not require page-HTML rewrites).
// Usage: npx tsx scripts/verify-88-canvas-files-overwrite.mts <courseId>

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const courseId = process.argv[2];
if (!courseId) {
  console.error('Usage: tsx scripts/verify-88-canvas-files-overwrite.mts <courseId>');
  process.exit(1);
}

const cfgPath = join(homedir(), '.command-and-control', 'canvas-config.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as { host: string; token: string };
const baseUrl = `https://${cfg.host}/api/v1`;
const auth = { Authorization: `Bearer ${cfg.token}` };

const filename = 'widget-overwrite-probe.html';
const body1 = '<!DOCTYPE html><html><body>v1</body></html>';
const body2 = '<!DOCTYPE html><html><body>v2</body></html>';

async function upload(body: string, label: string): Promise<number> {
  // Step 1: request upload URL
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
  if (!initRes.ok) throw new Error(`init ${label}: ${initRes.status} ${await initRes.text()}`);
  const init = await initRes.json() as { upload_url: string; upload_params: Record<string, string>; file_param: string };

  // Step 2: PUT to S3
  const form = new FormData();
  for (const [k, v] of Object.entries(init.upload_params)) form.append(k, v);
  form.append(init.file_param, new Blob([body], { type: 'text/html' }), filename);
  const putRes = await fetch(init.upload_url, { method: 'POST', body: form, redirect: 'manual' });
  if (putRes.status !== 301 && putRes.status !== 302 && !putRes.ok) throw new Error(`put ${label}: ${putRes.status}`);

  // Step 3: confirm
  const confirmUrl = putRes.headers.get('location');
  if (!confirmUrl) throw new Error(`put ${label}: no Location header for confirm`);
  const confirmRes = await fetch(confirmUrl, { method: 'GET', headers: auth });
  if (!confirmRes.ok) throw new Error(`confirm ${label}: ${confirmRes.status} ${await confirmRes.text()}`);
  const confirmed = await confirmRes.json() as { id: number };
  return confirmed.id;
}

console.log(`Uploading first version of ${filename}...`);
const id1 = await upload(body1, 'first upload');
console.log(`  file_id: ${id1}`);

console.log(`Re-uploading with on_duplicate=overwrite...`);
const id2 = await upload(body2, 'overwrite upload');
console.log(`  file_id: ${id2}`);

console.log('');
if (id1 === id2) {
  console.log(`PASS: on_duplicate=overwrite preserves file_id (${id1}). Update story valid.`);
  process.exit(0);
}
console.error(`FAIL: file_id changed on overwrite (${id1} → ${id2}). Update story would need page-HTML rewrites on every widget edit.`);
process.exit(2);
