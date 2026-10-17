import { readSetupState } from './read_state.js';
import { PREFERRED_PROVIDER_ORDER } from '../tools/set_active_llm_provider.js';
import type {
  ActiveProvider,
  DoctorCheck,
  DoctorCheckId,
  DoctorReport,
  DoctorStatus,
  RunDoctorOptions,
  SetupJourney,
  SetupState,
} from './types.js';

const ALL_CHECKS: DoctorCheckId[] = [
  'runtime.courses_root',
  'security.file_permissions',
  'canvas.credentials',
  'canvas.store_sync',
  'llm.active_provider',
  'llm.credentials',
  'transcripts.source',
  'backup.sidecar',
  'modules.pending',
  'hosts.wiring',
];

/**
 * The checks that decide a journey's verdict. `full` considers everything; a
 * narrower journey ignores checks the caller did not ask about, so an
 * unconfigured Canvas never turns an authoring-only report red.
 */
const JOURNEY_CHECKS: Record<SetupJourney, DoctorCheckId[]> = {
  'local-authoring': ['runtime.courses_root', 'security.file_permissions'],
  'canvas-connected': [
    'runtime.courses_root', 'security.file_permissions', 'canvas.credentials', 'canvas.store_sync',
  ],
  'ai-assisted': [
    'runtime.courses_root', 'security.file_permissions', 'llm.active_provider', 'llm.credentials',
  ],
  full: ALL_CHECKS,
};

/**
 * The requirements that *are* the journey. A caller who asks "am I ready to
 * publish to Canvas?" and has no Canvas token gets `fail`, not the gentler
 * `warn` an unconfigured feature gets in the full report. `ai-assisted` names
 * both halves of the LLM setup: a provider must be active *and* its credentials
 * must work, so a home with neither fails the journey rather than warning.
 */
const JOURNEY_BLOCKERS: Record<SetupJourney, DoctorCheckId[]> = {
  'local-authoring': ['runtime.courses_root'],
  'canvas-connected': ['canvas.credentials'],
  'ai-assisted': ['llm.active_provider', 'llm.credentials'],
  full: [],
};

const STATUS_RANK: Record<DoctorStatus, number> = { ok: 0, warn: 1, fail: 2 };

function coursesRootCheck(state: SetupState): DoctorCheck {
  const configFile = state.files['cc-config'];
  if (configFile.present && !configFile.validJson) {
    return {
      id: 'runtime.courses_root',
      status: 'warn',
      summary: 'config.json is corrupt, so the courses root could not be read.',
      detail: [configFile.path],
      fix: {
        tool: 'ct_setup',
        action: 'cc',
        hint: 'Re-run ct_setup action cc to rewrite config.json, then set your courses root.',
      },
    };
  }
  if (!state.coursesRoot) {
    return {
      id: 'runtime.courses_root',
      status: 'warn',
      summary: 'No courses root is configured.',
      fix: {
        tool: 'ct_setup',
        action: 'courses_root',
        hint: 'Point the toolchain at the folder that holds your course folders.',
      },
    };
  }
  if (!state.coursesRootExists) {
    return {
      id: 'runtime.courses_root',
      status: 'warn',
      summary: `The courses root ${state.coursesRoot} does not exist.`,
      fix: {
        tool: 'ct_setup',
        action: 'courses_root',
        hint: 'Re-run ct_setup action courses_root with a folder that exists.',
      },
    };
  }
  return {
    id: 'runtime.courses_root',
    status: 'ok',
    summary: `Courses root: ${state.coursesRoot}`,
  };
}

function filePermissionsCheck(state: SetupState): DoctorCheck {
  if (state.platform === 'win32') {
    return {
      id: 'security.file_permissions',
      status: 'ok',
      summary: 'POSIX file permissions do not apply on Windows.',
    };
  }
  if (state.secretBearingFiles.length === 0) {
    return {
      id: 'security.file_permissions',
      status: 'ok',
      summary: 'No secret-bearing config files on disk yet.',
    };
  }
  const loose = state.secretBearingFiles.filter((key) => state.files[key].permissionsOk === false);
  if (loose.length > 0) {
    return {
      id: 'security.file_permissions',
      status: 'warn',
      summary: `${loose.length} config file(s) holding a secret are readable by other users.`,
      detail: loose.map((key) => state.files[key].path),
      fix: {
        tool: 'ct_setup',
        action: 'canvas',
        hint:
          'Restrict each file to your account (chmod 600), or re-run the ct_setup action that ' +
          'wrote it (canvas, anthropic, lecture_answers) to rewrite it with 0600 permissions.',
      },
    };
  }
  return {
    id: 'security.file_permissions',
    status: 'ok',
    summary: `All ${state.secretBearingFiles.length} secret-bearing config file(s) are private to your account.`,
  };
}

