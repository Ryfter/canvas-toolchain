# Canvas Design Studio — Troubleshooting

Every error message from Canvas Design Studio tools includes a **▶ Get help** link at the bottom. The link format is:

```
https://chatgpt.com/?q=Canvas+Design+Studio+error%3A+[error+context]
```

Clicking the link opens ChatGPT with the error context pre-filled. If you use a different AI assistant, copy the text after `?q=` (URL-decoded) and paste it as your prompt.

---

## Canvas API Errors

### 401 Unauthorized

**Symptom:** Tool returns "401 Unauthorized" when publishing or listing courses.

**Cause:** Your Canvas API token is invalid, expired, or was revoked. Canvas tokens expire when you log out of all devices or manually delete them.

**Fix:**
1. Log into Canvas → Account → Settings → Approved Integrations
2. Find the old Canvas Design Studio token and delete it
3. Click **New Access Token** and copy the full token immediately (Canvas only shows it once)
4. Run `setup_institution` and paste the new token when prompted

---

### 403 Forbidden

**Symptom:** Tool returns "403 Forbidden" or "token scope" error.

**Cause:** Your API token exists but does not have permission to perform this action. This usually means the token was created with restricted scope, or you are not a teacher/admin in this course.

**Fix:**
1. Generate a new Canvas API token with full (unrestricted) permissions
2. Run `setup_institution` to save the new token
3. Confirm you are enrolled as Teacher or Designer in the target course

---

### 404 Course Not Found

**Symptom:** `publish_to_canvas` returns "404 Course Not Found".

**Cause:** The `courseId` you passed does not exist or is not accessible to your API token.

**Fix:**
1. Run `list_canvas_courses` to see your available courses and their IDs
2. Pass the exact numeric ID returned by `list_canvas_courses`
3. If the course does not appear, confirm it is not archived or deleted

---

### 429 Rate Limited

**Symptom:** Canvas API calls fail with "429 Rate Limited".

**Cause:** Too many API calls were made too quickly. Canvas enforces rate limits.

**Fix:**
1. Wait 60 seconds
2. Retry the operation
3. If publishing many pages in bulk, space operations out by a few seconds

---

### Connection Error / SSL Error

**Symptom:** API calls fail with a DNS or SSL error.

**Cause:** The Canvas base URL in your institution config is incorrect, or Canvas is in maintenance mode.

**Fix:**
1. Log into Canvas normally in your browser to confirm the URL
2. Run `setup_institution` and re-enter the Canvas base URL (e.g. `https://example.instructure.com`)
3. Check Canvas status at status.instructure.com

---

## Panopto Errors

### Panopto Not Configured

**Symptom:** Tool returns "Panopto is not configured."

**Cause:** No Panopto domain or credentials are saved in your institution config.

**Fix:**
1. Run `setup_institution`
2. When prompted for Panopto domain, enter your institution's Panopto domain (e.g. `example.hosted.panopto.com`)
3. For video search and caption download, also provide a Panopto client ID and secret (generated in Panopto Admin → API Clients)

---

### Panopto Auth Failure

**Symptom:** Video search or caption download fails with an auth error.

**Cause:** Panopto client ID or client secret is incorrect or expired.

**Fix:**
1. Log into Panopto Admin → System → API Clients
2. Regenerate credentials for your Canvas Design Studio client
3. Run `setup_institution` and re-enter the Panopto client ID and secret

---

### Search Returns Empty

**Symptom:** `search_panopto_videos` returns no results.

**Cause:** Your query matched nothing, your library is empty, or the API client does not have access to any videos.

**Fix:**
1. Try `search_panopto_videos` without a query to browse your entire library
2. Confirm videos exist in your Panopto account under the same login used to create the API client
3. If the library is empty, upload videos to Panopto first

---

## HTML Validation Errors

### `<style>` Block Detected

**Symptom:** Validator flags a `<style>` block.

