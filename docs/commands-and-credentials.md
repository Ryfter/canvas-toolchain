# Canvas Toolchain — Commands & Credentials Reference

> Full documentation of **what the application does**, **every command (MCP tool) it exposes**, and **every API key / secret it asks for and why**.
>
> Audience: professors evaluating or operating the toolchain, IT/security reviewers, and contributors. Last reconciled against the source tree on 2026-06-11.
>
> **Want how-to / why-to instead of a lookup table?** Read the [User Guide & Tutorial](user-guide.md) — it walks the toolchain end to end and explains *why* you'd reach for each command.

---

## 1. What this application does

Canvas Toolchain helps a professor **refresh a Canvas LMS course every semester**. It is a four-package TypeScript monorepo plus a Go installer and a Python sidecar (a separate `canvas-backup` repo) that together cover the full loop:

```text
Canvas Backup archive            (download last semester's shell)
  -> Curriculum Intelligence     (analyze staleness, plan next semester)
  -> Canvas Design Studio        (generate Canvas-safe HTML)
  -> Canvas-safe HTML
  -> optional Canvas publishing  (push pages back to Canvas, or paste manually)
```

Professors drive everything by **talking to the Command & Control (C&C) MCP server** from any MCP-capable AI client — Claude Desktop, Claude Code, ChatGPT, or Gemini. C&C is the single professor-facing entrypoint; it orchestrates the other apps and re-exports their tools. Each underlying app also stays independently usable.

**Two design guarantees worth knowing up front:**

1. **Direct Canvas API publishing is always optional.** The no-token "generate the HTML and paste it into Canvas yourself" path is first-class and works with zero credentials.
2. **Local archive is the source of truth.** The toolchain reads/writes local course folders; cloud services (Canvas, Panopto, Anthropic, etc.) are optional enhancements.

### The packages

| Package | What it owns |
| --- | --- |
| `command-and-control` | The single MCP entrypoint: workflow orchestration, registry, brand/layout adapters, module loader. Re-exports CI and CDS tools. |
| `curriculum-intelligence` | Reads past course archives + lecture transcripts, scores topic currency, plans the next semester. |
| `canvas-design-studio` | Generates Canvas-safe HTML, design review/critique, publishing to Canvas. |
| `shared-llm` | Shared LLM client (Anthropic + Ollama providers). |
| `shared-types` | TypeScript contracts shared across packages. |
| `module-contract` | The `CanvasToolchainModule` plug-in contract for opt-in capability modules. |
| `module-video` | First plug-in module: Lecture Video (Panopto provider) — embeds + transcripts. |
| `installer/` | Go + Fyne native installer and auto-updater (Windows x64 / macOS arm64). |

---

## 2. Command (MCP tool) reference

All commands are **MCP tools**. You invoke them by asking your AI client in natural language ("analyze how stale my course is"); the client calls the matching tool. Command & Control exposes its own tools **plus** pass-throughs from Curriculum Intelligence, Canvas Design Studio, and the Canvas Backup downloader, so in normal use you only talk to C&C.

Legend: **R** = required parameter, *italic* = optional.

### 2.1 Command & Control — setup & configuration