function canvasCredentialsCheck(state: SetupState): DoctorCheck {
  const canvasFile = state.files['canvas-config'];
  if (canvasFile.present && !canvasFile.validJson) {
    return {
      id: 'canvas.credentials',
      status: 'warn',
      summary: 'canvas-config.json is corrupt, so Canvas is not connected.',
      detail: [canvasFile.path],
      fix: {
        tool: 'ct_setup',
        action: 'canvas',
        hint: 'Re-run ct_setup action canvas with your host and token to rewrite the file.',
      },
    };
  }
  if (!state.canvas.configured) {
    const incomplete = canvasFile.present;
    return {
      id: 'canvas.credentials',
      status: 'warn',
      summary: incomplete
        ? 'canvas-config.json is present but has no usable host and token.'
        : 'Canvas is not connected (needed only for Canvas API work; the manual paste path still works).',
      fix: {
        tool: 'ct_setup',
        action: 'canvas',
        hint: 'Run ct_setup action canvas with your Canvas host and API token.',
      },
    };
  }

  const probe = state.canvas.probe;
  if (probe?.attempted && !probe.reachable) {
    const reason = probe.status !== undefined ? `HTTP ${probe.status}` : probe.errorCode ?? 'unreachable';
    return {
      id: 'canvas.credentials',
      status: 'warn',
      summary: `Canvas at ${state.canvas.host} did not accept the stored token (${reason}).`,
      fix: {
        tool: 'ct_setup',
        action: 'canvas',
        hint: 'Re-issue the token in Canvas and run ct_setup action canvas again.',
      },
    };
  }
  return {
    id: 'canvas.credentials',
    status: 'ok',
    summary: `Canvas configured for ${state.canvas.host}${probe?.attempted ? ' and reachable' : ''}.`,
  };
}

/**
 * Lines the professor needs beyond the verdict: where the bridge last put a file
 * it rewrote, and the fact that Design Studio has not collected a name and
 * colors yet. Both are diagnostics the check surfaces rather than its reason.
 */
function storeNotes(state: SetupState): string[] {
  const notes: string[] = [];
  const migration = state.canvasStoreMigration;
  if (migration) {
    notes.push(`Last Canvas store migration (${migration.at}, ${migration.action}): ${migration.detail}`);
    if (migration.backupPath) notes.push(`Backup of the previous file: ${migration.backupPath}`);
  }
  if (state.designStudio.brandSetupPending) {
    notes.push(
      'Canvas Design Studio still needs its institution name and brand colors — run ' +
      'setup_institution there to finish its brand setup.',
    );
  }
  return notes;
}

