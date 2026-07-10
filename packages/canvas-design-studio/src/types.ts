export interface InstitutionColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
}

export interface PanoptoConfig {
  domain: string;
  iframeWhitelisted: boolean | null;
  clientId?: string;
  clientSecret?: string;
}

export interface InstitutionConfig {
  institution: string;
  colors: InstitutionColors;
  canvasUrl: string;
  apiToken?: string;
  professorEmail?: string;
  favoriteCourses?: number[];
  kbTipShown?: boolean;
  panopto?: PanoptoConfig;
  brandUrl?: string;
  /** Phase 3 (spec §7): institution accessibility policy anchor. */
  accessibilityPolicy?: import('@canvas-toolchain/shared-types').AccessibilityPolicy;
  /** WAVE subscription API key for wave_deep_check (optional; per-professor). */
  waveApiKey?: string;
}

export interface CanvasEnrollment {
  type?: string;
  role?: string;
  role_id?: number;
  user_id?: number;
  enrollment_state?: string;
}

export interface CanvasCourse {
  id: number;
  name: string;
  course_code?: string;
  nickname?: string;
  friendly_name?: string;
  workflow_state?: string;
  start_at?: string | null;
  end_at?: string | null;
  enrollments?: CanvasEnrollment[];
  total_students?: number;
  teachers?: Array<{ id?: number; display_name?: string; name?: string }>;
  term?: { id?: number; name?: string };
}

export interface CanvasPage {
  title: string;
  url: string;
  html_url?: string;
  published?: boolean;
  updated_at?: string;
}

export interface ToolError {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}

export type SemesterFilter = 'current' | 'future' | 'past' | 'all';
export type CollisionAction = 'update' | 'create' | 'related' | 'cancel';
