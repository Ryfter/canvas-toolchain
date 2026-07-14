import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);

// packages/module-announcements/src/audit.ts
function classifyAnnouncements(rows, nowMs, term = {}) {
  const stale = [];
  const ok = [];
  for (const row of rows) {
    if (!row.delayed_post_at) {
      ok.push({ id: row.id, title: row.title, delayedPostAt: null });
      continue;
    }
    const fire = Date.parse(row.delayed_post_at);
    let reason = null;
    if (Number.isNaN(fire)) {
      reason = `fire date "${row.delayed_post_at}" could not be parsed`;
    } else if (fire < nowMs) {
      reason = `fire date ${row.delayed_post_at} has already passed`;
    } else if (term.termStart && fire < Date.parse(term.termStart)) {
      reason = `fire date ${row.delayed_post_at} is outside the term (before ${term.termStart})`;
    } else if (term.termEnd && fire > Date.parse(term.termEnd)) {
      reason = `fire date ${row.delayed_post_at} is outside the term (after ${term.termEnd})`;
    }
    if (reason) stale.push({ id: row.id, title: row.title, delayedPostAt: row.delayed_post_at, reason });
    else ok.push({ id: row.id, title: row.title, delayedPostAt: row.delayed_post_at });
  }
  return { stale, ok };
}

// packages/module-announcements/src/canvas.ts
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function loadCanvasCreds() {
  const path = join(process.env.CC_HOME ?? join(homedir(), ".command-and-control"), "canvas-config.json");
  if (!existsSync(path)) throw new Error("CANVAS_NOT_CONFIGURED: Run setup_canvas with your Canvas host and token.");
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    throw new Error("CANVAS_NOT_CONFIGURED: canvas-config.json is corrupt. Re-run setup_canvas.");
  }
  if (!cfg.host || !cfg.token) throw new Error("CANVAS_NOT_CONFIGURED: canvas-config.json missing host/token.");
  return { host: cfg.host, token: cfg.token };
}
function parseNextLink(link) {
  if (!link) return void 0;
  for (const part of link.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return void 0;
}
function assertSameCanvasOrigin(nextUrl, host) {
  const expectedOrigin = new URL(`https://${host}`).origin;
  let next;
  try {
    next = new URL(nextUrl);
  } catch {
    throw new Error('CANVAS_PAGINATION_OFF_HOST: Canvas returned an unparseable Link "next" URL; refusing to continue pagination.');
  }
  if (next.origin !== expectedOrigin) {
    throw new Error(`CANVAS_PAGINATION_OFF_HOST: refusing to follow a Link header to ${next.origin}; credentials are only sent to ${expectedOrigin}.`);
  }
  return next.toString();
}
var AnnouncementsClient = class {
  constructor(creds, opts = {}) {
    this.creds = creds;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }
  creds;
  fetchImpl;
  base() {
    return `https://${this.creds.host}/api/v1`;
  }
  headers() {
    return { Authorization: `Bearer ${this.creds.token}`, "Content-Type": "application/json", Accept: "application/json" };
  }
  /** Announcements are discussion topics with only_announcements=true; paginated. */
  async listAnnouncements(courseId) {
    const out = [];
    let next = `${this.base()}/courses/${courseId}/discussion_topics?only_announcements=true&per_page=100`;
    while (next) {
      const res = await this.fetchImpl(next, { method: "GET", headers: this.headers() });
      if (!res.ok) throw new Error(`Canvas GET ${next} failed: ${res.status}`);
      out.push(...await res.json());
      const rawNext = parseNextLink(res.headers.get("link"));
      next = rawNext === void 0 ? void 0 : assertSameCanvasOrigin(rawNext, this.creds.host);
    }
    return out;
  }
  async createAnnouncement(courseId, input) {
    const res = await this.fetchImpl(`${this.base()}/courses/${courseId}/discussion_topics`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        title: input.title,
        message: input.message,
        is_announcement: true,
        delayed_post_at: input.delayedPostAt,
        published: true
      })
    });
    if (!res.ok) throw new Error(`Canvas POST discussion_topics failed: ${res.status}`);
    return await res.json();
  }
};

