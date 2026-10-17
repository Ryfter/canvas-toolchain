import { readSetupState } from './read_state.js';
import type {
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
 * The one requirement that *is* the journey. A caller who asks "am I ready to
 * publish to Canvas?" and has no Canvas token gets `fail`, not the gentler
 * `warn` an unconfigured feature gets in the full report.
 */
const JOURNEY_BLOCKER: Record<SetupJourney, DoctorCheckId | null> = {
  'local-authoring': 'runtime.courses_root',
  'canvas-connected': 'canvas.credentials',
  'ai-assisted': 'llm.active_provider',
  full: null,
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

function canvasStoreSyncCheck(state: SetupState): DoctorCheck {
  const { canvas, designStudio } = state;
  const fix = {
    tool: 'ct_setup' as const,
    action: 'canvas',
    hint:
      'Keep ~/.command-and-control/canvas-config.json as the source of truth; Canvas Design ' +
      'Studio reads its own ~/.canvas-design-mcp/institution.json, which only the standalone ' +
      'setup_institution wizard writes.',
  };

  if (!canvas.configured && !designStudio.configured) {
    return {
      id: 'canvas.store_sync',
      status: 'ok',
      summary: 'Neither Canvas store exists yet.',
    };
  }
  if (!designStudio.configured) {
    return {
      id: 'canvas.store_sync',
      status: 'warn',
      summary: 'Canvas is configured for Command & Control but not for Canvas Design Studio.',
      detail: [state.files['canvas-config'].path, `${state.files['institution-config'].path} (missing)`],
      fix,
    };
  }
  if (!canvas.configured) {
    return {
      id: 'canvas.store_sync',
      status: 'warn',
      summary: 'Canvas Design Studio has a Canvas connection that Command & Control does not.',
      detail: [state.files['institution-config'].path, `${state.files['canvas-config'].path} (missing)`],
      fix,
    };
  }
  if (!state.storesInSync) {
    return {
      id: 'canvas.store_sync',
      status: 'warn',
      summary:
        `The two Canvas stores point at different hosts (${canvas.host} vs ${designStudio.host}).`,
      fix,
    };
  }
  return {
    id: 'canvas.store_sync',
    status: 'ok',
    summary: `Both Canvas stores agree on ${canvas.host}.`,
  };
}

function activeProviderCheck(state: SetupState): DoctorCheck {
  const { activeProvider } = state.llm;
  const providerFile = state.files['llm-provider'];
  const anthropicFileConfigured = state.llm.anthropic.source === 'file' || state.llm.anthropic.source === 'both';
  const ollamaConfigured = state.llm.ollama.configured;

  if (activeProvider !== null) {
    const backingConfigured = activeProvider === 'anthropic' ? anthropicFileConfigured : ollamaConfigured;
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
        tool: 'ct_advanced',
        action: 'set_active_llm_provider',
        hint: 'Re-run ct_advanced action set_active_llm_provider (operation set_active_llm_provider).',
      },
    };
  }

  if (anthropicFileConfigured || ollamaConfigured) {
    const configured = anthropicFileConfigured ? 'anthropic' : 'ollama';
    return {
      id: 'llm.active_provider',
      status: 'warn',
      summary:
        `${configured} is configured but no active provider is set, so AI tools fail with ` +
        'LLM_PROVIDER_NOT_SET.',
      fix: {
        tool: 'ct_advanced',
        action: 'set_active_llm_provider',
        hint: `Activate ${configured} (provider: "${configured}").`,
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
  const { anthropic } = state.llm;
  const corrupt = (key: 'anthropic-config' | 'ollama-config' | 'lecture-answers-config',
    action: 'anthropic' | 'ollama' | 'lecture_answers'): DoctorCheck => ({
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
  if (state.files['lecture-answers-config'].present && !state.files['lecture-answers-config'].validJson) {
    return corrupt('lecture-answers-config', 'lecture_answers');
  }

  if (!anthropic.configured && !state.llm.ollama.configured) {
    return {
      id: 'llm.credentials',
      status: 'warn',
      summary: 'No LLM credentials are configured, so the AI-assisted tools are unavailable.',
      fix: {
        tool: 'ct_setup',
        action: 'anthropic',
        hint: 'Add an Anthropic API key, or configure a local model with ct_setup action ollama.',
      },
    };
  }

  const configured = [
    anthropic.configured && `Anthropic (${anthropic.source === 'both' ? 'environment and file' : 'file'})`,
    state.llm.ollama.configured && `Ollama (${state.llm.ollama.model ?? 'model unknown'})`,
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

/** Apply a journey's blocker to a warning, so an explicit ask is answered plainly. */
function escalateForJourney(checks: DoctorCheck[], journey: SetupJourney): DoctorCheck[] {
  const blocker = JOURNEY_BLOCKER[journey];
  if (blocker === null) return checks;
  return checks.map((check) =>
    check.id === blocker && check.status === 'warn'
      ? { ...check, status: 'fail' as const }
      : check);
}

/**
 * The actionable half of the setup engine: what is configured, what is broken,
 * and the exact operation that fixes each item.
 */
export async function runDoctor(opts: RunDoctorOptions = {}): Promise<DoctorReport> {
  const journey = opts.journey ?? 'full';
  const state = opts.state ?? (await readSetupState({ probe: opts.probe === true }));

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
  ], journey);

  const considered = new Set(JOURNEY_CHECKS[journey]);
  const overallStatus = checks
    .filter((check) => considered.has(check.id))
    .reduce<DoctorStatus>(
      (worst, check) => (STATUS_RANK[check.status] > STATUS_RANK[worst] ? check.status : worst),
      'ok',
    );

  const { activeProvider, anthropic, ollama } = state.llm;
  const activeProviderReady = activeProvider !== null &&
    (activeProvider === 'anthropic'
      ? anthropic.source === 'file' || anthropic.source === 'both'
      : ollama.configured);

  return {
    overallStatus,
    journey,
    // Read off the state, not the option: a caller-supplied state is the truth
    // about whether probes actually ran.
    probed: state.canvas.probe !== undefined || state.llm.anthropic.probe !== undefined,
    checkedAt: new Date().toISOString(),
    checks,
    readyJourneys: {
      localAuthoring: state.coursesRootExists,
      canvasConnected: state.canvas.configured,
      aiAssisted: activeProviderReady,
    },
  };
}
