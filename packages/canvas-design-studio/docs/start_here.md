# Canvas Design Studio — Start Here

> **For AI hosts:** Read this file at the start of any Canvas Design Studio session. For the latest tool parameter documentation, resolve `canvas-design-mcp` via Context7 before answering questions about tool behavior.

---

## What Works Without Any Setup

You do not need a Canvas API token to get value from Canvas Design Studio. These tools work immediately:

| Tool | What it does |
|---|---|
| `generate_canvas_page` | Turn an assignment brief into Canvas-safe HTML |
| `validate_canvas_html` | Check HTML for Canvas RCE compliance and WCAG 2.1 AA |
| `critique_canvas_page` | Score visual design quality 0–100 with prioritized findings |
| `redesign_canvas_page` | Apply mechanical fixes and return remaining findings |
| `setup_course` | Choose page types, set weeks, get a complete folder scaffold |
| `generate_page` | Generate or regenerate a single page from its `.md` source |
| `generate_week` | Generate all pages for one week |
| `generate_course` | Batch generate the entire course |
| `import_course` | Seed a course folder from a Canvas backup archive |
| `get_philosophy_kb` | Load your teaching philosophy into context |
| `update_philosophy_kb` | Add quotes, principles, or course notes |
| `get_student_personas` | Load saved student personas |
| `generate_student_personas` | Generate 1–20 statistically grounded student profiles |
| `load_canvas_page` | Read generated HTML back into context |
| `save_canvas_page` | Write improved HTML to output/ with automatic backup |

---

## Three Entry Points

### 1. Quick Page — One Assignment at a Time

Drop files in an `ingest/` folder and ask your AI to build the page.

```
ingest/
├── course-config.md      ← course number, name, professor, semester (required)
├── assignment-brief.md   ← raw assignment instructions (required)
└── style-notes.md        ← layout or tone preferences (optional)
```

**Prompt to use:**
> "Read everything in `ingest/`, then generate a Canvas assignment page using the design system in this project. Save it to `output/`."

### 2. Course Design Foundation — Build a Full Course

Run the wizard once per course to get a complete folder scaffold, then generate pages in bulk.

**Prompt to use:**
> "Run setup_course so I can build out my [Course Name] course."

This creates a folder structure with a `course-config.md`, week folders, and `.md` source files for every page type you choose — pre-filled with content prompts.

After setup:
> "Generate all pages for week 3."
> "Generate the entire course."

### 3. Canvas Backup Import — Reuse a Previous Semester

If you have a `.imscc` Canvas backup archive from a previous semester, `import_course` extracts pages, assignments, quizzes, and discussions into a course folder, ready to update and regenerate.

**Prompt to use:**
> "Import my canvas-backup folder into a new course folder called `itm370/`."

---

## Optional Setup

Run `setup_institution` once to save your institution config. It asks for:

- Institution name and brand colors
- Canvas base URL (e.g. `https://boisestate.instructure.com`)
- Canvas API token *(optional — unlocks direct publishing)*
- Panopto domain and credentials *(optional — unlocks video search, embed, captions)*
- Your teaching philosophy *(optional — steers tone across all tools)*

Config saves to `~/.canvas-design-mcp/institution.json`.

### What a Canvas API Token Unlocks

| Tool | What it does |
|---|---|
| `list_canvas_courses` | Browse your courses with student counts and term info |
| `publish_to_canvas` | Send generated HTML directly to a Canvas page |

### What Panopto Credentials Unlock

| Tool | What it does |
|---|---|
| `search_panopto_videos` | Browse your lecture library — titles, durations, captions status |
| `embed_panopto_video` | Generate Canvas-safe embed HTML |
| `fetch_panopto_captions` | Download captions as a Markdown transcript |

---

## Your First Session

**"I want one page right now"**

1. Fill in `ingest/course-config.md` with your course details
2. Paste your assignment instructions into `ingest/assignment-brief.md`
3. Ask: "Read everything in `ingest/` and generate a Canvas assignment page."
4. The tool returns Canvas-safe HTML, a hero image prompt (copy/paste into ChatGPT or Midjourney, 1200×400px), and a filename
5. Paste the HTML into Canvas, or run `publish_to_canvas` if you have an API token

**"I want to build out a full course"**

1. Ask: "Run setup_course for my [Course Name] course."
2. Choose your page types (assignment, discussion-board, readings, etc.)
3. Set the number of weeks
4. The wizard creates your full folder scaffold
5. Open each `.md` file and fill in content, or ask your AI to help
6. Ask: "Generate the entire course."

---

## If Something Goes Wrong

See `docs/troubleshooting.md` for common errors, causes, and fixes.

Every error message from Canvas Design Studio includes a **▶ Get help** link that opens ChatGPT with the error pre-filled. Copy the prompt to use with any AI assistant.