// packages/module-announcements/src/tools.ts
function isCanvasId(v) {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}
function isParseableDate(v) {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}
async function handleAudit(args, opts = {}) {
  if (!isCanvasId(args.courseId)) {
    return { error: "INVALID_COURSE_ID", message: `courseId must be a positive integer Canvas id (got ${JSON.stringify(args.courseId)}).` };
  }
  for (const [name, value] of [["termStart", args.termStart], ["termEnd", args.termEnd]]) {
    if (value !== void 0 && !isParseableDate(value)) {
      return { error: "INVALID_TERM_WINDOW", message: `${name} is not a parseable ISO date: ${JSON.stringify(value)}.` };
    }
  }
  const client = new AnnouncementsClient(loadCanvasCreds(), opts);
  const rows = await client.listAnnouncements(args.courseId);
  const term = { termStart: args.termStart, termEnd: args.termEnd };
  const result = classifyAnnouncements(rows, Date.now(), term);
  return {
    courseId: args.courseId,
    stale: result.stale,
    ok: result.ok,
    note: result.stale.length > 0 ? "Stale announcements usually come from a course copy keeping last term's fire dates. Recreate each with recreate_announcement, then delete the stale original in Canvas." : "No stale scheduled announcements found."
  };
}
async function handleRecreate(args, opts = {}) {
  if (!isCanvasId(args.courseId)) {
    return { error: "INVALID_COURSE_ID", message: `courseId must be a positive integer Canvas id (got ${JSON.stringify(args.courseId)}).` };
  }
  if (!isCanvasId(args.announcementId)) {
    return { error: "INVALID_ANNOUNCEMENT_ID", message: `announcementId must be a positive integer Canvas id (got ${JSON.stringify(args.announcementId)}).` };
  }
  if (!isParseableDate(args.newDelayedPostAt)) {
    return {
      error: "INVALID_DATE",
      message: `newDelayedPostAt is not a parseable ISO date/time: ${JSON.stringify(args.newDelayedPostAt)}. Use e.g. "2026-08-25T09:00:00Z". Nothing was created.`
    };
  }
  const client = new AnnouncementsClient(loadCanvasCreds(), opts);
  const rows = await client.listAnnouncements(args.courseId);
  const original = rows.find((r) => r.id === args.announcementId);
  if (!original) {
    return { error: "ANNOUNCEMENT_NOT_FOUND", message: `No announcement ${args.announcementId} in course ${args.courseId}.` };
  }
  if (!args.confirm) {
    return {
      preview: true,
      title: original.title,
      oldDelayedPostAt: original.delayed_post_at,
      newDelayedPostAt: args.newDelayedPostAt,
      note: "Nothing has been created. Call again with confirm: true to create the corrected copy."
    };
  }
  const created = await client.createAnnouncement(args.courseId, {
    title: original.title,
    message: original.message,
    delayedPostAt: args.newDelayedPostAt
  });
  return {
    created,
    note: `Created a corrected copy of "${original.title}" scheduled for ${args.newDelayedPostAt}. Now delete the stale original in Canvas (this tool never deletes anything).`
  };
}
var announcementTools = [
  {
    schema: {
      name: "audit_announcements",
      description: "List a course's announcements and flag scheduled ones with stale fire dates (already passed, or outside the term window if termStart/termEnd are given) \u2014 the classic course-copy gotcha. Read-only.",
      inputSchema: {
        type: "object",
        properties: {
          courseId: { type: "number", description: "Canvas course id." },
          termStart: { type: "string", description: "Optional ISO date \u2014 fire dates before this are flagged." },
          termEnd: { type: "string", description: "Optional ISO date \u2014 fire dates after this are flagged." }
        },
        required: ["courseId"]
      }
    },
    handler: async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await handleAudit(args), null, 2) }]
    })
  },
  {
    schema: {
      name: "recreate_announcement",
      description: "Create a corrected copy of a stale scheduled announcement with a new fire date. Two-call gate: previews first; confirm: true creates. Never deletes the original \u2014 you remove it in Canvas.",
      inputSchema: {
        type: "object",
        properties: {
          courseId: { type: "number", description: "Canvas course id." },
          announcementId: { type: "number", description: "Id of the stale announcement (from audit_announcements)." },
          newDelayedPostAt: { type: "string", description: "Corrected ISO fire date." },
          confirm: { type: "boolean", description: "Set true on the second call to actually create." }
        },
        required: ["courseId", "announcementId", "newDelayedPostAt"]
      }
    },
    handler: async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await handleRecreate(args), null, 2) }]
    })
  }
];

// packages/module-announcements/src/index.ts
var MODULE_ID = "announcements";
var announcementsModule = {
  id: MODULE_ID,
  name: "Announcements Auditor",
  description: "Find scheduled Canvas announcements whose fire dates are stale (typically after a course copy keeps last term's dates) and recreate them with corrected dates. Read-first; creation is confirm-gated; never deletes anything.",
  version: "1.1.0",
  handles: ["announcements"],
  tools: announcementTools
};
var index_default = announcementsModule;
export {
  MODULE_ID,
  classifyAnnouncements,
  index_default as default
};