function canvasStoreSyncCheck(state: SetupState): DoctorCheck {
  const { canvasConfig, designStudio } = state;
  // A Canvas connection needs a host *and* a token. A local/brand-only
  // institution.json (brand colors, a WAVE key) is a store, not a connection, so
  // it must never be mistaken for one side of the split. Both sides are read RAW
  // from disk: Canvas Design Studio's loadConfig() overlays the canonical
  // credentials, which would hide a disagreement the next save has to reconcile.
  const cdsConnected = designStudio.host !== null && designStudio.hasApiToken;
  const ccConnected = canvasConfig.host !== null && canvasConfig.hasApiToken;
  const notes = storeNotes(state);
  const fix = {
    tool: 'ct_setup' as const,
    action: 'canvas',
    hint:
      'Re-run ct_setup action canvas (or restart Command & Control) to reconcile ' +
      '~/.command-and-control/canvas-config.json with Canvas Design Studio\'s ' +
      '~/.canvas-design-mcp/institution.json.',
  };

  // Neither store names a Canvas host: nothing to reconcile, even when one file
  // holds brand settings or a WAVE key.
  if (canvasConfig.host === null && designStudio.host === null) {
    return {
      id: 'canvas.store_sync',
      status: 'ok',
      summary: designStudio.configured
        ? 'Canvas Design Studio has an institution.json but no Canvas connection, and Command & Control has no Canvas store.'
        : 'Neither Canvas store exists yet.',
      ...(notes.length > 0 && { detail: notes }),
    };
  }
  if (!cdsConnected) {
    const institutionFile = state.files['institution-config'];
    return {
      id: 'canvas.store_sync',
      status: 'warn',
      summary: designStudio.host !== null
        ? `Canvas Design Studio points at ${designStudio.host} but has no API token, so it cannot authenticate.`
        : 'Canvas is configured for Command & Control but not for Canvas Design Studio.',
      detail: [
        institutionFile.present ? institutionFile.path : `${institutionFile.path} (missing)`,
        state.files['canvas-config'].path,
        ...notes,
      ],
      fix,
    };
  }
  if (!ccConnected) {
    const canvasFile = state.files['canvas-config'];
    return {
      id: 'canvas.store_sync',
      status: 'warn',
      summary: 'Canvas Design Studio has a Canvas connection that Command & Control does not.',
      detail: [
        state.files['institution-config'].path,
        canvasFile.present ? canvasFile.path : `${canvasFile.path} (missing)`,
        ...notes,
      ],
      fix,
    };
  }
  if (!state.storesInSync) {
    return {
      id: 'canvas.store_sync',
      status: 'warn',
      summary:
        `The two Canvas stores point at different hosts (${canvasConfig.host} vs ${designStudio.host}).`,
      ...(notes.length > 0 && { detail: notes }),
      fix,
    };
  }
  return {
    id: 'canvas.store_sync',
    status: 'ok',
    summary: `Both Canvas stores agree on ${canvasConfig.host}.`,
    ...(notes.length > 0 && { detail: notes }),
  };
}

function activeProviderCheck(state: SetupState): DoctorCheck {
  const { activeProvider } = state.llm;
  const providerFile = state.files['llm-provider'];
  const anthropicFileConfigured = state.llm.anthropic.source === 'file' || state.llm.anthropic.source === 'both';
  const ollamaConfigured = state.llm.ollama.configured;
  const lmstudioConfigured = state.llm.lmstudio.configured;

  if (activeProvider !== null) {
    const backingConfigured = activeProvider === 'anthropic'
      ? anthropicFileConfigured
      : activeProvider === 'ollama'
        ? ollamaConfigured
        : lmstudioConfigured;
    if (backingConfigured) {
      return {
        id: 'llm.active_provider',
        status: 'ok',
        summary: `Active LLM provider: ${activeProvider}.`,
      };
    }
    return {
      id: 'llm.active_provider',
      status: 'warn',
      summary: `llm-provider.json selects ${activeProvider}, but its configuration is missing.`,
      fix: {
        tool: 'ct_setup',
        action: activeProvider,
        hint: `Run ct_setup action ${activeProvider} to write the missing configuration.`,
      },
    };
  }

  if (providerFile.present && !providerFile.validJson) {
    return {
      id: 'llm.active_provider',
      status: 'warn',
      summary: 'llm-provider.json is corrupt, so no active LLM provider can be resolved.',
      detail: [providerFile.path],
      fix: {
        tool: 'ct_setup',
        action: 'llm_provider',
        hint: 'Run ct_setup action llm_provider to choose one of your configured providers.',
      },
    };
  }

  // Several providers can be configured at once. With no active provider this is
  // a genuine choice, so name them all and suggest, in preference order, without
  // ever picking one: the doctor writes nothing.
  const configured: ActiveProvider[] = PREFERRED_PROVIDER_ORDER.filter((provider) =>
    provider === 'anthropic'
      ? anthropicFileConfigured
      : provider === 'ollama'
        ? ollamaConfigured
        : lmstudioConfigured);

  if (configured.length === 1) {
    const only = configured[0];
    return {
      id: 'llm.active_provider',
      status: 'warn',
      summary:
        `${only} is configured but no active provider is set, so AI tools fail with ` +
        'LLM_PROVIDER_NOT_SET.',
      fix: {
        tool: 'ct_setup',
        action: 'llm_provider',
        hint: `Activate it: ct_setup action llm_provider with provider "${only}".`,
      },
    };
  }

  if (configured.length > 1) {
    return {
      id: 'llm.active_provider',
      status: 'warn',
      summary:
        `Multiple LLM providers are configured (${configured.join(', ')}) but no active provider ` +
        'is set, so AI tools fail with LLM_PROVIDER_NOT_SET.',
      fix: {
        tool: 'ct_setup',
        action: 'llm_provider',
        hint:
          `Run ct_setup action llm_provider with provider "${configured[0]}" to choose one of ` +
          `your configured providers: ${configured.join(', ')}.`,
      },
    };
  }

  return {
    id: 'llm.active_provider',
    status: 'ok',
    summary: 'No LLM provider is configured yet.',
  };
}

