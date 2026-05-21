# `analyze_course` + Trajectory Log — Design

**Status:** Approved (2026-05-20, amended 2026-05-20 for unit-of-analysis decision)
**Repos:** `D:\Dev\Curriculum-Intelligence`, `D:\Dev\Command-and-Control-MCP`
**Decisions verified in conversation:**
- Signal merge in C&C only
- Trajectory advisory-only (does not change verdict letter or currencyClass)
- Diff against both same-season AND most-recent
- **Unit of analysis: assignments by default, with optional LLM-extracted concepts layered on top.** Trajectory entry always populates `perAssignment`; `perConcept` is populated only when an LLM client is provided and concept extraction is requested.

---

## 1. Problem

`analyze_course` in C&C is currently one line (`ingestCanvasArchive`). The full CI analysis pipeline (currency scoring, verdicts, diff, news/search signal) is not wired in. There is no record of how a course evolves over time — `diffSemesters` compares two semesters but trajectory across many semesters is invisible. For fast-moving courses (e.g., ITM 370 AI-Augmented Projects), the professor needs more than a single-semester snapshot; they need to see what stabilises, what churns, and what evergreen content has earned trust over many runs.

## 2. Goals

1. `analyze_course` becomes a real analysis workflow that produces verdicts, diffs, and a trajectory snapshot.
2. CI maintains an append-only trajectory log per course; data is always written at full granularity and filtered at read time.
3. Trajectory data is *advisory*: it annotates verdicts but does not modify them. The deterministic core stays deterministic.
4. External signals (RSS, web search, transcripts) merge at the C&C layer, not inside CI. CI stays archive-only.
5. The trajectory feeds the existing "evergreen list" concept (true-evergreen topics earn that label after sustained KEEP runs).

## 3. Non-goals

- Modifying the verdict algorithm itself. `score_topic_currency` and `recommend_for_topic` keep their current logic; trajectory adds an annotation, not a vote.
- Reaching across apps from inside CI. CI does not call Canvas Backup, Panopto, or any external HTTP service in this work.
- Building Panopto bulk download. That is its own piece; `analyze_course` *accepts* transcript paths if available but does not produce them.
- A UI for browsing the trajectory log. Read access is via MCP tool; the LLM client renders it.

