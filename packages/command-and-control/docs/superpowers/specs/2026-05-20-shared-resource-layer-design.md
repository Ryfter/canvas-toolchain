# Shared Resource Layer — Design

**Status:** Draft (2026-05-20) — needs review
**Repo:** `D:\Dev\Command-and-Control-MCP`
**Size:** Small (single module, no cross-repo work)

---

## 1. Problem

Each app has its own KB:
- `~/.canvas-design-mcp/philosophy-kb.md`, `student-personas.md`, `course/<id>/`, `transcripts/`
- `~/.curriculum-intelligence/courses/<id>/` (config, topic-history, news-cache, history.jsonl, semesters)
- `~/.command-and-control/config.json`

These KBs are useful across app boundaries. The professor's philosophy KB should influence both CI brief drafting and CDS page generation. Student personas should factor into both. The trajectory log (CI) might signal which template to pick (CDS). But today, nothing reads across boundaries — each app reads only its own home.

## 2. Goals

1. C&C exposes a discovery + load API for KBs owned by any of the three domain apps.
2. KBs stay where they are (no data movement). Each app remains independently installable.
3. The bridge is read-mostly. Write operations stay scoped to the owning app.
4. Loading is lazy and cached per workflow invocation, not session-wide.

## 3. Non-goals

- Synchronising state across apps. Each app remains the source of truth for its own KB.
- A registry-style discovery service. The bridge knows the paths because they're conventional, not because they're advertised.
- Persisting bridge state. The bridge is stateless.

## 4. Architecture

A new module: `src/lib/kb-bridge.ts` in C&C.

```typescript
export interface BridgedKb {
  philosophyKb: () => string | null;             // markdown body or null if absent
  studentPersonas: () => string | null;          // markdown body or null if absent
  courseTrajectory: (courseId: string) => CourseTrajectoryResult | null;
  courseTopicMap: (courseId: string, semesterId: string) => TopicMap | null;
  courseDesignFolder: (courseId: string) => string | null;  // path to CDS course folder, if exists
}

export function loadKb(): BridgedKb;
```

Each accessor is lazy (file system access only happens when the function is called) but the bridge instance caches results per call within a workflow run.

Paths are resolved using each app's env-var convention:
- `CURRICULUM_INTELLIGENCE_HOME` (default: `~/.curriculum-intelligence`)
- `CANVAS_DESIGN_HOME` (default: `~/.canvas-design-mcp`)
- `CC_HOME` (default: `~/.command-and-control`)

This honours the test-isolation pattern already used in CI and C&C tests.

## 5. Read paths covered (Phase 1)

| Asset | Owning app | Bridge accessor |
|---|---|---|
| `philosophy-kb.md` | CDS | `loadKb().philosophyKb()` |
| `student-personas.md` | CDS | `loadKb().studentPersonas()` |
| `history.jsonl` → CourseTrajectoryResult | CI | `loadKb().courseTrajectory(courseId)` |
| `topic-map.json` per semester | CI | `loadKb().courseTopicMap(courseId, semesterId)` |
| `course/<id>/` folder existence | CDS | `loadKb().courseDesignFolder(courseId)` |

Phase 2 (when needed) can add: course-config, transcripts directory, news-cache, brand kit.

## 6. Where the bridge gets used

- **`update_course_materials`** loads `philosophyKb()` and `studentPersonas()` before calling CDS `generateCourse` so the generated pages reflect the professor's voice and student demographic factors.
- **`analyze_course`** workflow can use `courseTrajectory(courseId)` to enrich the report with "this is the third consecutive UPDATE for X — flag for structural review" warnings.
- Future: `plan_next_semester` reads `courseTopicMap` to inform outline generation.

## 7. Failure modes

- File missing → accessor returns `null`. Callers must handle absence.
- File corrupt → accessor returns `null` and writes a warning to stderr.
- Never throws from accessors. Read-only bridge cannot break a workflow.

## 8. Testing

- Unit tests with each env var pointed at a temp dir.
- One test per accessor: missing file → null, present file → expected content.
- One integration test in a workflow (`update_course_materials`) verifying both philosophy KB and personas reach `generateCourse`.

## 9. Open decisions for review

1. **Should the bridge expose write paths too?** Current spec is read-only. Adding writes would let `update_course_materials` save updated philosophy entries (e.g., after a quoted Panopto insight gets approved). Read-only is simpler; writes can be added later via the owning app's existing tool.
2. **Should accessors be sync or async?** All current targets are local file reads → sync is fine and simpler. Future hosted KBs would need async. I'd keep sync for v1 and migrate later if needed.
3. **Cache lifetime?** Per workflow invocation feels right (don't re-read the philosophy KB three times in one `update_course_materials` call). But the bridge has no notion of "workflow boundaries" — should the caller manage cache explicitly, or should the bridge auto-invalidate on a timer?

## 10. Out of scope

- Cross-app event bus (not needed for read-only access)
- Real-time sync between apps
- Bridge-level access control / auth
