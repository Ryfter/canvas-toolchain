import { readSetupState } from './read_state.js';
import { runDoctor } from './doctor.js';
import type {
  DoctorCheckId,
  DoctorFix,
  DoctorReport,
  SetupJourney,
  SetupState,
} from './types.js';

/**
 * First-run guidance, built from the doctor (#151 R3).
 *
 * The doctor answers "what is configured and what is broken". A professor at
 * the start of the semester is asking a different question: "what do I do
 * first, and what do I need in hand when I do it?" This module answers that by
 * projecting the doctor into an ordered list of calls.
 *
 * Two facts shape it, same as the doctor:
 *   1. Local authoring needs no credentials. A professor with no Canvas token
 *      and no API key is fully set up for the generate-and-paste path, so
 *      those steps are optional rather than missing.
 *   2. No particular LLM is assumed. A hosted Anthropic key and a local model
 *      are equal first-class options, and "none" is a legitimate answer.
 *
 * Every step names a real registered operation, and the params are the minimum
 * that call needs. Nothing here reads a secret: only the doctor's own
 * presence/host/model facts, and `<>`-wrapped placeholders for the values the
 * professor supplies.
 */

/** Which capability a report is about. Mirrors `DoctorReport['readyJourneys']`. */
export type CapabilityId = 'localAuthoring' | 'canvasConnected' | 'aiAssisted';

/** One call a step recommends: the exact operation plus the least it needs. */
export interface SetupCall {
  tool: DoctorFix['tool'];
  action: string;
  /** Minimal args. Values wrapped in `<>` are placeholders the professor supplies. */
  params: Record<string, string>;
  /** What to have on hand before calling: a URL, a token, a local model, or nothing. */
  needs: string[];
}

export interface SetupStep extends SetupCall {
  /** Stable id, so a client can recognise a step across runs. */
  id: string;
  /** True when this step blocks the journey the caller asked about. */
  required: boolean;
  title: string;
  why: string;
  /** Other ways to satisfy the step — a local model instead of a hosted key. */
  alternatives: SetupCall[];
}

export interface ReadyCapability {
  id: CapabilityId;
  label: string;
  ready: boolean;
  note: string;
}

export interface GetStartedGuide {
  greeting: string;
  journey: SetupJourney;
  /** No required step remains: the requested journey can be run today. */
  readyToGo: boolean;
  capabilities: ReadyCapability[];
  steps: SetupStep[];
  /** Concise, chat-ready rendering of everything above. */
  text: string;
}

export interface GetStartedOptions {
  /** Which capability to guide toward. Default 'full'. */
  journey?: SetupJourney;
  /** A pre-read state, so a caller that already read the disk does not pay twice. */
  state?: SetupState;
}

/**
 * What each capability needs. `full` is guidance, not a journey verdict: it
 * lists Canvas and AI as optional upgrades, so a no-credential home still gets
 * a "you're ready" once the courses root is set.
 */
const JOURNEY_CAPABILITIES: Record<SetupJourney, CapabilityId[]> = {
  'local-authoring': ['localAuthoring'],
  'canvas-connected': ['localAuthoring', 'canvasConnected'],
  'ai-assisted': ['localAuthoring', 'aiAssisted'],
  full: ['localAuthoring'],
};

/** The capability checks a first-run guide speaks to, in the order to present them. */
const STEP_SPECS: Partial<Record<DoctorCheckId, { id: string; capability: CapabilityId; title: string; why: string }>> = {
  'runtime.courses_root': {
    id: 'courses_root',
    capability: 'localAuthoring',
    title: 'Set your courses root',
    why:
      'Local authoring — generate Canvas-safe HTML and paste it into Canvas yourself — needs no ' +
      'credentials, only a place to keep your course folders.',
  },
  'canvas.credentials': {
    id: 'canvas',
    capability: 'canvasConnected',
    title: 'Connect Canvas',
    why:
      'Unlocks publishing, pulling, and rubric sync through the Canvas API. Skipping it is fine — ' +
      'the manual paste path always works.',
  },
  'llm.credentials': {
    id: 'llm_credentials',
    capability: 'aiAssisted',
    title: 'Turn on AI assistance',
    why:
      'Adds AI drafting and course analysis. Use a hosted key or a local model — either works, and ' +
      'neither is required for local authoring.',
  },
  'llm.active_provider': {
    id: 'llm_provider',
    capability: 'aiAssisted',
    title: 'Activate your LLM provider',
    why: 'AI tools fail with LLM_PROVIDER_NOT_SET until one configured provider is made active.',
  },
};