function llmCredentialsCheck(state: SetupState): DoctorCheck {
  const { anthropic, activeProvider } = state.llm;
  const corrupt = (key: 'anthropic-config' | 'ollama-config' | 'lmstudio-config' | 'lecture-answers-config',
    action: 'anthropic' | 'ollama' | 'lmstudio' | 'lecture_answers'): DoctorCheck => ({
    id: 'llm.credentials',
    status: 'warn',
    summary: `${key}.json is corrupt.`,
    detail: [state.files[key].path],
    fix: {
      tool: 'ct_setup',
      action,
      hint: `Re-run ct_setup action ${action} to rewrite the file.`,
    },
  });

  if (anthropic.source === 'env') {
    return {
      id: 'llm.credentials',
      status: 'warn',
      summary:
        'ANTHROPIC_API_KEY is set in the environment, but anthropic-config.json is missing — ' +
        'the runtime reads the file, not the environment.',
      fix: {
        tool: 'ct_setup',
        action: 'anthropic',
        hint: 'Run ct_setup action anthropic so the key is stored where the runtime reads it.',
      },
    };
  }
  if (state.files['anthropic-config'].present && !state.files['anthropic-config'].validJson) {
    return corrupt('anthropic-config', 'anthropic');
  }
  if (state.files['ollama-config'].present && !state.files['ollama-config'].validJson) {
    return corrupt('ollama-config', 'ollama');
  }
  if (state.files['lmstudio-config'].present && !state.files['lmstudio-config'].validJson) {
    return corrupt('lmstudio-config', 'lmstudio');
  }
  if (state.files['lecture-answers-config'].present && !state.files['lecture-answers-config'].validJson) {
    return corrupt('lecture-answers-config', 'lecture_answers');
  }

  if (!anthropic.configured && !state.llm.ollama.configured && !state.llm.lmstudio.configured) {
    return {
      id: 'llm.credentials',
      status: 'warn',
      summary: 'No LLM credentials are configured, so the AI-assisted tools are unavailable.',
      fix: {
        tool: 'ct_setup',
        action: 'anthropic',
        hint: 'Add an Anthropic API key, or configure a local model with ct_setup action lmstudio or ollama.',
      },
    };
  }

  const probe = anthropic.probe;
  if (probe?.attempted && !probe.reachable) {
    const reason = probe.status !== undefined ? `HTTP ${probe.status}` : probe.errorCode ?? 'unreachable';
    return {
      id: 'llm.credentials',
      status: 'warn',
      summary: `Anthropic at api.anthropic.com did not accept the stored API key (${reason}).`,
      fix: {
        tool: 'ct_setup',
        action: 'anthropic',
        hint: 'Re-issue the key in the Anthropic console and run ct_setup action anthropic again.',
      },
    };
  }

  const lmStudioProbe = state.llm.lmstudio.probe;
  if (
    activeProvider === 'lmstudio' &&
    lmStudioProbe?.attempted &&
    !lmStudioProbe.reachable
  ) {
    const reason = lmStudioProbe.status !== undefined
      ? `HTTP ${lmStudioProbe.status}`
      : lmStudioProbe.errorCode ?? 'unreachable';
    return {
      id: 'llm.credentials',
      status: 'warn',
      summary: `LM Studio at ${state.llm.lmstudio.host ?? 'the configured URL'} is not reachable (${reason}).`,
      fix: {
        tool: 'ct_setup',
        action: 'lmstudio',
        hint: 'Open LM Studio and click Developer > Start Server, then run ct_setup action lmstudio again.',
      },
    };
  }

  const configured = [
    state.llm.lmstudio.configured && `LM Studio (${state.llm.lmstudio.model ?? 'model unknown'})`,
    state.llm.ollama.configured && `Ollama (${state.llm.ollama.model ?? 'model unknown'})`,
    anthropic.configured && `Anthropic (${anthropic.source === 'both' ? 'environment and file' : 'file'})`,
  ].filter((line): line is string => typeof line === 'string');

  return {
    id: 'llm.credentials',
    status: 'ok',
    summary: `LLM credentials available: ${configured.join(', ')}.`,
  };
}

