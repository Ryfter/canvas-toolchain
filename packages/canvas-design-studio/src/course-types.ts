export const PAGE_TYPES = [
  'front-page',
  'overview',
  'resources',
  'slides',
  'videos',
  'assignment',
  'engage-assignment',
  'proj-assignment',
  'tech-assignment',
  'reading',
  'reading-quiz',
  'weekly-quiz',
  'lab',
  'discussion-board',
  'extra-credit',
  'custom',
] as const;

export type PageType = typeof PAGE_TYPES[number];

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  'front-page':        'Front Page (course home)',
  'overview':          'Overview (learning objectives, intro, activities)',
  'resources':         'Resources (slides, videos, readings combined)',
  'slides':            'Slides (dedicated slide deck page)',
  'videos':            'Videos (dedicated Panopto video page)',
  'assignment':        'Assignment',
  'engage-assignment': 'Engage Assignment (short in-class activity)',
  'proj-assignment':   'Project Assignment (multi-week deliverable)',
  'tech-assignment':   'Technical Assignment (hands-on, tool-based)',
  'reading':           'Reading',
  'reading-quiz':      'Reading Quiz',
  'weekly-quiz':       'Weekly Quiz',
  'lab':               'Lab',
  'discussion-board':  'Discussion Board',
  'extra-credit':      'Extra Credit',
  'custom':            'Custom (professor-defined sections)',
};

export const DEFAULT_PAGE_TYPES: PageType[] = [
  'front-page',
  'overview',
  'resources',
  'assignment',
  'discussion-board',
  'weekly-quiz',
];

export interface CourseColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
}

export interface WeekEntry {
  week: number;
  weekStr: string;
  title: string;
  topic: string;
}

export interface CourseConfig {
  institution: string;
  courseName: string;
  courseNumber: string;
  professor: string;
  semester: string;
  weeks: number;
  pageTypes: PageType[];
  layoutFixed: boolean;
  colors: CourseColors;
  heroImages: Partial<Record<PageType, string>>;
  weekOutline: WeekEntry[];
}

export interface PageFrontMatter {
  week?: number;
  title?: string;
  heroImage?: string;
  assignmentNumber?: string;
  due?: string;
  points?: number;
  team?: boolean;
  timeline?: boolean;
  /** Sentinel set by import_course's preserveOriginalHtml mode. When true, the
   *  page body is raw HTML lifted verbatim from the source archive and
   *  generate_page should pass it through unchanged instead of running it
   *  through the section-based template. */
  importedVerbatim?: boolean;
  [key: string]: string | number | boolean | undefined;
}

export interface PageContent {
  pageType: PageType;
  frontMatter: PageFrontMatter;
  sections: Record<string, string>;
  /** Set when frontMatter.importedVerbatim is true. Contains the entire body
   *  HTML lifted verbatim from the source archive — bypasses section parsing.
   *  When set, renderPage emits this body inside a minimal Lato/max-width
   *  shell with no hero or template-driven structure. */
  verbatimBody?: string;
}

export interface GeneratePageInput {
  mdPath: string;
  courseDir?: string;
  outputDir?: string;
  templateId?: string;
  themeId?: string;
  promptSetId?: string;
}

export interface GeneratePageResult {
  html: string;
  filename: string;
  weekNumber: number;
  pageType: PageType;
  savedTo: string;
  /** Title from PageFrontMatter.title (when present in source markdown). Used by
   *  command-and-control's publish_course to match against existing Canvas page titles
   *  instead of relying on the lossy filename-derivation fallback. */
  title?: string;
}

export interface GenerateWeekInput {
  weekNumber: number;
  courseDir?: string;
  outputDir?: string;
  templateId?: string;
  themeId?: string;
  promptSetId?: string;
}

export interface GenerateWeekResult {
  weekNumber: number;
  pages: GeneratePageResult[];
  outputDir: string;
  warnings: string[];
}

export interface CourseContext {
  /** Professor's pedagogy and philosophy notes (markdown). */
  philosophyKb?: string;
  /** Student persona descriptions (markdown). */
  studentPersonas?: string;
}

export interface GenerateCourseInput {
  courseDir?: string;
  outputDir?: string;
  templateId?: string;
  themeId?: string;
  promptSetId?: string;
  /** Optional KB context loaded from the shared resource layer. */
  context?: CourseContext;
}

export interface GenerateCourseResult {
  totalPages: number;
  outputDir: string;
  weekResults: GenerateWeekResult[];
  warnings: string[];
}

export interface LlmOpts {
  model?: string;
  maxTokens?: number;
}

export interface LlmClient {
  complete(prompt: string, opts?: LlmOpts): Promise<string>;
}
