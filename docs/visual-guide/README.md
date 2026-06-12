# Canvas Toolchain — Visual Guide

A picture-first tour of what the toolchain is, how the pieces fit, and how you actually use it.
All diagrams below are **Mermaid** — they render automatically on GitHub and in most Markdown viewers.
A companion hand-drawn **Excalidraw** scene lives at [`pipeline.excalidraw`](pipeline.excalidraw) (open it at <https://excalidraw.com>).
Every diagram below is also exported to **PNG and SVG** under [`images/`](images/) (re-render from the `.mmd` sources with `mmdc`).
New here? Read the [**User Guide & Tutorial**](../user-guide.md) first. For the full text reference, see [`../commands-and-credentials.md`](../commands-and-credentials.md).

---

## 1. The big idea — one entrypoint, one semester loop

You talk to **Command & Control** in plain language from any AI client. It runs the whole loop for you.

```mermaid
flowchart LR
    P([👩‍🏫 Professor]) -- "plain language" --> CC

    subgraph TOOLCHAIN [Canvas Toolchain]
        direction LR
        CC{{Command & Control<br/>single MCP entrypoint}}
        CC --> CI[Curriculum<br/>Intelligence]
        CC --> CDS[Canvas<br/>Design Studio]
        CC --> DL[(Canvas Backup<br/>downloader)]
    end

    DL -. "archive" .-> CI
    CI -. "course plan" .-> CDS
    CDS -- "Canvas-safe HTML" --> OUT{{Your course}}

    classDef person fill:#FFE8C2,stroke:#F18F01,stroke-width:2px,color:#5A3A00;
    classDef hub fill:#3D348B,stroke:#2A2363,stroke-width:2px,color:#fff;
    classDef app fill:#EDEBFF,stroke:#3D348B,stroke-width:1.5px,color:#2A2363;
    classDef out fill:#1B998B,stroke:#137567,stroke-width:2px,color:#fff;
    class P person; class CC hub; class CI,CDS,DL app; class OUT out;
```

---

## 2. The semester-refresh pipeline

The core job: take last semester's course, figure out what's stale, rebuild it, and ship it.

```mermaid
flowchart LR
    A["📥 1. Download<br/><b>Backup the old shell</b><br/>download_canvas_archive"]
    B["🔎 2. Analyze<br/><b>How stale is it?</b><br/>analyze_course → KEEP/UPDATE/DROP/ADD"]
    C["🗓️ 3. Plan<br/><b>Set up next term</b><br/>plan_next_semester (shift dates)"]
    D["✍️ 4. Rebuild<br/><b>Refresh materials</b><br/>update_course_materials"]
    E["🎨 5. Design<br/><b>Generate HTML</b><br/>generate_course (Canvas-safe)"]
    F["🚀 6. Publish<br/><b>Push or paste</b><br/>publish_course  ·or·  paste by hand"]

    A --> B --> C --> D --> E --> F

    classDef step fill:#EDEBFF,stroke:#3D348B,stroke-width:2px,color:#2A2363,rx:8,ry:8;
    classDef ship fill:#1B998B,stroke:#137567,stroke-width:2px,color:#fff;
    class A,B,C,D,E step; class F ship;
```

> 💡 Steps 2–4 are one command each, or run all of them with **`full_pipeline`**.
> Step 6 is **always optional** — the "generate HTML and paste it into Canvas yourself" path needs zero credentials.

---

## 3. How the pieces fit (architecture)

```mermaid
flowchart TB
    subgraph CLIENT [Your AI client]
        AIC([Claude · ChatGPT · Gemini])
    end

    AIC <== "MCP" ==> CC

    subgraph CORE [Command & Control · the coordinator]
        CC{{Orchestration · routing · registry · module loader}}
    end

    subgraph APPS [Worker apps]
        CI[Curriculum Intelligence<br/>analyze · plan]
        CDS[Canvas Design Studio<br/>generate · publish]
    end

    subgraph SHARED [Shared libraries]
        SL[shared-llm<br/>Anthropic + Ollama]
        ST[shared-types]
    end

    subgraph MODULES [Opt-in modules]
        MV[module-video<br/>Panopto provider]
    end

    CC --> CI & CDS
    CC --> MV
    CI & CDS --> SL & ST

    subgraph EXT [External services · all optional]
        ANT([Anthropic]):::ext
        CANVAS([Canvas LMS]):::ext
        PAN([Panopto]):::ext
    end

    SL -.-> ANT
    CDS -.-> CANVAS
    MV -.-> PAN

    classDef hub fill:#3D348B,stroke:#2A2363,stroke-width:2px,color:#fff;
    classDef app fill:#EDEBFF,stroke:#3D348B,stroke-width:1.5px,color:#2A2363;
    classDef lib fill:#F3F2FA,stroke:#8A82C9,stroke-width:1px,color:#2A2363;
    classDef mod fill:#E6F6F3,stroke:#1B998B,stroke-width:1.5px,color:#0F5A4F;
    classDef ext fill:#FFE8C2,stroke:#F18F01,stroke-width:1.5px,color:#5A3A00;
    classDef client fill:#fff,stroke:#999,stroke-width:1.5px,color:#333;
    class CC hub; class CI,CDS app; class SL,ST lib; class MV mod; class ANT,CANVAS,PAN ext; class AIC client;
```

---

## 4. Credentials → what each one unlocks

**Everything works with zero keys.** Each credential just turns on one optional enhancement.

```mermaid
flowchart LR
    subgraph FREE ["✅ Works with NO credentials"]
        F1[Import a Canvas archive]
        F2[Analyze & plan the course]
        F3[Generate Canvas-safe HTML]
        F4[Paste HTML into Canvas by hand]
    end

    subgraph KEYS ["🔑 Optional credentials"]
        K1[Anthropic API key]
        K2[Canvas host + token]
        K3[Panopto OAuth]
        K4[Voyage API key]
        K5[Brave Search key]
    end

    subgraph UNLOCK ["⭐ What they add"]
        U1[AI generation & drafting]
        U2[Direct publish to Canvas]
        U3[Lecture video + transcripts]
        U4[Cloud Q&A embeddings]
        U5[Live topic-currency search]
    end

    K1 --> U1
    K2 --> U2
    K3 --> U3
    K4 --> U4
    K5 --> U5

    classDef free fill:#E6F6F3,stroke:#1B998B,stroke-width:1.5px,color:#0F5A4F;
    classDef key fill:#FFE8C2,stroke:#F18F01,stroke-width:1.5px,color:#5A3A00;
    classDef unlock fill:#EDEBFF,stroke:#3D348B,stroke-width:1.5px,color:#2A2363;
    class F1,F2,F3,F4 free; class K1,K2,K3,K4,K5 key; class U1,U2,U3,U4,U5 unlock;
```

> 🔒 Every key is stored locally under `~/.command-and-control/` with `0o600` permissions, validated before saving, and never echoed back or sent to analytics.

---

## 5. "Which setup do I need?" — decision guide

```mermaid
flowchart TD
    START([What do you want to do?])

    START --> Q1{Just rebuild<br/>and paste manually?}
    Q1 -- Yes --> NONE[/No credentials needed/]

    START --> Q2{Want the AI to<br/>draft & analyze?}
    Q2 -- Yes --> A[setup_anthropic]

    START --> Q3{Publish straight<br/>to Canvas?}
    Q3 -- Yes --> C[setup_canvas]

    START --> Q4{Use lecture videos<br/>/ transcripts?}
    Q4 -- Yes --> P[enable Video module<br/>+ setup_panopto]

    START --> Q5{Prefer a fully<br/>local LLM?}
    Q5 -- Yes --> O[setup_ollama]

    classDef q fill:#EDEBFF,stroke:#3D348B,stroke-width:1.5px,color:#2A2363;
    classDef none fill:#E6F6F3,stroke:#1B998B,stroke-width:2px,color:#0F5A4F;
    classDef act fill:#FFE8C2,stroke:#F18F01,stroke-width:1.5px,color:#5A3A00;
    class START,Q1,Q2,Q3,Q4,Q5 q; class NONE,O none; class A,C,P act;
```

---

## 6. Safe publishing — preview, approve, roll back

Publishing to Canvas is gated: nothing is written until you approve each page, and every publish can be undone.

```mermaid
sequenceDiagram
    autonumber
    participant U as 👩‍🏫 Professor
    participant CC as Command & Control
    participant CV as Canvas LMS

    U->>CC: preview_course_publish(courseDir, courseId)
    CC->>CC: build per-page diffs + manifest (snapshotId)
    CC-->>U: "Here's what would change"
    U->>CC: publish_course(snapshotId, approvals: approve/skip)
    CC->>CV: write only approved pages
    CV-->>CC: results (stops on first failure)
    CC-->>U: published ✅  (snapshot saved)
    Note over U,CV: Changed your mind?
    U->>CC: rollback_course_publish(snapshotId)
    CC->>CV: restore prior state of each page
    CC-->>U: rolled back ↩️
```

---

## 7. First 15 minutes — getting started

```mermaid
flowchart LR
    S1["⬇️ Install<br/>native wizard<br/>(Win x64 / macOS arm64)"]
    S2["🔌 Connect<br/>add C&C to your<br/>AI client"]
    S3["🧭 Orient<br/>ask: <i>get_started</i> /<br/>get_cc_status"]
    S4["🔑 (Optional)<br/>setup_anthropic,<br/>setup_canvas…"]
    S5["▶️ Run<br/>“analyze my course”<br/>then full_pipeline"]

    S1 --> S2 --> S3 --> S4 --> S5

    classDef a fill:#EDEBFF,stroke:#3D348B,stroke-width:2px,color:#2A2363,rx:8,ry:8;
    classDef go fill:#1B998B,stroke:#137567,stroke-width:2px,color:#fff;
    class S1,S2,S3,S4 a; class S5 go;
```

---

## 8. Prompts for graphic-creation tools

Use these to produce polished hero art, banners, and icons in Midjourney, DAL·E·3, Adobe Firefly, Ideogram, or Stable Diffusion. The palette throughout: **deep indigo `#3D348B`**, **teal `#1B998B`**, **warm amber `#F18F01`**, soft off-white backgrounds.

### A. Hero banner (README / docs header)
> A clean, modern flat-illustration banner showing a friendly university professor at a laptop, with a glowing left-to-right pipeline of five connected rounded cards floating beside them labeled conceptually as Download, Analyze, Plan, Design, Publish. Deep indigo (#3D348B) and teal (#1B998B) accents on a soft off-white background, subtle amber (#F18F01) highlights, thin connecting lines with small arrowheads, generous negative space, vector style, no text, 3:1 aspect ratio, crisp and professional, editorial tech-illustration aesthetic.

### B. App icon / logo mark
> A minimalist app icon: an abstract mark combining a graduation cap and a refresh/cycle arrow forming a continuous loop, geometric and balanced, deep indigo and teal duotone with a single amber spark, flat vector, rounded-square badge, subtle soft shadow, centered, no text, high contrast, scalable logo style.

### C. "How it works" isometric diagram
> Isometric 3D illustration of a small software pipeline as connected glossy blocks on a light surface: an archive box flowing into a magnifying-glass analysis node, into a calendar planning node, into a paintbrush design node, into a rocket publish node. Indigo/teal/amber palette, soft ambient occlusion, clean studio lighting, friendly rounded shapes, white background, no text labels, vector-isometric infographic style, 16:9.

### D. Section spot illustrations (set of 5, consistent style)
> A set of five matching flat line-icon spot illustrations in a consistent style, each on its own soft off-white tile with rounded corners, two-tone indigo (#3D348B) line work with teal (#1B998B) fills and tiny amber (#F18F01) accents: (1) a download cloud over a folder, (2) a magnifying glass over a document with checkmarks, (3) a calendar with shifting date arrows, (4) a paintbrush painting a webpage card, (5) a rocket launching from a browser window. Thin uniform stroke weight, minimal, modern, no text.

### E. Security / trust illustration (for the credentials section)
> A reassuring flat illustration of a padlock over a single local folder on a laptop, with small key icons resting safely inside, faint dashed lines to cloud services shown as optional and dimmed. Calm indigo and teal palette with one amber key, soft background, conveys "keys stay local and optional," vector style, generous whitespace, no text, 4:3.

**Tips:** append your platform's quality tags (Midjourney: `--ar 3:1 --style raw --v 6`; SD/Firefly: add `flat vector illustration, high detail, clean composition`). Keep "no text" in prompts — add titles yourself afterward so typography stays crisp.

---

## 9. Where to go next

| You want… | Go to |
| --- | --- |
| Every command + parameter | [`../commands-and-credentials.md`](../commands-and-credentials.md) §2 |
| Every secret + why | [`../commands-and-credentials.md`](../commands-and-credentials.md) §3 |
| To edit these diagrams visually | [`pipeline.excalidraw`](pipeline.excalidraw) at excalidraw.com |
| Contributor orientation | [`../../AGENTS.md`](../../AGENTS.md) |
</content>
