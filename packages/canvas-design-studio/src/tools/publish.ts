import { CanvasApiError } from '../canvas-api.js';
import type { CanvasPage, CollisionAction, InstitutionConfig, ToolError } from '../types.js';
import { ferpaGotcha, titleCollisionGotcha, versionControlTip } from './gotchas.js';
import { formatError } from '../utils/errors.js';
import { validateCanvasHtml } from './validate.js';
import { auditAccessibility, type AccessibilityWarning } from './accessibility.js';

const COLLISION_THRESHOLD = 0.8;

export interface PublishToCanvasInput {
  courseId?: number;
  html: string;
  pageTitle: string;
  forcePublish?: boolean;
  skipFerpaCheck?: boolean;
  collisionAction?: CollisionAction;
  relatedPageTitle?: string;
}

export interface PublishSuccess {
  url: string;
  action: 'created' | 'updated';
  pageTitle: string;
  tip: string;
  accessibilityWarnings?: AccessibilityWarning[];
}

export interface PublishApi {
  listPages(courseId: number): Promise<CanvasPage[]>;
  createPage(courseId: number, title: string, html: string): Promise<CanvasPage>;
  updatePage(courseId: number, pageUrl: string, html: string): Promise<CanvasPage>;
}

export interface FerpaFinding {
  reason: string;
  line: number;
}

interface CollisionMatch {
  page: CanvasPage;
  score: number;
}

function lineForOffset(text: string, offset: number): number {
  return text.slice(0, offset).split(/\r?\n/).length;
}

export function scanFerpa(html: string, _professorEmail?: string): FerpaFinding | undefined {
  const patterns: Array<{ reason: string; pattern: RegExp }> = [
    { reason: 'possible University student ID', pattern: /\bB\d{8}\b/i },
    { reason: 'possible 9-digit student ID', pattern: /\b\d{9}\b/ },
    {
      reason: 'possible grade disclosure',
      pattern: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+[^<\n]{0,50}(?:received|scored|earned|grade(?:d)?|score(?:d)?)\b[^<\n]{0,30}\b(?:[ABCDF][+-]?|\d{1,3}%|\d{1,3}\s*\/\s*\d{1,3})(?=\s|<|$)/i,
    },
  ];

  for (const item of patterns) {
    const match = item.pattern.exec(html);
    if (match?.index !== undefined) {
      return { reason: item.reason, line: lineForOffset(html, match.index) };
    }
  }

  return undefined;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleTokens(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(/\s+/).filter(Boolean));
}

function levenshtein(left: string, right: string): number {
  const matrix = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));

  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

function overlapScore(leftTokens: Set<string>, rightTokens: Set<string>): number {
  if (leftTokens.size === 0 && rightTokens.size === 0) return 1;
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  const smallerSetSize = Math.min(leftTokens.size, rightTokens.size);
  return intersection / smallerSetSize;
}

export function titleSimilarity(leftTitle: string, rightTitle: string): number {
  const left = normalizeTitle(leftTitle);
  const right = normalizeTitle(rightTitle);
  const longest = Math.max(left.length, right.length);
  const editScore = longest === 0 ? 1 : 1 - levenshtein(left, right) / longest;
  const tokenContainmentScore = overlapScore(titleTokens(leftTitle), titleTokens(rightTitle));

  return Math.max(editScore, tokenContainmentScore);
}

function bestCollision(pages: CanvasPage[], pageTitle: string): CollisionMatch | undefined {
  const best = pages
    .map(page => ({ page, score: titleSimilarity(page.title, pageTitle) }))
    .sort((left, right) => right.score - left.score)[0];

  return best && best.score >= COLLISION_THRESHOLD ? best : undefined;
}

function canvasPageUrl(page: CanvasPage): string {
  return page.html_url ?? page.url;
}

function validateBeforePublish(html: string): ToolError | undefined {
  const result = validateCanvasHtml(html);
  if (result.valid) return undefined;

  return {
    error: `Canvas HTML validation failed with ${result.violations.length} issue(s). Fix them or pass forcePublish: true after review.`,
    code: 'VALIDATION_FAILED',
    details: { violations: result.violations },
  };
}

function missingTokenError(config: InstitutionConfig): ToolError {
  return {
    error: formatError({
      title: 'Canvas API — No Token Configured',
      message: 'Canvas Design Studio cannot publish directly to Canvas without an API token.',
      cause: 'No API token is saved in your institution config.',
      fix: [
        `Log into Canvas at ${config.canvasUrl}`,
        'Go to Account → Settings → Approved Integrations',
        'Click New Access Token and copy the full token',
        'Run setup_institution and paste the token when prompted',
        'You can still generate HTML and paste it into Canvas manually without a token',
      ],
      context: `no Canvas API token configured, Canvas URL: ${config.canvasUrl}`,
    }),
    code: 'MISSING_API_TOKEN',
  };
}

function collisionError(collision: CollisionMatch, pageTitle: string): ToolError {
  return {
    error: titleCollisionGotcha(collision.page.title, pageTitle, collision.score),
    code: 'TITLE_COLLISION',
    details: {
      existingPage: collision.page,
      newTitle: pageTitle,
      score: collision.score,
      options: [
        'Rerun with collisionAction: "update"',
        'Rerun with collisionAction: "create"',
        'Rerun with collisionAction: "related" and relatedPageTitle',
        'Rerun with collisionAction: "cancel"',
      ],
    },
  };
}