**Cause:** Canvas strips `<style>` blocks from the RCE editor. All CSS must be inline `style=""` attributes.

**Fix:** Replace all `<style>...</style>` sections with inline `style=""` attributes on each element.

---

### `<script>` Tag Detected

**Symptom:** JavaScript is not running on the Canvas page, or the validator flags a `<script>` tag.

**Cause:** Canvas strips all `<script>` tags for security. No JavaScript runs in Canvas RCE pages.

**Fix:** Remove all `<script>` blocks. All page content must use HTML and inline CSS only. Use Canvas's built-in tools (assignments, quizzes, discussions) for interactivity.

---

### Event Attributes (`onclick`, `onload`, etc.)

**Symptom:** Click handlers or other JavaScript events don't work on a Canvas page.

**Cause:** Canvas sanitizes all `on*` event attributes from HTML for security.

**Fix:** Remove all `onclick`, `onload`, `onmouseover`, and similar attributes. Use Canvas's built-in interactive tools instead.

---

### Disallowed CSS Property

**Symptom:** Validator flags `box-shadow`, `opacity`, `gap`, `filter`, `transform`, `transition`, or `animation`.

**Cause:** Canvas's HTML sanitizer strips these properties.

**Fix:** Remove or replace:
- `box-shadow` → use `border` instead
- `opacity` → use `rgba()` color with alpha instead
- `gap` in flex/grid → use `margin` on child elements instead
- `filter`, `transform`, `transition`, `animation` → remove entirely
- `@font-face`, `@import` → remove; use `Lato, sans-serif` as the font stack

---

### Missing `alt` on `<img>`

**Symptom:** Accessibility check flags an image without an `alt` attribute.

**Fix:** Add `alt="descriptive text"` to every `<img>`. For decorative images, use `alt=""`.

---

### `<h1>` in Body HTML

**Symptom:** Validator flags an `<h1>` element.

**Cause:** Canvas uses `<h1>` for the page title. Using `<h1>` in body HTML creates a duplicate heading.

**Fix:** Replace `<h1>` with `<h2>`. Start your heading hierarchy at `<h2>`.

---

## Setup Wizard Errors

### Invalid Hex Color

**Symptom:** Wizard rejects a color input.

**Cause:** The value is not a 6-digit hex color.

**Fix:** Use the format `#RRGGBB`, e.g. `#0033A0`. Use your institution's brand guidelines or a color picker to find the exact hex value.

---

### Invalid Canvas URL

**Symptom:** Wizard rejects the Canvas URL.

**Cause:** The URL does not start with `https://`.

**Fix:** Enter the full URL including the protocol, e.g. `https://example.instructure.com`. Do not include a trailing slash or any path.

---

### Brand URL Fetch Failed

**Symptom:** Wizard reports it could not fetch your brand standards URL.

**Cause:** The URL is unreachable from your network, or the page returned an error.

**Fix:** Continue the wizard interactively — the brand URL is optional. You can find your institution's hex colors in the brand standards page manually and enter them when prompted.

---

## Publishing Errors

### FERPA Review Required

**Symptom:** `publish_to_canvas` stops and returns "FERPA review required."

**Cause:** The HTML contains a pattern that looks like a student ID or grade disclosure.

**Fix:**
1. Review the flagged line number in the error details
2. Remove or generalize any student-specific information
3. If the flagged content is not actually FERPA-sensitive, rerun with `skipFerpaCheck: true` after confirming

---

### Title Collision

**Symptom:** `publish_to_canvas` stops because a similar page already exists.

**Cause:** An existing Canvas page has a title that is too similar to the one you are trying to create.

**Fix:** Rerun `publish_to_canvas` with one of these `collisionAction` values:
- `"update"` — replace the existing page's content (Canvas keeps full revision history)
- `"create"` — create a new page with this title anyway
- `"related"` — create a new page with a different title (provide `relatedPageTitle`)
- `"cancel"` — do nothing
