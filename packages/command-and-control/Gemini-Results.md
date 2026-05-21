# Gemini Integration: Codebase Analysis & Architectural Recommendations

This document outlines the findings, codebase state, and architectural recommendations compiled by **Antigravity (Gemini)** during its integration into the Canvas course refresh toolchain development lifecycle.

---

## 1. System Ecosystem & Current Health

As of May 19, 2026, the four-repository toolchain is fully functional, cohesive, and exceptionally well-tested. We have run test suites across every domain repository to verify state:

| Component / Repo | Language / Tech Stack | Purpose | Test Status |
| :--- | :--- | :--- | :--- |
| **[Canvas-Download](file:///d:/Dev/Canvas-Download)** | Python CLI (`pytest`) | Canvas LMS API scraper, de-duplication, and offline package creation | **20 / 20 passing** |
| **[Curriculum-Intelligence](file:///d:/Dev/Curriculum-Intelligence)** | TypeScript / Vitest | Topic extraction, semantic timeline mapping, RSS news cache, currency scoring, LLM brief planning | **141 / 141 passing** |
| **[canvas-design-studio](file:///d:/Dev/canvas-design-studio)** | TypeScript / Vitest | Core design engine. Renders HSL-themed, responsive, accessibility-compliant, and Canvas-safe HTML | **391 / 391 passing** |
| **[Command-and-Control-MCP](file:///d:/Dev/Command-and-Control-MCP)** | TypeScript / Vitest | The orchestrator, routing LLM calls, managing configurations, and exposing high-level workflow tools | **26 / 26 passing** |
| **Integration Smoke Test** | `tsx` script (C&C) | Verifies the end-to-end integration: Ingest → CDS Import → HTML Page Generation | **Success (10 pages generated)** |

**Total Verified Tests: 578 Passing Tests.**

---

## 2. Integrated Data Flow

The flow of data between repositories is highly decoupled, centered around local filesystem persistence rather than online or direct database state:

```text
  [Canvas LMS]
       │ (Canvas API Scrape via canvas-backup Python CLI)
       ▼
  [Canvas Backup Archive] (~/.curriculum-intelligence/ or D:/CanvasArchive)
       │ (ingest_canvas_archive / map_transcripts_to_weeks)
       ▼
  [Curriculum Intelligence Planning State] (topic-map.json, next-plan/ stubs)
       │ (export_course_folder strips planning fields to create vanilla briefs)
       ▼
  [Canvas Design Studio Course Folder] (course/ course-config.md, week-XX/ briefs)
       │ (generate_course inline styling & HTML parser engine)
       ▼
  [Canvas-Ready HTML Output] (output/ ready for manual paste or publish)
```

---

## 3. High-Level Critical Review & Strategic Recommendations

Our critical review of the decisions documented in the architecture traces several clear areas for long-term refinement:

### 3.1. Subprocess Bridging vs. Self-Contained CLI Distribution
* **Decision:** Command & Control uses a shell/subprocess bridge to reach Python `canvas-backup`.
* **Critique:** Relying on the professor's local environment to have a correctly configured Python runtime, active `.venv`, and system PATH variables is a major adoption friction point.
* **Recommendation:** Package `canvas-backup` into a self-contained executable (`canvas-backup.exe`) using **PyInstaller** or **PyOxidizer**. Command & Control can then bundle this binary directly, eliminating runtime setup friction.

### 3.2. Two-Way Roundtripping (Avoid Destructive Metadata Stripping)
* **Decision:** `export_course_folder` strips Curriculum Intelligence planning fields (like `verdict`, `currency`, `newsHits`) to produce a clean folder for Canvas Design Studio.
* **Critique:** One-way destructive stripping prevents safe two-way roundtripping. If the professor adjusts a page's visual layout inside Design Studio and wants to run a new syllabus currency analysis later, the previous planning state is lost.
* **Recommendation:** Standardize a metadata namespace in front matter (e.g. `ci_verdict`, `ci_currency` or nested under a single `ci:` object block) and update Canvas Design Studio to simply ignore unknown keys rather than having the exporter destructively strip them.

### 3.3. Real-Time Download Progress Feedback
* **Decision:** Synchronous subprocess execution for bulk Canvas API downloads.
* **Critique:** Large courses take minutes to backup. Under an MCP server client context, long periods of silent execution can lead to timeouts or assumptions of process hang.
* **Recommendation:** Configure the Python CLI to print machine-readable progress indicators (e.g. `{"progress": 45, "status": "Downloading assignments"}`) on stdout, which Command & Control's bridge reads incrementally and reports back to the parent client using MCP standard progress tokens.

### 3.4. Transitioning to Live Web Search for Currency Scanning
* **Decision:** The `webSearch` option in `scan_recent_developments` is currently a no-op due to SDK limitations at build time.
* **Critique:** Relying strictly on training data cutoffs or static RSS queries limits the scoring capability for extremely fresh, active industry topics.
* **Recommendation:** Integrate a search MCP server (like Brave Search) or fetch real-time search engine results directly as LLM context to ensure currency analysis is always up to date.

### 3.5. Semantic Currency Classification
* **Decision:** Purely mathematical count rules (e.g. `newsHits >= 3`) dictate whether a topic is labeled "current".
* **Critique:** RSS searches can be highly sensitive to noise, either matching irrelevant articles (false positive) or missing highly specific topics (false negative).
* **Recommendation:** Implement a hybrid model where raw search snippets are routed through a fast, lightweight LLM (either via a local Ollama model or a fast cloud model) to semantically classify currency based on content relevance.

---

## 4. Antigravity Integration Strategy

As a pair-programming partner alongside Claude and ChatGPT Codex, **Antigravity** is fully configured to execute the following workflows:

1. **State-Level Execution & Verification:** We utilize direct local shell tools to verify that code changes build successfully and do not regression-break any of the 578 unit/integration tests across all four repositories.
2. **DeepMind Planning Mode:** For any complex feature additions, we establish clear tracking via:
   - `implementation_plan.md`: Detailing the precise technical approach before execution.
   - `task.md`: Maintaining an active TODO checklist.
   - `walkthrough.md`: Demonstrating verification of completed tasks.
3. **Visually Stunning & Design-System-Safe Page Engineering:** When creating new components or user layouts, we strictly adhere to the Canvas LMS RCE limits, styling constraints, and HSL tokens documented in your Canvas Design Studio.
