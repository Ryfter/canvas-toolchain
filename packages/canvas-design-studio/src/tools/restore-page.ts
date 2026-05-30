export interface RestorePageApi {
  updatePage(courseId: number, pageUrl: string, html: string): Promise<unknown>;
  deletePage(courseId: number, pageUrl: string): Promise<void>;
}

export async function restorePage(
  courseId: number,
  pageUrl: string,
  priorHtml: string | null,
  api: RestorePageApi,
): Promise<void> {
  if (priorHtml === null) {
    await api.deletePage(courseId, pageUrl);
  } else {
    await api.updatePage(courseId, pageUrl, priorHtml);
  }
}
