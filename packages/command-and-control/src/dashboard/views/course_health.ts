import type { CourseHealth } from '../data.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPublishedAt(iso: string | null): string {
  if (iso === null) return '<em>never</em>';
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

export interface RenderCourseHealthInput {
  coursesRoot: string;
  courses: CourseHealth[];
}

export function renderCourseHealthPage(input: RenderCourseHealthInput): string {
  const rootEsc = escapeHtml(input.coursesRoot);

  const rowsHtml = input.courses.length === 0
    ? `<tr><td colspan="6" style="padding:2em; text-align:center; color:#777;">No courses found under <code>${rootEsc}</code>. Add a course folder with a course-config.md file, then refresh.</td></tr>`
    : input.courses.map((c) => {
        const cov = `${c.transcriptCoverage.withTranscript} / ${c.transcriptCoverage.totalWeeks}`;
        return `<tr>
          <td><span class="health health-${c.health}"></span></td>
          <td>${escapeHtml(c.name)}</td>
          <td>${escapeHtml(c.semester)}</td>
          <td>${c.pageCount}</td>
          <td>${formatPublishedAt(c.lastPublishedAt)}</td>
          <td>${escapeHtml(cov)}</td>
        </tr>`;
      }).join('\n');

  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Canvas Toolchain — Course Health</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1100px; margin: 2em auto; padding: 0 1em; color: #222; }
    h1 { color: #0033A0; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 1em; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #F4F3EF; }
    .health { display: inline-block; width: 14px; height: 14px; border-radius: 50%; vertical-align: middle; }
    .health-green { background: #3B6D11; }
    .health-yellow { background: #B58606; }
    .health-red { background: #A32D2D; }
    .footer { margin-top: 2em; color: #777; font-size: 0.9em; }
    code { background: #F4F3EF; padding: 1px 5px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>Course Health</h1>
  <p>Courses discovered under <code>${rootEsc}</code></p>
  <table>
    <thead>
      <tr><th></th><th>Course</th><th>Semester</th><th>Pages</th><th>Last Published</th><th>Transcripts</th></tr>
    </thead>
    <tbody>
${rowsHtml}
    </tbody>
  </table>
  <p class="footer">Refresh the page to update. Generated ${timestamp}.</p>
</body>
</html>
`;
}