/** Presentation order. Credentials precede activation, since activation needs a config to exist. */
const STEP_ORDER = ['courses_root', 'canvas', 'llm_credentials', 'llm_provider'];

/** The provider the doctor would activate, preferring the one already configured. */
function preferredProvider(state: SetupState): string {
  return state.llm.anthropic.configured ? 'anthropic' : 'ollama';
}

/**
 * The minimal call for a doctor fix. The doctor already decided *which*
 * operation fixes the check; this only adds the arguments that operation needs
 * and what the professor must have on hand. The default branch keeps an
 * unanticipated fix actionable rather than dropping it.
 */
function callFor(fix: DoctorFix, state: SetupState): SetupCall {
  switch (`${fix.tool}:${fix.action}`) {
    case 'ct_setup:courses_root':
      return {
        tool: 'ct_setup',
        action: 'courses_root',
        params: { coursesRoot: '<absolute path to the folder that holds your course folders>' },
        needs: ['The folder where you keep your course folders (an absolute path, e.g. ~/Documents/courses).'],
      };
    case 'ct_setup:canvas':
      return {
        tool: 'ct_setup',
        action: 'canvas',
        params: {
          host: '<your Canvas host, e.g. school.instructure.com>',
          token: '<your Canvas access token>',
        },
        needs: [
          'Your Canvas URL (e.g. school.instructure.com).',
          'An access token from Canvas: Account > Settings > New Access Token.',
        ],
      };
    case 'ct_setup:anthropic':
      return {
        tool: 'ct_setup',
        action: 'anthropic',
        params: { apiKey: '<your Anthropic API key>' },
        needs: ['An Anthropic API key (console.anthropic.com), or a local model instead — see below.'],
      };
    case 'ct_setup:ollama':
      return {
        tool: 'ct_setup',
        action: 'ollama',
        params: {},
        needs: ['A local model server running (e.g. Ollama on http://localhost:11434).'],
      };
    case 'ct_advanced:set_active_llm_provider':
      return {
        tool: 'ct_advanced',
        action: 'set_active_llm_provider',
        params: { provider: preferredProvider(state) },
        needs: [],
      };
    default:
      return { tool: fix.tool, action: fix.action, params: {}, needs: [] };
  }
}

/** The local-model path, offered only where the primary call is a hosted key. */
function alternativesFor(primary: SetupCall): SetupCall[] {
  if (primary.tool !== 'ct_setup' || primary.action !== 'anthropic') return [];
  return [
    {
      tool: 'ct_setup',
      action: 'ollama',
      params: {},
      needs: ['A local model server, e.g. Ollama on http://localhost:11434 — no API key needed.'],
    },
  ];
}

/**
 * The `llm.active_provider` fix is usually "activate the configured provider".
 * It is a configure step in the one case where llm-provider.json names a
 * provider whose own config file is missing — the doctor then points at that
 * provider's `ct_setup` action instead.
 */
function stepTitle(specId: string, primary: SetupCall, defaultTitle: string): string {
  return specId === 'llm_provider' && primary.action !== 'set_active_llm_provider'
    ? 'Finish configuring your LLM provider'
    : defaultTitle;
}