## 4. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│ C&C analyzeCourse (workflow)                                       │
│                                                                    │
│  1. CI.analyzeCourse({ courseId, semesterId, archivePath })        │
│      → ingest + diff + score + verdict + trajectory entry          │
│      → returns analysis report (no external signals yet)           │
│                                                                    │
│  2. If RSS feeds configured  → CI.fetchNewsFeed()                  │
│  3. If BRAVE_SEARCH_API_KEY  → CI.scanRecentDevelopments() for     │
│                                top-N most-uncertain verdicts       │
│  4. If transcriptsPath given → CI.ingestTranscripts()              │
│                              + mapTranscriptsToWeeks               │
│                                                                    │
│  5. Merge external signals into report (NOT into trajectory entry  │
│     — that was already written by CI in step 1 at archive-only     │
│     fidelity; external signals are runtime augmentation)           │
│                                                                    │
│  6. Return comprehensive report                                    │
└────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────┐
│ CI analyzeCourse (new tool)                                        │
│                                                                    │
│  ingestCanvasArchive → topic-map.json                              │
│  diffSemesters(sameSeason)  → diff-vs-<season>.json (if exists)    │
│  diffSemesters(mostRecent)  → diff-vs-<recent>.json (if different) │
│  for each topic:                                                   │
│    scoreTopicCurrency  → currency + newsHitCount                   │
│    recommendForTopic   → verdict (KEEP/UPDATE/DROP/ADD)            │
│    computeTrajectoryFlag(topic, history) → stable/stabilising/     │
│                                            unstable/true-evergreen │
│  buildTrajectoryEntry  → append to history.jsonl                   │
│  return AnalyzeCourseReport                                        │
└────────────────────────────────────────────────────────────────────┘
```

## 5. Trajectory log

### 5.1 Storage

Location: `~/.curriculum-intelligence/courses/<courseId>/history.jsonl`

Append-only. One JSON object per line. Always written at full granularity. Granularity for *reading* is selected by the caller.

### 5.2 Entry schema (v1)

```jsonc
{
  "schemaVersion": 1,
  "timestamp": "2026-05-20T12:34:56.000Z",
  "courseId": "ITM370",
  "semesterId": "Spring2026",

  // Both prior semesters considered for diff, when each exists.
  "priorSemesters": {
    "sameSeason": "Spring2025",   // nullable
    "mostRecent": "Fall2025"      // nullable; null on very first run
  },

  "assignmentCount": 14,
  "verdicts": { "KEEP": 8, "UPDATE": 4, "DROP": 1, "ADD": 1 },

  // Always populated. Each assignment in the topic-map becomes one row.
  "perAssignment": [
    {
      "topic": "Assignment 3: Build a chatbot",   // assignment.name verbatim
      "verdict": "UPDATE",
      "currencyClass": "current",                 // evergreen | current | dated
      "newsHitCount": 0,                          // archive-only; 0 always at write time
      "trajectoryFlag": "stabilising",            // stable | stabilising | unstable | true-evergreen | new
      "verdictPrior": "KEEP",                     // null if new this run
      "verdictHistory": ["KEEP", "KEEP", "UPDATE"]
    }
  ],

  // OPTIONAL. Populated only when concept extraction was requested AND an LlmClient was available.
  // Concepts are LLM-derived themes spanning multiple assignments/modules.
  "perConcept": [
    {
      "topic": "Prompt engineering",
      "verdict": "UPDATE",
      "currencyClass": "current",
      "newsHitCount": 0,
      "trajectoryFlag": "stabilising",
      "verdictPrior": "KEEP",
      "verdictHistory": ["KEEP", "KEEP", "UPDATE"],
      "relatedAssignments": ["Assignment 1: Intro prompts", "Assignment 3: Build a chatbot"]
    }
  ],

  // Diff results — match the SemesterDiff shape from diff_semesters.
  // Both baselines when each exists; null when not.
  "diff": {
    "sameSeason": {
      "baselineSemester": "Spring2025",
      "modules":     { "added": [...], "removed": [...], "common": [...] },
      "assignments": { "added": [...], "removed": [...], "reusedVerbatim": [...], "rewritten": [...] },
      "pages":       { "added": [...], "removed": [...], "commonCount": 12 },
      "resources":   { "added": [...], "removed": [...] }
    },
    "mostRecent": null
  }
}
```

External signals (RSS hits, search results, transcripts) are NOT in the trajectory entry. They are runtime augmentation in the report C&C returns; they do not become durable trajectory state. Rationale: external signal availability varies run-to-run (no API key, no feed configured, transcripts not yet downloaded) and we want trajectory entries to be comparable apples-to-apples.

**Unit-of-analysis distinction:**
- `perAssignment` rows use `assignment.name` (verbatim from the Canvas archive) as the topic key. This is the durable identity across semesters and matches what `draftAssignmentBrief` operates on. Always populated.
- `perConcept` rows use LLM-extracted concept names (e.g., "Prompt engineering") that span multiple assignments. Each concept tracks which assignments it relates to. Populated only when the caller opts in.
- Trajectory flags compute the same way for both arrays — operating on the verdict history for that key.

### 5.3 Trajectory flag computation

Given a topic's last N verdicts (chronological), compute the flag:

- `new` — topic has only one verdict on record (this run)
- `true-evergreen` — `KEEP` for the last 4+ consecutive runs
- `stable` — verdict unchanged over last 2-3 runs but fewer than 4
- `stabilising` — verdict changed once between last 3 runs (e.g., KEEP→UPDATE→UPDATE)
- `unstable` — verdict changed twice or more in the last 4 runs (e.g., KEEP→UPDATE→KEEP→UPDATE)

The flag annotates the verdict's `rationale` ("This topic has flipped KEEP↔UPDATE three times in the last four semesters — consider a structural review") but does not change the verdict letter or `currencyClass`.

## 6. New CI tools

### 6.1 `analyzeCourse` (high-level)

```typescript
interface AnalyzeCourseInput {
  courseId: CourseId;
  semesterId: SemesterId;
  archivePath: string;
  semanticVerify?: boolean;    // forwarded to scoreTopicCurrency
  extractConcepts?: boolean;   // when true AND llmClient provided, runs concept extraction
  llmClient?: LlmClient;       // required when extractConcepts is true; ignored otherwise
}

interface AnalyzeCourseReport {
  courseId: CourseId;
  semesterId: SemesterId;
  ingest: IngestCanvasArchiveResult;
  diffs: {
    sameSeason: DiffSemestersResult | null;
    mostRecent: DiffSemestersResult | null;
  };
  perAssignment: PerTopicTrajectory[];      // always populated
  perConcept?: PerTopicTrajectory[];        // populated only when extractConcepts was true
  trajectoryEntry: TrajectoryEntry;         // the entry just appended
  historyPath: string;
}
```

This is CI's single "do my full analysis" call. It is the only place where the trajectory entry is written; it is the canonical writer.

**Concept extraction (when enabled):** the LLM is prompted once with the course's topic-map content (assignment names, module names, page titles) and asked to identify 5-15 cross-cutting concepts. Each concept lists the assignment names it relates to. Concepts then get the same scoring + verdict + trajectory flag treatment as assignments, written into `perConcept`. Failures degrade silently to `perConcept: undefined` (same pattern as scan_recent_developments). The extraction prompt and parser live in `src/tools/extract_course_concepts.ts`.

### 6.2 `getCourseTrajectory` (read tool)

```typescript
interface GetCourseTrajectoryInput {
  courseId: CourseId;
  granularity?: 'summary' | 'standard' | 'granular';  // default: 'standard'
  lookback?: number;  // number of most-recent entries, default: 8
}

