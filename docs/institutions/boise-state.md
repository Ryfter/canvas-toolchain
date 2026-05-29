# Institution Profile: Boise State University

> **This is a reference profile, NOT a configuration the tool reads.** It documents what one institution (BSU) has available, so the toolchain's author can avoid baking BSU-specific assumptions into universal code. It also serves as the prototype "institution profile" format — see [Institution Profiles as a Concept](#institution-profiles-as-a-concept) below.
>
> **Design rule this file exists to enforce:** canvas-toolchain is a *universal* tool. BSU happens to have generous access (API tokens, Panopto download enabled). Most institutions will NOT. Never assume BSU's access level in shared code — degrade gracefully and offer manual paths.

## Identifiers

| Service | Value |
|---|---|
| Canvas LMS | `bsu.instructure.com` |
| Panopto | `bsu.hosted.panopto.com` |
| Rhetorix Lab | `rhetorixlab.boisestate.edu` |
| Business college shorthand | **COBE** = College of Business and Economics (basis for the `KOBE → COBE` Panopto vocab correction) |

## Access status (BSU-specific — do NOT assume elsewhere)

| Capability | BSU status | Universal assumption to code against |
|---|---|---|
| Canvas API token | Available to faculty | Optional — manual HTML paste must stay first-class |
| Panopto API (client ID/secret) | **Available** (Kevin has it — but did NOT for a long time) | Often unavailable; many institutions never grant it |
| Panopto audio/video **download** | **Enabled** (Kevin can download recordings) | Frequently **disabled** by admin; the Whisper feature's `audioMode: manual` + guided web-download walkthrough exists precisely because of this |
| Rhetorix Lab | BSU-hosted; access via BSU SSO | Institution-specific; not present elsewhere |

The "Kevin did not have Panopto API access for a long time" fact is the canonical reminder: access can be absent or revoked, so every integration needs a no-API path.

## Courses (context for examples/fixtures)

Kevin Rank teaches **ITM 310**, **ITM 370**, and **BusApp 105**. Discipline vocabulary (supply chain, business analytics, Tableau) drives the kinds of transcription errors the Panopto vocab-correction system targets.

## Local tools in use

- **Canvas** — course pages, the original target of this toolchain.
- **Panopto** — lecture capture; transcripts feed Curriculum Intelligence.
- **Rhetorix Lab** — asynchronous video oral-assessment platform with AI-enhanced grading. BSU's own tool, built to assess students via recorded video responses and reduce generative-AI cheating. Integration with canvas-toolchain is a backlog item (scope TBD — no public API/LTI/export confirmed yet).

## Institution Profiles as a Concept

This file is the first instance of an idea worth generalizing: a **standardized "what does this institution have" profile**. If the toolchain later adds a post-install tool-discovery step (ask the professor what they use, and/or scan the Canvas instance to detect installed LTI tools), the detected result could be serialized into exactly this profile shape. Aggregating anonymized profiles (submitted via GitHub by advanced early adopters) would tell the author which tools professors actually use and what to support next. See `project-future-ideas` memory for the full idea.
