/** Rollback's page-HTML rewrite step.
 *
 *  When rollback restores a widget by re-uploading via publishWidget, it gets
 *  a NEW Canvas Files file_id (Phase 0 finding — overwrite changes the id).
 *  The host page's iframe src therefore needs to be swapped from the
 *  publish-time file_id to the just-restored file_id before pushing the
 *  page back to Canvas.
 *
 *  Implementation: targeted regex over /courses/<N>/files/<oldFileId>/preview
 *  (course-relative or absolute). Leaves iframes pointing at OTHER file_ids
 *  untouched — so a page with multiple widgets can be progressively rewritten
 *  one widget at a time without earlier rewrites being clobbered. */
export function rewriteIframeFileId(html: string, oldFileId: number, newFileId: number): string {
  const re = new RegExp(
    `((?:https?:\\/\\/[^\\/"]+)?)(\\/courses\\/\\d+\\/files\\/)${oldFileId}(\\/preview(?:\\?[^"]*)?)`,
    'g',
  );
  return html.replace(re, (_match, scheme, coursesPath, tail) => `${scheme}${coursesPath}${newFileId}${tail}`);
}