function stepsFor(report: DoctorReport, state: SetupState, journey: SetupJourney): SetupStep[] {
  const requiredCapabilities = new Set(JOURNEY_CAPABILITIES[journey]);
  const steps: SetupStep[] = [];

  for (const check of report.checks) {
    const spec = STEP_SPECS[check.id];
    if (!spec || check.status === 'ok' || !check.fix) continue;
    const primary = callFor(check.fix, state);
    steps.push({
      ...primary,
      id: spec.id,
      required: requiredCapabilities.has(spec.capability),
      title: stepTitle(spec.id, primary, spec.title),
      why: spec.why,
      alternatives: alternativesFor(primary),
    });
  }

  return steps.sort((a, b) => STEP_ORDER.indexOf(a.id) - STEP_ORDER.indexOf(b.id));
}

function capabilitiesFor(report: DoctorReport, state: SetupState): ReadyCapability[] {
  const { localAuthoring, canvasConnected, aiAssisted } = report.readyJourneys;
  return [
    {
      id: 'localAuthoring',
      label: 'Local authoring',
      ready: localAuthoring,
      note: localAuthoring
        ? 'Ready — generate Canvas-safe HTML and paste it in by hand, with no credentials.'
        : 'Set a courses root to turn this on. No credentials needed.',
    },
    {
      id: 'canvasConnected',
      label: 'Canvas connected',
      ready: canvasConnected,
      note: canvasConnected
        ? 'Ready — publish, pull, and rubric sync through the Canvas API.'
        : 'Optional — add a Canvas host and token to publish directly. The manual paste path works without it.',
    },
    {
      id: 'aiAssisted',
      label: 'AI assisted',
      ready: aiAssisted,
      note: aiAssisted
        ? `Ready — ${state.llm.activeProvider ?? 'a provider'} is active for drafting and analysis.`
        : 'Optional — use a hosted key or a local model. Everything above works without either.',
    },
  ];
}

function greetingFor(steps: SetupStep[]): string {
  const required = steps.filter((step) => step.required).length;
  if (required > 0) {
    return `Let's get you set up: ${required} required step${required === 1 ? '' : 's'}, then optional extras.`;
  }
  if (steps.length === 0) {
    return "You're ready — every capability is configured. Ask about your course to begin.";
  }
  return "You're ready — local authoring works now. The optional steps below unlock more.";
}

function renderText(guide: Omit<GetStartedGuide, 'text'>): string {
  const lines: string[] = [guide.greeting, ''];
  const ready = guide.capabilities.filter((c) => c.ready).map((c) => c.label);
  const pending = guide.capabilities.filter((c) => !c.ready).map((c) => c.label);

  lines.push(`Ready: ${ready.length > 0 ? ready.join(', ') : 'nothing yet'}`);
  if (pending.length > 0) lines.push(`Not yet: ${pending.join(', ')}`);

  if (guide.steps.length === 0) {
    lines.push('', 'Nothing left to configure.');
    return lines.join('\n');
  }

  lines.push('', 'Next steps:');
  guide.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step.required ? '' : 'Optional: '}${step.title}`);
    lines.push(`   call: ${step.tool} action ${step.action} ${JSON.stringify(step.params)}`);
    if (step.needs.length > 0) lines.push(`   have on hand: ${step.needs.join(' ')}`);
    lines.push(`   why: ${step.why}`);
    for (const alternative of step.alternatives) {
      lines.push(`   or: ${alternative.tool} action ${alternative.action} ${JSON.stringify(alternative.params)}`);
    }
  });

  return lines.join('\n');
}

/**
 * First-run guidance for a professor: what works today and the exact calls that
 * turn on the rest. Read-only and offline — `probe` is always false.
 */
export async function getStarted(opts: GetStartedOptions = {}): Promise<GetStartedGuide> {
  const journey = opts.journey ?? 'full';
  const state = opts.state ?? (await readSetupState({ probe: false }));
  const report = await runDoctor({ journey, probe: false, state });

  const steps = stepsFor(report, state, journey);
  const readyToGo = steps.every((step) => !step.required);
  const capabilities = capabilitiesFor(report, state);

  const guide = {
    greeting: greetingFor(steps),
    journey,
    readyToGo,
    capabilities,
    steps,
  };

  return { ...guide, text: renderText(guide) };
}
