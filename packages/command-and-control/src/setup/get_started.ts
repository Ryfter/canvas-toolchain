import { readSetupState } from './read_state.js';
import { runDoctor } from './doctor.js';
import type {
  ActiveProvider,
  ConfigFileKey,
  DoctorCheck,
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
 * A check's `summary` is its step's `why`. Each check warns for several
 * different reasons — an env-only key, a corrupt file, a provider that
 * `llm-provider.json` names but that has no config — and the doctor already
 * states which one applies. A canned sentence here would be wrong for some of
 * them, which is exactly how a step ends up telling a professor to fix
 * something that is not broken.
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

/** Presentation order. Credentials precede activation, since activation needs a config to exist. */
const STEP_ORDER = ['courses_root', 'canvas', 'llm_credentials', 'llm_provider', 'lecture_answers'];

/**
 * A step before `required` is decided. `capability: null` means no journey
 * blocks on it — the step is real work, but not one of the three verdicts.
 */
interface StepDraft {
  id: string;
  capability: CapabilityId | null;
  title: string;
  /** The doctor's own wording for this check. */
  why: string;
  primary: SetupCall;
  alternatives: SetupCall[];
}

/** A draft from a check builder, before the check's own summary is attached. */
type StepBody = Omit<StepDraft, 'why'>;

function coursesRootCall(): SetupCall {
  return {
    tool: 'ct_setup',
    action: 'courses_root',
    params: { coursesRoot: '<absolute path to the folder that holds your course folders>' },
    needs: ['The folder where you keep your course folders (an absolute path, e.g. ~/Documents/courses).'],
  };
}

function canvasCall(): SetupCall {
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
}

function configureProviderCall(provider: ActiveProvider): SetupCall {
  switch (provider) {
    case 'anthropic':
      return {
        tool: 'ct_setup',
        action: 'anthropic',
        params: { apiKey: '<your Anthropic API key>' },
        needs: ['An Anthropic API key (console.anthropic.com).'],
      };
    case 'ollama':
      return {
        tool: 'ct_setup',
        action: 'ollama',
        params: {},
        needs: ['A local model server running (e.g. Ollama on http://localhost:11434).'],
      };
    case 'lmstudio':
      return {
        tool: 'ct_setup',
        action: 'lmstudio',
        params: {},
        needs: [
          'LM Studio running with a model loaded and its local server started ' +
          '(Developer > Start Server, http://localhost:1234/v1).',
        ],
      };
  }
}

/** Named once so `activateCall` and `foldLlmSteps` cannot drift apart. */
const ACTIVATE_PROVIDER_ACTION = 'llm_provider';

function activateCall(provider: ActiveProvider): SetupCall {
  // The same action the doctor's own fix names, so guidance and diagnosis agree.
  return { tool: 'ct_setup', action: ACTIVATE_PROVIDER_ACTION, params: { provider }, needs: [] };
}

/** The generation providers, in the order guidance offers them. */
const PROVIDER_ORDER: readonly ActiveProvider[] = ['anthropic', 'ollama', 'lmstudio'];

/** A configure call for every provider other than `provider`. */
function otherConfigureCalls(provider: ActiveProvider): SetupCall[] {
  return PROVIDER_ORDER.filter((p) => p !== provider).map(configureProviderCall);
}

/**
 * The providers that can actually be activated, mirroring the doctor's
 * `activeProviderCheck` predicate on purpose: `set_active_llm_provider` refuses
 * a provider whose config file is absent, and an env-only `ANTHROPIC_API_KEY`
 * does not count, because the runtime reads the file rather than the
 * environment.
 */
function activatableProviders(state: SetupState): ActiveProvider[] {
  const providers: ActiveProvider[] = [];
  if (state.llm.anthropic.source === 'file' || state.llm.anthropic.source === 'both') {
    providers.push('anthropic');
  }
  if (state.llm.ollama.configured) providers.push('ollama');
  if (state.llm.lmstudio.configured) providers.push('lmstudio');
  return providers;
}

/**
 * The courses-root fix has two flavors: set the root, or — when config.json is
 * corrupt — repair it first. `loadConfig()` throws on corrupt JSON, so
 * `courses_root` cannot run until `cc` has rewritten the file.
 */
function coursesRootStep(fix: DoctorFix): StepBody {
  if (fix.tool === 'ct_setup' && fix.action === 'cc') {
    return {
      id: 'courses_root',
      capability: 'localAuthoring',
      title: 'Repair your configuration, then set your courses root',
      primary: {
        tool: 'ct_setup',
        action: 'cc',
        params: {},
        needs: ['Your courses root path (an absolute path), to set once config.json is repaired.'],
      },
      alternatives: [],
    };
  }
  if (fix.tool === 'ct_setup' && fix.action === 'courses_root') {
    return {
      id: 'courses_root',
      capability: 'localAuthoring',
      title: 'Set your courses root',
      primary: coursesRootCall(),
      alternatives: [],
    };
  }
  // Keep any other fix the doctor names actionable, under a title that does not
  // claim the call sets the root.
  return {
    id: 'courses_root',
    capability: 'localAuthoring',
    title: 'Fix your configuration',
    primary: { tool: fix.tool, action: fix.action, params: {}, needs: [] },
    alternatives: [],
  };
}

/**
 * The `llm.credentials` check warns for four different reasons (an env-only
 * key, a corrupt anthropic/ollama config, a corrupt lecture-answers config, or
 * no credentials at all), so the step is chosen by which file the fix rewrites.
 */
function credentialsStep(fix: DoctorFix): StepBody {
  if (fix.tool === 'ct_setup' && fix.action === 'lecture_answers') {
    return {
      id: 'lecture_answers',
      // Not one of the three verdicts: `aiAssisted` is about the generation
      // provider, and this file only feeds the course Q&A index. Marking it
      // required would contradict a ready `aiAssisted`.
      capability: null,
      title: 'Repair the course Q&A embeddings config',
      primary: {
        tool: 'ct_setup',
        action: 'lecture_answers',
        params: {},
        needs: ['An embedding provider: a local Ollama server, or the bundled in-process embedder.'],
      },
      alternatives: [],
    };
  }
  if (fix.tool === 'ct_setup' && (fix.action === 'ollama' || fix.action === 'lmstudio')) {
    return {
      id: 'llm_credentials',
      capability: 'aiAssisted',
      title: 'Turn on AI assistance',
      primary: configureProviderCall(fix.action),
      alternatives: otherConfigureCalls(fix.action),
    };
  }
  // The remaining credential fixes all create or rewrite anthropic-config.json.
  return {
    id: 'llm_credentials',
    capability: 'aiAssisted',
    title: 'Turn on AI assistance',
    primary: configureProviderCall('anthropic'),
    alternatives: otherConfigureCalls('anthropic'),
  };
}

/**
 * The `llm.active_provider` check either asks to activate a configured
 * provider, or to finish configuring the one `llm-provider.json` names.
 */
function providerStep(fix: DoctorFix, state: SetupState): StepBody | null {
  const configured = activatableProviders(state);

  if (
    fix.tool === 'ct_setup' &&
    (fix.action === 'anthropic' || fix.action === 'ollama' || fix.action === 'lmstudio')
  ) {
    const named = fix.action;
    // Switching to an already-configured provider is a way out; configuring any
    // other one is the alternative when it has no config file yet.
    const alternatives = PROVIDER_ORDER.filter((p) => p !== named).map((p) =>
      configured.includes(p) ? activateCall(p) : configureProviderCall(p),
    );
    return {
      id: 'llm_provider',
      capability: 'aiAssisted',
      title: 'Finish configuring your LLM provider',
      primary: configureProviderCall(named),
      alternatives,
    };
  }

  // `ct_setup llm_provider` only works when a provider has a config file on
  // disk. With nothing to activate — a corrupt llm-provider.json and no provider
  // configured — the credentials step is the real work, and an activation call
  // here would fail with PROVIDER_NOT_CONFIGURED.
  if (configured.length === 0) return null;
  const [preferred, ...rest] = configured;
  return {
    id: 'llm_provider',
    capability: 'aiAssisted',
    title: 'Activate your LLM provider',
    primary: activateCall(preferred),
    alternatives: rest.map(activateCall),
  };
}

/** The step a single doctor check asks for, or null when it is not first-run guidance. */
function stepFor(check: DoctorCheck, state: SetupState): StepBody | null {
  const fix = check.fix;
  if (!fix) return null;
  switch (check.id) {
    case 'runtime.courses_root':
      return coursesRootStep(fix);
    case 'canvas.credentials':
      return { id: 'canvas', capability: 'canvasConnected', title: 'Connect Canvas', primary: canvasCall(), alternatives: [] };
    case 'llm.credentials':
      return credentialsStep(fix);
    case 'llm.active_provider':
      return providerStep(fix, state);
    default:
      return null;
  }
}

function sameCall(a: SetupCall, b: SetupCall): boolean {
  return a.tool === b.tool && a.action === b.action && JSON.stringify(a.params) === JSON.stringify(b.params);
}

/** True when this call exists only to rewrite a file that is present but unparseable. */
function repairsCorruptFile(call: SetupCall, state: SetupState): boolean {
  const fileKeys: Partial<Record<string, ConfigFileKey>> = {
    anthropic: 'anthropic-config',
    ollama: 'ollama-config',
    lmstudio: 'lmstudio-config',
    lecture_answers: 'lecture-answers-config',
  };
  const key = fileKeys[call.action];
  if (!key) return false;
  const file = state.files[key];
  return file.present && !file.validJson;
}

/**
 * `llm-provider.json` naming a provider with no config makes the doctor warn
 * twice: `llm.active_provider` says "finish configuring <provider>" and
 * `llm.credentials` says "configure some provider". Two steps that both claim
 * to come first and disagree on which provider is worse than one, so the named
 * provider wins and the credentials fix becomes an alternative — unless it
 * repairs a different, corrupt file, which is a separate problem.
 */
function foldLlmSteps(drafts: Map<string, StepDraft>, state: SetupState): void {
  const credentials = drafts.get('llm_credentials');
  const provider = drafts.get('llm_provider');
  if (!credentials || !provider) return;
  // Only the "finish configuring the named provider" step supersedes it: an
  // activation step is a different job and must not swallow the credentials fix.
  if (provider.primary.action === ACTIVATE_PROVIDER_ACTION) return;
  if (sameCall(credentials.primary, provider.primary)) {
    drafts.delete('llm_credentials');
    return;
  }
  if (repairsCorruptFile(credentials.primary, state)) return;
  provider.alternatives.push(credentials.primary);
  drafts.delete('llm_credentials');
}

/**
 * A step's alternatives are the other ways to satisfy it, so a repeat of the
 * primary or of an earlier alternative is noise. More than one producer can
 * propose the same call — `providerStep` offers the unconfigured provider and
 * `foldLlmSteps` folds the credentials fix into that same list — so dedupe in
 * one place at the end rather than trusting each producer to know what the
 * others emitted.
 */
function dedupeAlternatives(drafts: Map<string, StepDraft>): void {
  for (const draft of drafts.values()) {
    const kept: SetupCall[] = [];
    for (const alternative of draft.alternatives) {
      if (sameCall(alternative, draft.primary)) continue;
      if (kept.some((call) => sameCall(call, alternative))) continue;
      kept.push(alternative);
    }
    draft.alternatives = kept;
  }
}

function stepsFor(report: DoctorReport, state: SetupState, journey: SetupJourney): SetupStep[] {
  const requiredCapabilities = new Set(JOURNEY_CAPABILITIES[journey]);
  const drafts = new Map<string, StepDraft>();

  for (const check of report.checks) {
    if (check.status === 'ok') continue;
    const body = stepFor(check, state);
    if (body) drafts.set(body.id, { ...body, why: check.summary });
  }

  foldLlmSteps(drafts, state);
  dedupeAlternatives(drafts);

  return [...drafts.values()]
    .map((draft) => ({
      ...draft.primary,
      id: draft.id,
      required: draft.capability !== null && requiredCapabilities.has(draft.capability),
      title: draft.title,
      why: draft.why,
      alternatives: draft.alternatives,
    }))
    .sort((a, b) => STEP_ORDER.indexOf(a.id) - STEP_ORDER.indexOf(b.id));
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

function greetingFor(steps: SetupStep[], capabilities: ReadyCapability[]): string {
  const required = steps.filter((step) => step.required).length;
  if (required > 0) {
    return `Let's get you set up: ${required} required step${required === 1 ? '' : 's'}, then optional extras.`;
  }
  if (steps.length === 0) {
    return "You're ready — every capability is configured. Ask about your course to begin.";
  }
  if (capabilities.every((capability) => capability.ready)) {
    return "You're ready — every capability is configured. The optional steps below repair extras.";
  }
  return "You're ready — local authoring works now. The optional steps below unlock more.";
}

/** The literal call text. `ct_advanced` takes action=run plus an operation id. */
function renderCall(call: SetupCall): string {
  const args = JSON.stringify(call.params);
  return call.tool === 'ct_advanced'
    ? `${call.tool} action run operation ${call.action} ${args}`
    : `${call.tool} action ${call.action} ${args}`;
}

/**
 * The one-call alternative to a list of steps (#151 R8b): when the guide asks
 * for more than one call, `ct_setup` action `apply` takes several of these
 * sections at once. It stays a note rather than a step — the per-step calls are
 * still the precise path, and a batch patch needs every value at the same time.
 */
function applyHint(steps: SetupStep[]): string | null {
  if (steps.length < 2) return null;
  return (
    'Faster: ct_setup action apply takes several of these sections in one call ' +
    '(ask ct_setup action describe for { of: "apply" }).'
  );
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
    lines.push(`   call: ${renderCall(step)}`);
    if (step.needs.length > 0) lines.push(`   have on hand: ${step.needs.join(' ')}`);
    lines.push(`   why: ${step.why}`);
    for (const alternative of step.alternatives) {
      lines.push(`   or: ${renderCall(alternative)}`);
    }
  });

  const hint = applyHint(guide.steps);
  if (hint) lines.push('', hint);

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
    greeting: greetingFor(steps, capabilities),
    journey,
    readyToGo,
    capabilities,
    steps,
  };

  return { ...guide, text: renderText(guide) };
}