function transcriptCheck(state: SetupState): DoctorCheck {
  const file = state.files['transcript-config'];
  if (file.present && !file.validJson) {
    return {
      id: 'transcripts.source',
      status: 'warn',
      summary: 'transcript-config.json is corrupt, so transcript enrichment fails until it is rewritten.',
      detail: [file.path],
      fix: {
        tool: 'ct_setup',
        action: 'transcripts',
        hint: 'Re-run ct_setup action transcripts to rewrite the file.',
      },
    };
  }
  return {
    id: 'transcripts.source',
    status: 'ok',
    summary: state.transcripts.configured
      ? `Transcript source: ${state.transcripts.source}.`
      : `No transcript source configured; enrichment defaults to ${state.transcripts.source}.`,
  };
}

function backupCheck(state: SetupState): DoctorCheck {
  if (state.backup.executableConfigured || state.backup.managedTomlPresent) {
    return {
      id: 'backup.sidecar',
      status: 'ok',
      summary:
        `Canvas Backup is available (executable from ${state.backup.executableSource}` +
        `${state.backup.managedTomlPresent ? ', managed config present' : ', no managed config yet'}).`,
    };
  }
  return {
    id: 'backup.sidecar',
    status: 'warn',
    summary: 'Canvas Backup is not configured (optional — only the local archive path needs it).',
    fix: {
      tool: 'ct_setup',
      action: 'backup',
      hint: 'Run ct_setup action backup once per semester to generate the archive config.',
    },
  };
}

function modulesCheck(state: SetupState): DoctorCheck {
  const manifest = state.files['modules-manifest'];
  if (manifest.present && !manifest.validJson) {
    return {
      id: 'modules.pending',
      status: 'warn',
      summary: 'modules.json is corrupt, so no plug-in module is enabled.',
      detail: [manifest.path],
      fix: {
        tool: 'ct_advanced',
        action: 'set_module_enabled',
        hint:
          'Check the real state with ct_advanced operation list_modules, then re-enable with ' +
          'ct_advanced operation set_module_enabled.',
      },
    };
  }
  if (state.modules.pendingRequests.length > 0) {
    return {
      id: 'modules.pending',
      status: 'warn',
      summary:
        `The installer requested ${state.modules.pendingRequests.length} module install(s) that ` +
        `nobody has installed yet: ${state.modules.pendingRequests.join(', ')}.`,
      fix: {
        tool: 'ct_advanced',
        action: 'browse_module_catalog',
        hint: 'Review them, then install with ct_advanced operation install_module.',
      },
    };
  }
  const enabled = state.modules.bundled.filter((m) => m.enabled).map((m) => m.id);
  return {
    id: 'modules.pending',
    status: 'ok',
    summary: enabled.length > 0
      ? `No pending module installs. Enabled: ${enabled.join(', ')}.`
      : 'No pending module installs and no plug-in module enabled.',
  };
}

/**
 * Whether the AI client the professor is talking through can reach the
 * toolchain. It is the one check whose fix is not a tool call — wiring a host is
 * the installer's job — so the remedy lives in the summary rather than in a
 * `fix` that would have to name an operation that does not exist.
 */
