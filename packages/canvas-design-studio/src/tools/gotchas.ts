import type { CanvasCourse } from '../types.js';

function plural(count: number, singular: string, pluralValue = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}

function teacherCount(course: CanvasCourse): number {
  if (course.teachers) return course.teachers.length;
  return course.enrollments?.filter(enrollment =>
    enrollment.type === 'teacher' || enrollment.role === 'TeacherEnrollment'
  ).length ?? 0;
}

function studentCount(course: CanvasCourse): number {
  if (typeof course.total_students === 'number') return course.total_students;
  return course.enrollments?.filter(enrollment =>
    enrollment.type === 'student' || enrollment.role === 'StudentEnrollment'
  ).length ?? 0;
}

function normalizeCanvasUrl(canvasUrl: string): string {
  return canvasUrl.replace(/\/+$/, '');
}

export function courseCoordinatorGotcha(course: CanvasCourse): string | undefined {
  const teachers = teacherCount(course);
  const students = studentCount(course);

  if (students === 0 || teachers >= 3) {
    return [
      `Heads up: this course has ${plural(teachers, 'teacher')} and ${plural(students, 'student')}.`,
      'If you are listed as a coordinator rather than the instructor of record, publishing here may affect a live course you do not manage.',
      'Double-check that this is the right course before publishing.',
    ].join(' ');
  }

  return undefined;
}

export function titleCollisionGotcha(existingTitle: string, newTitle: string, score: number): string {
  return [
    'A page with a similar title already exists:',
    `  Existing: "${existingTitle}"`,
    `  New:      "${newTitle}"`,
    `  Similarity: ${score.toFixed(2)}`,
    '',
    'Rerun publish_to_canvas with one of these options:',
    '  collisionAction: "update" to replace the existing page content',
    '  collisionAction: "create" to create a new page with this title',
    '  collisionAction: "related" and relatedPageTitle to create a clearly named variation',
    '  collisionAction: "cancel" to stop without changing Canvas',
  ].join('\n');
}

export function tokenScopeGotcha(canvasUrl: string): string {
  const settingsUrl = `${normalizeCanvasUrl(canvasUrl)}/profile/settings`;
  return [
    'Your Canvas API token or Canvas role does not allow editing pages in this course.',
    `If you expected this to work, check that you can edit Pages in the course and generate a new token at ${settingsUrl}.`,
    'Then run setup_institution to update the stored token.',
  ].join(' ');
}

export function ferpaGotcha(reason: string, line: number): string {
  return [
    `This HTML may contain student data (${reason} near line ${line}).`,
    'Publishing student records to a Canvas page may violate FERPA.',
    'Review before continuing. Pass skipFerpaCheck: true only after confirming the content is safe to publish.',
  ].join(' ');
}

export function versionControlTip(): string {
  return 'Tip: Save your HTML source to a Git repo before publishing. Canvas stores page revisions, but they are hard to diff and expire. Git is the right tool for tracking changes over time.';
}