function apiError(err: CanvasApiError, config: InstitutionConfig): ToolError {
  if (err.status === 401) {
    return {
      error: formatError({
        title: 'Canvas API — 401 Unauthorized',
        message: 'Your API token was rejected by Canvas.',
        cause: 'The token in your institution config is invalid, expired, or was revoked.',
        fix: [
          `Log into Canvas at ${config.canvasUrl}`,
          'Go to Account → Settings → Approved Integrations',
          'Delete the old token and generate a new one (Canvas only shows it once — copy it immediately)',
          'Run setup_institution and paste the new token',
        ],
        context: `401 Unauthorized when publishing to Canvas, Canvas URL: ${config.canvasUrl}`,
      }),
      code: 'CANVAS_UNAUTHORIZED',
      details: { status: err.status },
    };
  }

  if (err.status === 404) {
    return {
      error: formatError({
        title: 'Canvas API — 404 Course Not Found',
        message: 'The course ID you provided does not exist or is not accessible with your token.',
        cause: 'Wrong course ID, or your token does not have access to this course.',
        fix: [
          'Run list_canvas_courses to see your available courses and their IDs',
          'Verify the courseId matches exactly what list_canvas_courses returned',
          'Confirm your API token was generated for the same Canvas account that owns this course',
        ],
        context: `404 course not found when publishing, Canvas URL: ${config.canvasUrl}`,
      }),
      code: 'CANVAS_NOT_FOUND',
      details: { status: err.status },
    };
  }

  if (err.status === 429) {
    return {
      error: formatError({
        title: 'Canvas API — 429 Rate Limited',
        message: 'Canvas is temporarily refusing requests — too many were sent too quickly.',
        cause: 'Canvas enforces API rate limits.',
        fix: [
          'Wait 60 seconds',
          'Retry the publish_to_canvas call',
          'If this happens repeatedly, space out multiple publish operations',
        ],
        context: `429 rate limited when publishing, Canvas URL: ${config.canvasUrl}`,
      }),
      code: 'CANVAS_RATE_LIMITED',
      details: { status: err.status },
    };
  }

  if (err.code === 'CANVAS_FORBIDDEN') {
    return {
      error: formatError({
        title: 'Canvas API — 403 Forbidden',
        message: 'Your API token does not have permission to perform this action.',
        cause: 'Token scope may not include page-write permissions, or you are not a teacher/admin in this course.',
        fix: [
          'Generate a new Canvas API token with full (unrestricted) permissions',
          'Run setup_institution to save the new token',
          'Confirm you are enrolled as Teacher or Designer in this course',
        ],
        context: `403 forbidden when publishing, Canvas URL: ${config.canvasUrl}`,
      }),
      code: err.code,
      details: { status: err.status },
    };
  }

  return {
    error: formatError({
      title: 'Canvas API Error',
      message: err.message,
      cause: 'An unexpected error was returned by the Canvas API.',
      fix: [
        'Verify your Canvas base URL in institution config (run setup_institution)',
        'Confirm your API token is still valid',
        'Try again in a moment — this may be a transient Canvas error',
      ],
      context: `Canvas API error when publishing: ${err.message}, Canvas URL: ${config.canvasUrl}`,
    }),
    code: err.code,
    details: { status: err.status },
  };
}

export async function publishToCanvas(
  input: PublishToCanvasInput,
  config: InstitutionConfig,
  api: PublishApi
): Promise<PublishSuccess | ToolError> {
  if (!config.apiToken?.trim()) return missingTokenError(config);

  if (typeof input.courseId !== 'number') {
    return {
      error: 'Course ID is required. Run list_canvas_courses first, then pass the chosen courseId to publish_to_canvas.',
      code: 'COURSE_ID_REQUIRED',
    };
  }

  if (!input.skipFerpaCheck) {
    const finding = scanFerpa(input.html, config.professorEmail);
    if (finding) {
      return {
        error: ferpaGotcha(finding.reason, finding.line),
        code: 'FERPA_REVIEW_REQUIRED',
        details: { ...finding },
      };
    }
  }

  if (!input.forcePublish) {
    const validationError = validateBeforePublish(input.html);
    if (validationError) return validationError;
  }

  const a11yWarnings = auditAccessibility(input.html);

  try {
    const pages = await api.listPages(input.courseId);
    const collision = bestCollision(pages, input.pageTitle);

    if (collision && !input.collisionAction) return collisionError(collision, input.pageTitle);

    if (input.collisionAction === 'cancel') {
      return { error: 'Publishing cancelled. No Canvas page was changed.', code: 'PUBLISH_CANCELLED' };
    }

    if (input.collisionAction === 'update') {
      if (!collision) {
        return { error: 'No matching existing page was found to update.', code: 'NO_COLLISION_TO_UPDATE' };
      }

      const updated = await api.updatePage(input.courseId, collision.page.url, input.html);
      return {
        url: canvasPageUrl(updated),
        action: 'updated',
        pageTitle: updated.title,
        tip: versionControlTip(),
        ...(a11yWarnings.length > 0 && { accessibilityWarnings: a11yWarnings }),
      };
    }

    const title = input.collisionAction === 'related' ? input.relatedPageTitle?.trim() : input.pageTitle;
    if (input.collisionAction === 'related' && !title) {
      return {
        error: 'relatedPageTitle is required when collisionAction is "related".',
        code: 'RELATED_TITLE_REQUIRED',
      };
    }

    const created = await api.createPage(input.courseId, title ?? input.pageTitle, input.html);
    return {
      url: canvasPageUrl(created),
      action: 'created',
      pageTitle: created.title,
      tip: versionControlTip(),
      ...(a11yWarnings.length > 0 && { accessibilityWarnings: a11yWarnings }),
    };
  } catch (err) {
    if (err instanceof CanvasApiError) return apiError(err, config);

    return {
      error: err instanceof Error ? err.message : String(err),
      code: 'PUBLISH_FAILED',
    };
  }
}