function hostsWiringCheck(state: SetupState): DoctorCheck {
  const wiring = state.hosts;
  if (wiring === null) {
    return {
      id: 'hosts.wiring',
      status: 'ok',
      summary: 'MCP host detection was turned off for this report, so no host was checked.',
    };
  }

  const wired = wiring.hosts.filter((host) => host.wired);
  const stale = wired.filter((host) => host.stalePath);
  const remedy =
    'Re-run the canvas-toolchain installer to wire your AI client, or see the setup docs for ' +
    '`npx canvas-toolchain`.';

  if (stale.length > 0) {
    return {
      id: 'hosts.wiring',
      status: 'warn',
      summary:
        `${stale.length} MCP host(s) point canvas-toolchain at a file that no longer exists ` +
        `(${stale.map((host) => host.displayName).join(', ')}). ${remedy}`,
      detail: stale.map((host) => `${host.displayName}: ${host.scriptPath ?? 'script'} (missing)`),
    };
  }

  if (wired.length === 0) {
    const detail = [
      ...wiring.hosts
        .filter((host) => host.parseError)
        .map((host) => `${host.displayName}: config present but unreadable`),
      ...wiring.hosts
        .filter((host) => !host.parseError && (host.installed || host.configFound))
        .map((host) => `${host.displayName}: installed but not wired`),
    ];
    return {
      id: 'hosts.wiring',
      status: 'warn',
      summary: `No MCP host on this machine is wired to run canvas-toolchain. ${remedy}`,
      ...(detail.length > 0 ? { detail } : {}),
    };
  }

  return {
    id: 'hosts.wiring',
    status: 'ok',
    summary: `canvas-toolchain is wired into ${wired.map((host) => host.displayName).join(', ')}.`,
    detail: wired
      .filter((host) => host.scriptPath !== null)
      .map((host) => `${host.displayName}: ${host.scriptPath}`),
  };
}

/** Apply a journey's blockers to warnings, so an explicit ask is answered plainly. */
function escalateForJourney(checks: DoctorCheck[], journey: SetupJourney): DoctorCheck[] {
  const blockers = JOURNEY_BLOCKERS[journey];
  if (blockers.length === 0) return checks;
  return checks.map((check) =>
    blockers.includes(check.id) && check.status === 'warn'
      ? { ...check, status: 'fail' as const }
      : check);
}

/**
 * The actionable half of the setup engine: what is configured, what is broken,
 * and the exact operation that fixes each item.
 */
export async function runDoctor(opts: RunDoctorOptions = {}): Promise<DoctorReport> {
  const journey = opts.journey ?? 'full';
  const state = opts.state ??
    (await readSetupState({ probe: opts.probe === true, hosts: opts.hosts !== false }));

  const checks = escalateForJourney([
    coursesRootCheck(state),
    filePermissionsCheck(state),
    canvasCredentialsCheck(state),
    canvasStoreSyncCheck(state),
    activeProviderCheck(state),
    llmCredentialsCheck(state),
    transcriptCheck(state),
    backupCheck(state),
    modulesCheck(state),
    hostsWiringCheck(state),
  ], journey);

  const considered = new Set(JOURNEY_CHECKS[journey]);
  const overallStatus = checks
    .filter((check) => considered.has(check.id))
    .reduce<DoctorStatus>(
      (worst, check) => (STATUS_RANK[check.status] > STATUS_RANK[worst] ? check.status : worst),
      'ok',
    );

  const { activeProvider, anthropic, ollama, lmstudio } = state.llm;
  // A failed live probe means the key on disk does not work, so an active
  // Anthropic provider is not yet usable even though the file looks complete.
  const anthropicProbeFailed = anthropic.probe?.attempted === true && anthropic.probe.reachable === false;
  const lmstudioProbeFailed = lmstudio.probe?.attempted === true && lmstudio.probe.reachable === false;
  const activeProviderReady = activeProvider !== null &&
    (activeProvider === 'anthropic'
      ? (anthropic.source === 'file' || anthropic.source === 'both') && !anthropicProbeFailed
      : activeProvider === 'ollama'
        ? ollama.configured
        : lmstudio.configured && !lmstudioProbeFailed);

  return {
    overallStatus,
    journey,
    // Read off the state, not the option: a caller-supplied state is the truth
    // about whether probes actually ran.
    probed:
      state.canvas.probe !== undefined ||
      state.llm.anthropic.probe !== undefined ||
      state.llm.lmstudio.probe !== undefined,
    checkedAt: new Date().toISOString(),
    checks,
    readyJourneys: {
      localAuthoring: state.coursesRootExists,
      canvasConnected: state.canvas.configured,
      aiAssisted: activeProviderReady,
    },
  };
}
