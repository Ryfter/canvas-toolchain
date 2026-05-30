import type { PreviewManifest } from './manifest_types.js';

export type ApprovalAction = 'approve' | 'skip';
export type ApprovalMap = Record<string, ApprovalAction>;

export interface ApprovalValidation {
  ok: boolean;
  missing: string[];
  unknown: string[];
}

export function validateApprovals(manifest: PreviewManifest, approvals: ApprovalMap): ApprovalValidation {
  const required = new Set<string>(
    manifest.entries.filter(e => e.type !== 'skipped').map(e => e.filename),
  );
  const provided = new Set<string>(Object.keys(approvals));
  const missing: string[] = [];
  for (const f of required) if (!provided.has(f)) missing.push(f);
  const unknown: string[] = [];
  for (const f of provided) if (!required.has(f)) unknown.push(f);
  return { ok: missing.length === 0 && unknown.length === 0, missing, unknown };
}

export function approvedFilenames(approvals: ApprovalMap): string[] {
  return Object.entries(approvals).filter(([, a]) => a === 'approve').map(([f]) => f);
}
