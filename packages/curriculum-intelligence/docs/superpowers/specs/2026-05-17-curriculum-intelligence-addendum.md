# Curriculum Intelligence — Design Addendum

**Date:** 2026-05-17  
**Supplements:** `2026-05-17-curriculum-intelligence-design.md`  
**Context:** Decisions and corrections that emerged during implementation, after the original design spec was written.

---

## 1. Real course data — corrections

Kevin teaches three courses:

| Course | Sections | Notes |
|--------|----------|-------|
| ITM 370 — AI-Augmented Projects | 1 (no section number) | First offered ~2023. No data exists for 2022 or earlier. |
| ITM 105 | Multiple (section number included) | Older course, data goes back further |
| ITM 310 | Multiple (section number included) | Older course, data goes back further |

**Folder naming convention:** `<Semester><Year>` for single-section courses (e.g., `Spring2025`), `<Semester><Year>-<CourseId>-<Section>` for multi-section courses.  ITM 370 folder names omit the section. ITM 105 and ITM 310 include it.

**Why this matters:** Don't assume ITM 370 archive data exists before ~2023. When writing examples, tests, or smoke-test scripts that reference real course history, use ITM 105 or ITM 310 for semesters before Spring 2023.

---

## 2. Fourth app — Command & Control

A fourth application is planned: a **Command & Control / Orchestrator** app. It is explicitly not Curriculum Intelligence and was not built here.

**Role:** Brain / central nervous system of the full toolchain.
- Dashboard for monitoring running agents and active decisions
- Model routing — chooses the right LLM for each duty
- Setup hub and ideas dashboard
- The three domain apps are its "hands" — it calls them to do things

**Relationship to the other three apps:**
- Canvas Downloader, Curriculum Intelligence, and Canvas Design Studio must each be **independently installable and functional** — a professor should not need the full stack to use one tool.
- The Command & Control app is the exception: it *requires* the domain apps to be installed alongside it, because they are its actuators.

**Why deferred:** Building orchestration into Curriculum Intelligence would create a dependency inversion and compromise the standalone use case. The `LlmClient` seam and clean tool interfaces already make Curriculum Intelligence composable; the C&C app can call its tools without any refactoring.

---

## 3. Easy mode vs. advanced mode

Two distinct user profiles exist:

| Mode | User | Characteristics |
|------|------|-----------------|
| Easy | Professor with no technical background | Mostly automated, minimal configuration, hosted LLMs only |
| Advanced | Technically inclined professor | Full control, locally-hosted LLMs (Ollama), custom model routing, direct tool access |

**Where this lives:** The Command & Control app, not the domain tools. Curriculum Intelligence tools are stateless data processors — they don't know or care whether they're being called through an easy-mode UI or a power-user terminal. The `LlmClient` seam already supports swapping adapters (Anthropic → Ollama); the C&C layer decides which adapter to use based on mode.

**What "advanced mode" unlocks:**
- Locally-hosted LLMs via `OllamaAdapter` (seam reserved, not built in v0.6)
- Direct tool-by-tool access rather than automated pipeline
- Model routing across Gemini / Claude / Grok / local

---

## 4. Independent installability requirement

Each domain app (Canvas Downloader, Curriculum Intelligence, Canvas Design Studio) must work as a standalone tool. A professor choosing only Curriculum Intelligence should not need Canvas Downloader or Design Studio installed.

**Implication for Curriculum Intelligence:** Tool interfaces stay clean and self-contained. No hard dependencies on other domain apps. Data flows through files on disk (Canvas exports, transcript files) rather than direct inter-app calls.

**Implication for future work:** When building the C&C app, the integration layer lives there, not in the domain tools. Domain tools get a stable interface contract; the C&C app is the only thing that knows about the full pipeline.
