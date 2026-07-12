import type { ModuleTool } from '@canvas-toolchain/module-contract';
import { classifyAnnouncements, type TermWindow } from './audit.js';
import { AnnouncementsClient, loadCanvasCreds, type CanvasClientOptions } from './canvas.js';

export interface AuditArgs { courseId: number; termStart?: string; termEnd?: string }
export interface RecreateArgs { courseId: number; announcementId: number; newDelayedPostAt: string; confirm?: boolean }

/** #128: refuse garbage before any Canvas call — the two-call gate is only
 *  meaningful when it previews a valid change. */
function isCanvasId(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}
function isParseableDate(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

export async function handleAudit(args: AuditArgs, opts: CanvasClientOptions = {}): Promise<Record<string, unknown>> {
  if (!isCanvasId(args.courseId)) {
    return { error: 'INVALID_COURSE_ID', message: `courseId must be a positive integer Canvas id (got ${JSON.stringify(args.courseId)}).` };
  }
  for (const [name, value] of [['termStart', args.termStart], ['termEnd', args.termEnd]] as const) {
    if (value !== undefined && !isParseableDate(value)) {
      return { error: 'INVALID_TERM_WINDOW', message: `${name} is not a parseable ISO date: ${JSON.stringify(value)}.` };
    }
  }
  const client = new AnnouncementsClient(loadCanvasCreds(), opts);
  const rows = await client.listAnnouncements(args.courseId);
  const term: TermWindow = { termStart: args.termStart, termEnd: args.termEnd };
  const result = classifyAnnouncements(rows, Date.now(), term);
  return {
    courseId: args.courseId,
    stale: result.stale,
    ok: result.ok,
    note: result.stale.length > 0
      ? 'Stale announcements usually come from a course copy keeping last term\'s fire dates. Recreate each with recreate_announcement, then delete the stale original in Canvas.'
      : 'No stale scheduled announcements found.',
  };
}

export async function handleRecreate(args: RecreateArgs, opts: CanvasClientOptions = {}): Promise<Record<string, unknown>> {
  if (!isCanvasId(args.courseId)) {
    return { error: 'INVALID_COURSE_ID', message: `courseId must be a positive integer Canvas id (got ${JSON.stringify(args.courseId)}).` };
  }
  if (!isCanvasId(args.announcementId)) {
    return { error: 'INVALID_ANNOUNCEMENT_ID', message: `announcementId must be a positive integer Canvas id (got ${JSON.stringify(args.announcementId)}).` };
  }
  if (!isParseableDate(args.newDelayedPostAt)) {
    return {
      error: 'INVALID_DATE',
      message: `newDelayedPostAt is not a parseable ISO date/time: ${JSON.stringify(args.newDelayedPostAt)}. ` +
        'Use e.g. "2026-08-25T09:00:00Z". Nothing was created.',
    };
  }
  const client = new AnnouncementsClient(loadCanvasCreds(), opts);
  const rows = await client.listAnnouncements(args.courseId);
  const original = rows.find((r) => r.id === args.announcementId);
  if (!original) {
    return { error: 'ANNOUNCEMENT_NOT_FOUND', message: `No announcement ${args.announcementId} in course ${args.courseId}.` };
  }
  if (!args.confirm) {
    return {
      preview: true,
      title: original.title,
      oldDelayedPostAt: original.delayed_post_at,
      newDelayedPostAt: args.newDelayedPostAt,
      note: 'Nothing has been created. Call again with confirm: true to create the corrected copy.',
    };
  }
  const created = await client.createAnnouncement(args.courseId, {
    title: original.title,
    message: original.message,
    delayedPostAt: args.newDelayedPostAt,
  });
  return {
    created,
    note: `Created a corrected copy of "${original.title}" scheduled for ${args.newDelayedPostAt}. ` +
      'Now delete the stale original in Canvas (this tool never deletes anything).',
  };
}

export const announcementTools: ModuleTool[] = [
  {
    schema: {
      name: 'audit_announcements',
      description: 'List a course\'s announcements and flag scheduled ones with stale fire dates (already passed, or outside the term window if termStart/termEnd are given) — the classic course-copy gotcha. Read-only.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          courseId: { type: 'number', description: 'Canvas course id.' },
          termStart: { type: 'string', description: 'Optional ISO date — fire dates before this are flagged.' },
          termEnd: { type: 'string', description: 'Optional ISO date — fire dates after this are flagged.' },
        },
        required: ['courseId'],
      },
    },
    handler: async (args: unknown) => ({
      content: [{ type: 'text', text: JSON.stringify(await handleAudit(args as AuditArgs), null, 2) }],
    }),
  },
  {
    schema: {
      name: 'recreate_announcement',
      description: 'Create a corrected copy of a stale scheduled announcement with a new fire date. Two-call gate: previews first; confirm: true creates. Never deletes the original — you remove it in Canvas.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          courseId: { type: 'number', description: 'Canvas course id.' },
          announcementId: { type: 'number', description: 'Id of the stale announcement (from audit_announcements).' },
          newDelayedPostAt: { type: 'string', description: 'Corrected ISO fire date.' },
          confirm: { type: 'boolean', description: 'Set true on the second call to actually create.' },
        },
        required: ['courseId', 'announcementId', 'newDelayedPostAt'],
      },
    },
    handler: async (args: unknown) => ({
      content: [{ type: 'text', text: JSON.stringify(await handleRecreate(args as RecreateArgs), null, 2) }],
    }),
  },
];
