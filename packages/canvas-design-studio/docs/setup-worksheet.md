# Canvas Design Studio — Setup Worksheet

Fill this out before running `setup_institution`. Take your time — having these values ready makes the wizard fast and confident.

After filling it out, run the setup wizard:
```
npx canvas-toolchain-design-studio
```

Or tell your AI host: *"Run setup_institution."*

---

## Brand Standards (Fill this first — it can save you the color lookup)

Providing your brand standards URL lets your AI extract your primary and secondary colors automatically.

**Brand standards URL** (optional):
```
Your answer: ___________________________________
Example:     https://www.example.edu/brand/
```

— OR —

**Paste brand standards content here** (optional):
```
[paste relevant content from your brand guidelines]
```

If you provide a brand standards URL or content, your AI will suggest your primary and secondary colors during setup. You can confirm or adjust them.

---

## Institution Name

The name of your college or university.

```
Your answer: ___________________________________
Example:     Example University
```

---

## Primary Brand Color

Your institution's main color — used in hero banners, headings, and primary buttons.

**Where to find it:** Your brand standards page, usually listed as "Primary Blue" or similar with a hex value like `#0033A0`.

```
Your answer (6-digit hex): ___________________________________
Example:                   #0033A0
```

---

## Secondary / Accent Color

Your institution's accent or secondary color — used for callouts and highlights.

**Where to find it:** Your brand standards page, usually listed as "Secondary Orange" or "Accent" color.

```
Your answer (6-digit hex): ___________________________________
Example:                   #D64309
```

---

## Canvas Base URL

The web address of your institution's Canvas instance — everything up to (not including) any path.

**Where to find it:** Log into Canvas and copy everything up to the first `/` after the domain.

```
Your answer: ___________________________________
Example:     https://example.instructure.com
```

---

## Canvas API Token (Optional)

Enables direct Canvas publishing and course listing. Leave blank to use the generate-and-paste workflow.

**Where to find it:**
1. Log into Canvas
2. Go to Account → Settings
3. Scroll to Approved Integrations
4. Click **New Access Token**
5. Give it a name (e.g. "Canvas Design Studio") and copy the token immediately — Canvas only shows it once

```
Your answer: ___________________________________
(leave blank to skip — you can add this later)
```

---

## Professor Email (Optional)

Your email address. Used to prevent your own address from being flagged as PII during the FERPA preflight scan before publishing.

```
Your answer: ___________________________________
Example:     you@university.edu
```

---

## Favorite Canvas Course IDs (Optional)

Numeric Canvas course IDs for the courses you use most often. These appear at the top of the `list_canvas_courses` results.

**Where to find them:** The number in your Canvas course URL, e.g. `https://example.instructure.com/courses/12345` → ID is `12345`.

```
Your answer (comma-separated): ___________________________________
Example:                       12345, 67890
```

---

## Panopto Domain (Optional)

Your institution's Panopto domain. Enables video embed generation (no credentials needed) and, with credentials, video search and caption download.

**Where to find it:** Log into Panopto and copy the domain from the URL, e.g. `example.hosted.panopto.com`.

```
Your answer: ___________________________________
Example:     example.hosted.panopto.com
(leave blank to skip Panopto)
```

---

## Panopto API Client ID and Secret (Optional)

Enables `search_panopto_videos` and `fetch_panopto_captions`. Requires creating an API client in Panopto Admin.

**Where to find them:**
1. Log into Panopto as an admin
2. Go to System → API Clients
3. Create a new client for Canvas Design Studio
4. Copy the Client ID and Client Secret

```
Client ID:     ___________________________________
Client Secret: ___________________________________
(leave both blank to skip — embed_panopto_video works without credentials)
```

---

## Teaching Philosophy (Optional — answered interactively in the wizard)

The wizard will ask 6 short questions to build your teaching philosophy profile. You can think through your answers here first.

1. What's one thing you always tell students about this subject that you wish they'd really internalize?
```
Your answer: ___________________________________
```

2. What does a student who truly gets it do differently from one who just completes the work?
```
Your answer: ___________________________________
```

3. What's the biggest mistake students make on your assignments?
```
Your answer: ___________________________________
```

4. What separates an A from a B in concrete terms?
```
Your answer: ___________________________________
```

5. Are there teaching frameworks you consciously draw from? (Bloom's, UDL, constructivism, andragogy, etc.)
```
Your answer: ___________________________________
```

6. Any quotes or sayings you use regularly in class?
```
Your answer: ___________________________________
```
