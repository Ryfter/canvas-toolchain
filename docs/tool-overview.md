# Canvas Toolchain Feature Overview

Canvas Toolchain is an **instructor-led system for refreshing, improving, and safely managing Canvas course shells**. AI accelerates the work, but instructors stay in control of decisions and student-facing output.

Its core apps are **Canvas Toolchain — Command & Control** (the single professor-facing MCP entrypoint), **Canvas Toolchain — Curriculum Intelligence** (staleness analysis and next-semester planning), and **Canvas Toolchain — Design Studio** (Canvas-safe HTML generation). Optional plug-in modules and a companion Canvas Backup downloader sit alongside them.

## Core Features

**Faster Canvas shell refreshes.** Import prior Canvas content, identify stale materials, shift due dates, draft updates, and generate ready-to-paste Canvas pages.

**Canvas-safe page generation.** Turn course markdown, assignment briefs, and imported content into polished HTML designed for Canvas's editor restrictions, templates, brand colors, and reusable page patterns.

**Accessibility and quality checks.** Validate generated pages for Canvas compatibility, accessibility, structure, and design issues before students see them. An optional institution accessibility policy (required WCAG level, re-verification cadence, a WCAG 3 draft-advisory toggle) anchors the gate to your institution's own guidance, and an opt-in deep-check adapter runs the paid WAVE API against publicly reachable pages — the free WAVE browser extension remains the recommended route for login-gated Canvas pages.

**Canvas management and safe publishing.** Use manual paste or the Canvas API path, with previews, page-by-page approvals, snapshots, rollback, publish history, course listing, and single-page or full-course publishing.

**Expert-in-the-loop AI review.** Review gates around content updates, generated pages, rubrics, interactives, and publishing keep AI output aligned with instructor intent.

**Course quality support.** Optional tools support transcript reuse, private course Q&A, rubric rewrites, AI-use labels, interactive widgets, de-identified rosters, balanced groups, PeerAssessment.com exports, and institution-specific extensions.

**A module channel for adding capabilities between releases.** New optional modules — and fixes to existing ones — can reach an instructor's toolchain without waiting for a new installer release. An instructor browses what's available and installs conversationally, in chat, through a deliberate two-step confirmation: the first call previews exactly what would be installed (name, version, size, source, and a cryptographic hash), and nothing happens until the instructor explicitly confirms. The installer's optional "additional modules" screen can only queue a request for something to be installed later — it never installs anything itself, so chat confirmation stays the sole point where new code is authorized to run. Every installed module's integrity is checked twice: once when it is downloaded, and again every time the toolchain starts, so a corrupted or tampered download is refused rather than silently loaded. A problem with one module never prevents the toolchain itself from starting. The reference module delivered this way, Announcements Auditor, finds scheduled Canvas announcements left over with stale dates after a course copy and helps recreate them correctly.

In short: Canvas Toolchain helps instructors refresh Canvas shells **faster**, manage Canvas **more safely**, improve **accessibility and quality**, and use AI with **expert-in-the-loop controls**.