| Tool | Key parameters | What it does |
| --- | --- | --- |
| `setup_cc` | *mode*, *anthropicModel*, *ollamaBaseUrl*, *ollamaModel*, *routingFast*, *routingJudgment*, *downloaderPath*, *registryToken*, *premiumRegistryBaseUrl*, *registryGithubOrg* | Top-level config: mode (easy/advanced), model routing preferences, downloader path, registry token. Run first. |
| `setup_anthropic` | **apiKey**, *model*, *test* | Configure the Anthropic API key; validates against the Anthropic API before saving (0o600). |
| `setup_canvas` | **host**, **token**, *test* | Configure Canvas host + API token; validates against `/api/v1/users/self` before saving (0o600). |
| `setup_ollama` | *baseUrl*, *model* | Configure local Ollama as a generation provider. No-model call returns recommended-models markdown; with a model it validates and saves. |
| `set_active_llm_provider` | **provider** (anthropic/ollama) | Switch the active generation provider; refuses if that provider's config is absent. |
| `get_cc_status` | — | Health snapshot: installed packages, Anthropic/Ollama availability, routing config, last-run timestamps. |
| `show_canvas_capabilities` | *category*, *supportStatus* | Return the Canvas design-pattern catalog as markdown. |
| `preview_canvas_pattern` | **patternId** | Render one pattern to a standalone HTML preview (file:// URL). |

### 2.2 Command & Control — plug-in modules & institution discovery

| Tool | Key parameters | What it does |
| --- | --- | --- |
| `list_modules` | — | List known plug-in modules (id, name, enabled, active provider, handled tool/provider types). |
| `set_module_enabled` | **module**, **enabled**, *activeProvider* | Enable/disable a module post-install (takes effect on client reconnect). |
| `discover_tools` | — | Scan the Canvas instance and match against modules; suggest which modules to enable. |
| `save_institution_profile` | **tools**, *identifiers*, *perClass* | Write/merge the institution tool library + per-class deltas (accretive). |
| `submit_usage_feedback` | *named*, *confirm* | Opt-in: turn the institution profile into an **anonymized** GitHub issue so the author can prioritize integrations. Two-call confirm gate; never transmits tokens or student data. |

### 2.3 Command & Control — high-level workflows

| Tool | Key parameters | What it does |
| --- | --- | --- |
| `analyze_course` | **courseId**, **semesterId**, **archivePath** | "How stale is my course?" — ingest archive, score topic currency, emit KEEP/UPDATE/DROP/ADD verdicts. |
| `plan_next_semester` | **courseId**, **sourceSemesterId**, **newSemesterId**, *source*, *calendarUrl*, *manualDates*, *onBreakCollision*, *sections* | "Get me ready for next semester" — import the prior shell, fetch the academic calendar, shift due dates, draft an outline. |
| `update_course_materials` | **courseId**, **semesterId**, *outputPath*, *sections* | Draft updated briefs for every assignment, run an examples-update pass, export to CDS format. |
| `full_pipeline` | (union of the three above) | Run analyze → plan → update end-to-end. |

### 2.4 Command & Control — course publishing (Canvas)

| Tool | Key parameters | What it does |
| --- | --- | --- |
| `preview_course_publish` | **courseDir**, **courseId**, *outputDir*, *fullDiffFor* | Generate a publish preview (per-page diffs, warnings, manifest) without writing to Canvas. |
| `publish_course` | **snapshotId**, **approvals**, *resume*, *gitCommit*, *pushTag*, *canvasBreadcrumbs* | Publish a previewed manifest with explicit per-entry approve/skip; stops on first failure. |
| `rollback_course_publish` | **snapshotId** | Restore every published entry from a snapshot to its prior Canvas state. |
| `list_publish_snapshots` | **courseId**, **courseDir** | List publish snapshots (which is live, which can roll back/forward). |
| `prune_publish_snapshots` | **courseId**, **courseDir**, *dryRun* | Retention policy (default: keep 3 most recent, ≤30 days). |

### 2.5 Command & Control — lecture transcripts (Panopto / Whisper)

| Tool | Key parameters | What it does |
| --- | --- | --- |
| `bulk_fetch_panopto_transcripts` | **folderId**, **outputPath**, *courseId*, *semesterId*, *copy* | Download all Panopto transcripts for a folder as VTT; optionally auto-ingest into CI. |
| `enrich_panopto_transcripts` | **transcriptsPath** | Turn VTT into enriched markdown (week/date headers, deep links, filler stripped, key statements highlighted). |
| `setup_transcript_source` | **action** (get/set), *source* (panopto/whisper), *engine*, *model*, *audioMode* | Configure the transcript source + Whisper engine/model. |
| `compare_transcripts` | **transcriptsPath**, *sessionIds*, *model*, *keepAudio* | Transcribe audio locally with Whisper and diff against Panopto VTT; suggests vocab corrections. |

### 2.6 Command & Control — lecture answers (course Q&A)

| Tool | Key parameters | What it does |
| --- | --- | --- |
| `setup_lecture_answers` | *provider* (ollama/transformers-js/voyage), *voyageApiKey*, *ollamaBaseUrl*, *model* | First-run config for the Q&A bot; auto-detects Ollama on localhost:11434. |
| `index_course_for_answers` | **courseId**, **courseDir**, *rebuild*, *transcriptSources* | Build/update a hybrid (FTS5 + vector) index over transcripts, CDS markdown, slide PDFs, FAQ. |
| `ask_course` | **courseId**, **courseDir**, **question**, *k*, *transcriptSources* | Faculty Q&A against the per-course index; returns an answer plus deep-linked citations. |
| `reembed_course_index` | **courseId**, **courseDir**, *provider*, *voyageApiKey*, *ollamaBaseUrl*, *transcriptSources* | Switch embedding providers and rebuild the index in one call. |

### 2.7 Command & Control — content, design & registry

| Tool | Key parameters | What it does |
| --- | --- | --- |
| `set_course_aias_default` | **courseDir**, **level** (1–5), *note* | Set a course-wide AI Assessment Scale default; per-page overrides win. |
| `set_courses_root` | **coursesRoot** | Set the root directory for course discovery (used by the dashboard). |
| `open_dashboard` | *port* | Start the local read-only course-health dashboard; returns a localhost URL. |
| `snapshot_course` | **courseId**, **outputPath** | Write/update a course reference markdown (identifiers, groups, modules, append-only update log). |
| `draft_student_rubric` | **facultyRubricText**, **outputPath**, *assignmentBrief*, *courseContext*, *week*, *title*, *totalPoints*, *assignmentNumber* | Rewrite a faculty rubric into student-facing language + worked examples. |
| `review_canvas_rubric` | **courseId**, *assignmentId*, *rubricId* | Pull a rubric from Canvas (assignment-attached first, course-list fallback), diff it against the last student rewrite, and triage changes (acceptable / needs-update / needs-review) before feeding `draft_student_rubric`. Read-only against Canvas. |
| `brainstorm_interactive` | **topic**, **learningGoal**, *audienceTags*, *courseId*, *includePhilosophy*, *includePersonas*, *count* | Propose interactive Canvas widget concepts for a topic + goal. |
| `install_resource` | **url** | Install a template/theme/prompt/adapter-config from `github://`, `ryfter://`, or `file://`. |
| `list_installed_resources` | *kind* | List local registry resources. |
| `uninstall_resource` | **kind**, **id**, *version* | Remove a registry resource. |
| `search_registry` | **query**, *kind*, *tier* (free/premium) | Search the free GitHub registry or a configured premium registry. |
| `install_resources_from_lockfile` | **path** | Install everything listed in a lockfile. |
| `paste_layout` | **html**, *css*, *sourceTool*, *intent*, *desiredSlots* | Adapt raw HTML/CSS (Stitch/Figma) into a Canvas-safe slot layout + accessibility audit. |
| `save_layout_as_template` | **layout**, **templateId**, **templateVersion** | Save an adapted layout as a reusable template. |

### 2.8 Pass-through tools (re-exported through C&C)

These run through C&C but are owned by other packages.

**From the Canvas Backup downloader bridge:**

| Tool | Key parameters | What it does |
| --- | --- | --- |
| `download_canvas_archive` | **courseId**, *configPath*, *year*, *semester*, *root*, *shellName*, *downloadWorkers* | Archive a Canvas course shell locally via the Python Canvas Backup CLI. |
| `download_transcripts` | — | Placeholder for future bulk Panopto download. |

**From Curriculum Intelligence (28 tools).** Course setup/state (`setup_course`, `get_course_state`), archive ingestion (`ingest_canvas_archive`), content analysis (`list_assignments`, `list_pages`, `list_modules`, `list_resources`, `diff_semesters`), transcript processing (`ingest_transcripts`, `map_transcripts_to_weeks`, `extract_lecture_topics`, `find_off_syllabus_topics`, `build_quote_bank`), topic currency (`fetch_news_feed`, `scan_recent_developments`, `suggest_topics`, `score_topic_currency`, `recommend_for_topic`), planning (`generate_ideas_file`, `import_previous_shell`, `fetch_academic_calendar`, `shift_dates`, `generate_recommended_outline`, `draft_assignment_brief`, `update_examples`, `export_course_folder`), and full analysis (`analyze_course`, `get_course_trajectory`). See §2.9 for the CI-direct detail.

**From Canvas Design Studio:** `import_course`, `generate_course` (full set in §2.10).

### 2.9 Curriculum Intelligence (when run standalone)

| Tool | Key parameters | What it does |
| --- | --- | --- |
| `setup_course` | **id**, **title**, *courseRoot* | Register a new course; create its folder, record location. |
| `get_course_state` | *id* | List registered courses (paths, semester history, feed counts). |
| `ingest_canvas_archive` | **courseId**, **semesterId**, **archivePath** | Parse a Canvas export folder into `topic-map.json` (idempotent). |
| `list_assignments` / `list_pages` / `list_modules` / `list_resources` | **courseId**, **semesterId**, *filters* | List items from the ingested topic map. |
| `diff_semesters` | **courseId**, **leftSemesterId**, **rightSemesterId** | Side-by-side diff: added/removed/reused/rewritten. |
| `ingest_transcripts` | **courseId**, **semesterId**, **transcriptsPath**, *source*, *copy* | Read VTT/SRT/MD transcripts into `transcripts.json`. |
| `map_transcripts_to_weeks` | **courseId**, **semesterId** | Match transcripts to weeks via filename hints + term-start math. |
| `extract_lecture_topics` | **courseId**, **semesterId**, *week*, *transcriptId*, *maxTextChars* | Shape lecture chunks for LLM reasoning (no LLM call here). |
| `find_off_syllabus_topics` | **courseId**, **semesterId**, *topN*, *minTokenLength* | Surface lecture topics not on the syllabus. |
| `build_quote_bank` | **courseId**, **semesterId**, *minLength*, *maxPerLecture* | Collect notable lines (key idea / takeaway / always-never cues). |
| `fetch_news_feed` | **courseId**, **feedUrls**, *since* | Fetch RSS/Atom feeds; cache to `news-cache.json`. |
| `scan_recent_developments` | **courseId**, **topicArea**, *since* | Ask the LLM what's new in a topic area (needs Anthropic). |
| `suggest_topics` | **courseId**, *feedItems*, *scanDevelopments* | Merge RSS + LLM scans into ranked topic candidates. |
| `score_topic_currency` | **courseId**, **semesterId**, **topic**, **newsHits**, **lastTaughtSemesterId**, *semanticVerify* | Classify a topic evergreen/current/dated. |
| `recommend_for_topic` | **courseId**, **semesterId**, **topic**, **currencyClass**, **lastTaughtSemesterId**, **newsHits**, *includeDetails* | Emit a KEEP/UPDATE/DROP/ADD verdict. |
| `generate_ideas_file` | **courseId**, *usageNotes* | Write `ideas.md` (deferred scope, follow-ons, next prompts). |
| `import_previous_shell` | **courseId**, **sourceSemesterId**, **newSemesterId**, **source**, *cdsPath* | Build a `next-plan/` skeleton from the last archive or CDS folder. |
| `fetch_academic_calendar` | **courseId**, **semesterId**, *url/startDate/endDate/breaks/semesterPattern* | Parse the institution calendar (or accept manual dates) → `calendar.json`. |
| `shift_dates` | **courseId**, **semesterId**, **onBreakCollision**, *sections* | Apply the target calendar to all `due:` fields. |
| `generate_recommended_outline` | **courseId**, **semesterId** | Produce a week-by-week outline → `plan-outline.md`. |
| `draft_assignment_brief` | **courseId**, **semesterId**, **briefPath**, *includeDetails* | LLM-draft an updated brief; flag if verdict is DROP/stale. |
| `update_examples` | **courseId**, **semesterId**, **briefPath**, *llmPass* | Two-pass refresh of year refs / tool names / deeper staleness. |
| `export_course_folder` | **courseId**, **semesterId**, *outputPath*, *sections* | Translate `next-plan/` into a CDS-compatible `course/` folder. |
| `analyze_course` | **courseId**, **semesterId**, **archivePath**, *semanticVerify*, *extractConcepts* | Full pipeline: ingest → diff → score → verdicts → trajectory log. |
| `get_course_trajectory` | **courseId**, *granularity*, *lookback* | Read the trajectory log: churn rate, unstable topics, true evergreens. |

### 2.10 Canvas Design Studio (when run standalone)

| Tool | Key parameters | What it does |
| --- | --- | --- |
| `get_started` | — | Tailored orientation based on current config. |
| `get_setup_worksheet` | — | Return a blank setup worksheet for the professor to fill in. |
| `setup_institution` | *worksheetContent* | Set/update institution config (brand colors, Canvas URL, API token). |
| `validate_canvas_html` | **html** | Check HTML against Canvas RCE rules + WCAG 2.1 AA; list violations. |
| `validate_worksheet` | **worksheetContent** | Validate a filled worksheet (hex colors, URLs) before setup. |
| `update_canvas_kb` | *force* | Refresh the Canvas knowledge base from live Instructure docs (via Context7). |
| `generate_canvas_page` | **assignmentBrief**, **courseName**, **courseNumber**, **assignmentNumber**, **professorName**, **semester**, *styleNotes* | Generate a Canvas-safe HTML assignment page from a brief. |
| `ingest_assignment_folder` | *folderPath* | Read assignment materials from a folder and generate a page. |
| `critique_canvas_page` | **html**, **pageType**, **primaryGoal**, *audience*, *mode* | Score visual design quality; prioritized findings. |
| `redesign_canvas_page` | **html**, **findings**, *mode*, *pageType*, *primaryGoal* | Apply design fixes from a critique; re-check WCAG. |
| `load_canvas_page` / `save_canvas_page` | *filename* / **html**+**filename** | Load/save generated HTML in `output/` (auto `.bak`). |
| `get_philosophy_kb` / `update_philosophy_kb` | — / **entry**+**section**+*courseKey* | Load / append-only update the teaching philosophy KB. |
| `get_student_personas` / `generate_student_personas` | — / *count* | Load / generate demographically grounded student personas. |
| `setup_course` | *courseDir* | Scaffold a full course folder (config + week folders + templates). |
| `generate_page` / `generate_week` / `generate_course` | **mdPath** / **weekNumber** / — (+ *courseDir*, *outputDir*) | Generate one page / one week / the whole course. |
| `import_course` | **archivePath**, *outputDir*, *weekNumber*, *assignmentName* | Import a previous semester from a Canvas Backup archive (full / week / assignment). |
| `list_canvas_courses` | *semester*, *includeFavorites* | List Canvas courses available to the professor. |
| `publish_to_canvas` | **courseId**, **html**, **pageTitle**, *forcePublish*, *skipFerpaCheck*, *collisionAction*, *relatedPageTitle* | Validate + publish HTML to a Canvas page; FERPA + title-collision checks. |
| `fetch_brand_colors` | **url** | Extract brand color candidates from a standards page. |
| `render_widget` | **specPath**, *allowExperimental* | Render an InteractiveSpec to a self-contained embeddable widget. |
| `publish_widget` | **htmlPath**, **courseId**, **canvasConfig**, **widgetSpec** | Upload a rendered widget to Canvas Files; return iframe embed code. |

### 2.11 Module Video (Panopto) — when the module is enabled

| Tool | Key parameters | What it does |
| --- | --- | --- |
| `setup_panopto` | **domain**, **clientId**, **clientSecret**, *iframeWhitelisted*, *test* | Configure Panopto OAuth credentials; validates against the OAuth token endpoint. |

(Video embed/transcript tools route through the module's `VideoProvider` adapter; Panopto is provider #1.)

### 2.12 Module Oral Assessment — when the module is enabled

| Tool | Key parameters | What it does |
| --- | --- | --- |
| `design_oral_assessment` | **(assignmentBrief)** OR **(topic + learningGoal)**, *outputDir*, *provider* | Author an oral/video assessment: writes a CDS `oral-assessment` page + a paste-ready faculty sidecar (Rhetorix is provider #1). No credentials. |

Enable with `set_module_enabled` (module: `oral-assessment`).

### 2.13 Module Group Builder — when the module is enabled

| Tool | Key parameters | What it does |
| --- | --- | --- |
| `create_groups` | **courseId**, **strategy**, **groupSize** or **groupCount**, *rosterPath*, *seed* | Preview balanced student groups (six strategies, soft no-repeat pairing). Never mutates history. |
| `record_groups` | **courseId**, **groups** | Commit a grouping to the per-course pairing history. |
| `propose_major_buckets` | **courseId**, *persist* | Propose (or persist) a major → diversity-bucket map for the major-diversity strategy. |

Enable with `set_module_enabled` (module: `group-builder`). Uses Canvas (roster source) + a thin `canvas_id,pseudonym,major` CSV; never reads names/emails.

### 2.14 Module Roster & Identity Manager — when the module is enabled

| Tool | Key parameters | What it does |
| --- | --- | --- |
| `propose_roster` | **courseId**, **peopleSoftFile**, *columnMapping* | Read-only: match PeopleSoft → Canvas, assign/reuse lifetime pseudonyms, normalize majors → review report. Writes nothing. |
| `commit_roster` | **courseId**, **peopleSoftFile**, *outputDir* | The single writer: emit the de-identified `canvas_id,pseudonym,major` roster + insert new students into the `0600` identity vault. |
| `resolve_identity` | **pseudonym** | Resolve a pseudonym → live Canvas name via the vault (nothing cached). |

Enable with `set_module_enabled` (module: `roster`).

### 2.15 Module PeerAssessment Export — when the module is enabled

| Tool | Key parameters | What it does |
| --- | --- | --- |
| `build_peerassessment_import` | **courseId**, **groupSetName**, *peopleSoftFile*, *outputDir*, *dryRun* | Turn a Canvas group set into the PeerAssessment.com import CSV (`Team,Login ID,Email,First Name,Last Name,Student ID #`). `dryRun` returns a validation report with no file. Import-only. |

Enable with `set_module_enabled` (module: `peerassessment`).

### 2.16 Command & Control — accessibility (WCAG conformance)

| Tool | Key parameters | What it does |
| --- | --- | --- |
| `audit_course_accessibility` | **courseDir**, *outputDir* | Run the full WCAG 2.2 engine stack (in-house + axe-core) across every generated page, report per-page verdicts against the required conformance level, and refresh the borderline review queue. The regular between-semesters check. |
| `accessibility_review_queue` | **courseDir**, *action* (list/resolve), *page*, *note* | The per-course "near the edge" worklist: borderline findings, needs-human-review criteria, and acknowledged publishes, worst-margin first with live Canvas URLs. `resolve` marks a page reviewed. The professor is the final arbiter. |
| `review_accessibility_policy` | *confirm*, *urls*, *requiredConformance* (version + level), *recheckWeeks*, *wcag3Advisory* | View or update the institution accessibility-policy anchor: policy URLs, gate level (default WCAG 2.1 AA), re-verification cadence, and the WCAG 3 draft advisory toggle (never gates). `confirm: true` stamps today as last-verified after the professor re-reads the policy. |
| `wave_deep_check` | **url**, *confirm*, *apiKey* | Deep check of a **publicly visible** page via the paid WAVE API (WebAIM). Two-call spend gate: first call previews the cost (~2 credits) and spends nothing; re-call with `confirm: true` to run. Auth-gated Canvas URLs are refused before any spend — use the free WAVE browser extension for those. |

See [`accessibility.md`](accessibility.md) for how the publishing gate, acknowledgments, and review queue fit together.

---

## 3. API keys & secrets — what's asked for and why

**Bottom line: every credential is optional.** With zero credentials you can still import a Canvas archive, analyze/plan a course, generate Canvas-safe HTML, and **paste it into Canvas by hand**. Each credential unlocks one optional enhancement.

All secrets are stored **locally** under `~/.command-and-control/` (override with the `CC_HOME` env var). Every credential file is written **atomically (temp + rename) with `0o600` permissions** (owner read/write only). Keys are **validated against the live service before being saved**, are **never echoed back** in tool responses (the registry token is explicitly redacted), and are **never transmitted** to analytics — `submit_usage_feedback` is opt-in and anonymized and refuses to send tokens or student data.

### 3.1 Credentials collected via setup tools / the installer (stored on disk)

| Credential | Service | Why it's needed | Required? | Stored in (`~/.command-and-control/`) | Collected by |
| --- | --- | --- | --- | --- | --- |
| **Anthropic API key** | Anthropic Claude API | Powers AI generation: course analysis, brief drafting, rubric rewriting, planning, brainstorming. Without it, generation falls back to keyword/offline behavior. | No | `anthropic-config.json` | `setup_anthropic` · installer screen 3 (masked) |
| **Canvas host + Canvas API token** | Your Canvas LMS instance | Direct page publishing and course listing. Optional — the generate-and-paste path needs neither. | No | `canvas-config.json` | `setup_canvas` · installer screen 3 (token masked) · CDS `setup_institution` |
| **Panopto domain + client ID + client secret** | Panopto video API (OAuth2) | Lecture-video module: transcript download, video search, iframe embeds. Only when the Video module is enabled. | No | `panopto-config.json` | `setup_panopto` · installer screen 3 (secret masked, shown only if Panopto workflow selected) |
| **Voyage API key** | Voyage AI embeddings | Optional cloud embeddings for the lecture-answers index (alternative to local Ollama / transformers.js). Only when `provider="voyage"`. | No | `lecture-answers-config.json` | `setup_lecture_answers` / `reembed_course_index` |
| **Premium registry token** | Ryfter premium resource registry (`ryfter://`) | Authenticates premium template/theme downloads. The free GitHub registry always works without it. | No | `config.json` (`registry.token`, redacted in responses) | `setup_cc` |
| **WAVE API key** | WebAIM WAVE API | Paid deep accessibility checks of publicly visible pages via `wave_deep_check`. Every call is preceded by a preview + explicit `confirm` (nothing spends credits silently). | No | `~/.canvas-design-mcp/institution.json` (`waveApiKey`) — CDS-owned config, same atomic `0o600` write discipline | `wave_deep_check` (*apiKey*, persisted on first use) |
| **Ollama base URL + model** | Local Ollama server (not a secret) | Local LLM alternative to Anthropic for generation. No key — just an endpoint, usually `http://localhost:11434`. | No | `ollama-config.json` | `setup_ollama` |

> Note: `Canvas API token` and `Voyage API key` are **config-file keys, not environment variables** — they are not read from `process.env`. (See §3.2 for the actual env-var list.)

### 3.2 Environment variables the code reads

These are the only environment variables read anywhere in the TypeScript packages. Most are **path/behavior overrides**, not secrets.

| Env var | Sensitive? | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | **Yes** | Legacy/alternative way to supply the Anthropic key (CI-direct uses it). The setup-tool config file is the preferred path. |
| `BRAVE_SEARCH_API_KEY` | **Yes** | Optional Brave Search key for `scan_recent_developments` / topic-currency web search. **Env-var only — never persisted.** Without it, analysis degrades gracefully (LLM-only / offline). Free tier ~2,000 queries/month. |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | No | Point CI at a local Ollama instance/model. |
| `CC_OLLAMA_TIMEOUT_MS` | No | Override the Ollama request timeout. |
| `CC_HOME` | No | Relocate the config directory (default `~/.command-and-control`). |
| `CC_INSTALL_DIR` | No | Installer marker for the update-version check. |
| `CC_RECOMMENDED_MODELS_URL` | No | Override the source URL for the Ollama recommended-models list. |
| `CURRICULUM_INTELLIGENCE_HOME`, `CANVAS_DESIGN_HOME` | No | Path overrides for the CI / CDS app home directories. |
| `CANVAS_BACKUP_COMMAND`, `CANVAS_BACKUP_REPO` | No | Locate the Python Canvas Backup tool (discovery order: `CANVAS_BACKUP_COMMAND` → `CANVAS_BACKUP_REPO` → `../canvas-backup` → PATH). |
| `PYTHONPATH` | No | Set transiently when invoking the Python downloader subprocess; not user-facing. |

The Go installer additionally reads OS env vars `CC_HOME` (config location) and `APPDATA` (Windows Start-menu shortcuts) — neither is a secret.

### 3.3 Validation endpoints (how each key is checked before saving)

| Service | Validation call | Pass = |
| --- | --- | --- |
| Anthropic | `POST /v1/messages` (1-token test) | 200 (401 invalid, 429 rate-limited) |
| Canvas | `GET /api/v1/users/self` (Bearer token) | 200 |
| Panopto | `POST /Panopto/oauth2/connect/token` (client_credentials) | 200 |
| Voyage | `POST /v1/embeddings` (ping embed) | 200 |
| Ollama | `GET /api/tags` | 200 (server up + model pulled) |

---

## 4. Setup paths

**Minimal (no credentials):** install, skip all credential screens. Import archives, analyze/plan, generate HTML, and paste into Canvas manually.

**Via the native installer:** screen 3 collects the Anthropic key, Canvas host/token, and (if the Panopto workflow is selected) Panopto credentials — sensitive fields are masked — then validates and writes the config files.

**Via MCP tools after install** (talk to C&C in your AI client):

```text
setup_anthropic   { apiKey, model? }
setup_canvas      { host, token }
setup_panopto     { domain, clientId, clientSecret }   # only if using the Video module
setup_lecture_answers { provider: "voyage", voyageApiKey }   # only for cloud embeddings
setup_cc          { registryToken? }                   # only for the premium registry
```

**Via environment** (CI / advanced): export `ANTHROPIC_API_KEY` and/or `BRAVE_SEARCH_API_KEY`, plus the path/behavior overrides in §3.2.

---

## 5. Source-of-truth pointers

- Tool registration & schemas: `packages/command-and-control/src/index.ts` and `packages/*/src/index.ts`.
- Credential setup tools: `packages/command-and-control/src/tools/setup_*.ts`, `packages/module-video/src/panopto/setup.ts`.
- Config path + `CC_HOME`: `packages/command-and-control/src/kb/config.ts`.
- Installer credential screen: `installer/screens/credentials.go`; config writers: `installer/tasks/configs.go`.
- Repo orientation for contributors: [`AGENTS.md`](../AGENTS.md). Project README: [`README.md`](../README.md).
</content>
</invoke>