interface CourseTrajectoryResult {
  courseId: CourseId;
  semesterCount: number;
  churnRate: number;          // fraction of topics whose verdict changes per run, averaged
  unstableTopics: string[];   // flipped >= 2 times in last 4 runs
  trueEvergreens: string[];   // KEEP for last 4+ consecutive runs
  topicTimelines?: PerTopicTimeline[]; // only when granularity != 'summary'
  rawEntries?: TrajectoryEntry[];      // only when granularity === 'granular'
  verdictCountsOverTime: VerdictCountSnapshot[];
}
```

### 6.3 Helper module: `src/kb/trajectory.ts`

Owns read/write of `history.jsonl`. Pure functions:

- `appendEntry(entry: TrajectoryEntry): void`
- `readEntries(courseId: CourseId, lookback?: number): TrajectoryEntry[]`
- `computeTrajectoryFlag(topic: string, history: TrajectoryEntry[], currentVerdict: Verdict): TrajectoryFlag`
- `computeChurnRate(entries: TrajectoryEntry[]): number`
- `identifyUnstableTopics(entries: TrajectoryEntry[]): string[]`
- `identifyTrueEvergreens(entries: TrajectoryEntry[]): string[]`

## 7. Updates to existing tools

### 7.1 `recommendForTopic`

Accepts a new optional field:

```typescript
interface RecommendForTopicInput {
  // ...existing fields...
  trajectoryFlag?: TrajectoryFlag;
  verdictHistory?: Verdict[];
}
```

When `trajectoryFlag === 'unstable'`, the rationale string includes a sentence about the flip pattern. When `trajectoryFlag === 'true-evergreen'`, the rationale notes the long stability. The verdict letter and `currencyClass` are unchanged regardless of the flag.

### 7.2 `diffSemesters`

No change to the tool itself. It already takes two semester IDs. The new `analyzeCourse` calls it twice when both baselines exist.

## 8. C&C workflow rewrite

`src/tools/workflows/analyze_course.ts` is rewritten:

```typescript
async function analyzeCourse(input: AnalyzeCourseWorkflowInput) {
  // 1. CI's full analysis (writes trajectory entry inside CI).
  const ciReport = await ciAnalyzeCourse({
    courseId, semesterId, archivePath,
    semanticVerify: input.semanticVerify ?? false,
  });

  // 2. External signals — augment the report but do NOT rewrite the trajectory entry.
  const augmentations: Augmentations = {};

  if (await rssFeedsConfigured(courseId)) {
    augmentations.newsFeed = await fetchNewsFeed({ courseId, feedUrls: await loadFeedUrls(courseId) });
  }

  if (process.env.BRAVE_SEARCH_API_KEY) {
    const uncertainTopics = pickMostUncertain(ciReport.verdicts, 3);
    augmentations.searchScans = await Promise.all(
      uncertainTopics.map(t => scanRecentDevelopments({
        courseId, topicArea: t.topic, llmClient: getLlmClient(), searchClient: getSearchClient(),
      }))
    );
  }

  if (input.transcriptsPath) {
    augmentations.transcripts = await ingestTranscripts({
      courseId, semesterId, transcriptsPath: input.transcriptsPath,
    });
    augmentations.weekMap = await mapTranscriptsToWeeks({ courseId, semesterId });
  }

  return { ...ciReport, augmentations };
}
```

## 9. Data flow guarantees

1. **One trajectory entry per `analyze_course` call.** Atomic write at the end of CI's `analyzeCourse`. If the run fails partway, no entry is written.
2. **Entries are immutable once written.** Schema versioning supports future evolution; old entries are read with their schema version intact.
3. **External signals never affect trajectory entry contents.** Two runs of `analyze_course` on the same archive must produce identical trajectory entries regardless of whether RSS or Brave keys were available.
4. **Trajectory read is always non-destructive.** `getCourseTrajectory` only reads.

## 10. Migration

No existing trajectory data. First time `analyzeCourse` runs for a course, history.jsonl is created. Each topic gets `verdictHistory: [<currentVerdict>]` and `trajectoryFlag: 'new'`. Subsequent runs accumulate history.

Existing courses with prior `topic-map.json` files but no history will start fresh — no backfill. Their first new analyze_course run is "the first trajectory entry."

## 11. Testing strategy

- Unit: trajectory flag computation rules (all 5 flag states from synthetic histories)
- Unit: churn rate, unstable, true-evergreen detection
- Unit: trajectory.ts read/write round-trip
- Integration: full CI `analyzeCourse` against fixture archive — verify history.jsonl grows on each call
- Integration: same archive analyzed twice → identical trajectory entries except timestamp and verdictHistory length
- Integration: C&C `analyzeCourse` workflow — verify external signals appear in augmentations but not in trajectory entry
- Integration: granularity filtering at read time — `summary`/`standard`/`granular` return appropriately scoped data

## 12. Out of scope (deferred)

- Panopto bulk download (separate spec)
- Pomelli/Stitch adapters (separate spec)
- Template/theme library (separate spec)
- Verdict-driven CDS template selection (depends on this work)
- Cross-semester report rendering as Canvas HTML (depends on CDS rewrite)
