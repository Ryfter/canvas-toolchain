/**
 * The setup/readiness engine's contract (#151).
 *
 * Two facts shape every type here:
 *   1. A partial setup is legitimate. A professor who only authors Canvas-safe
 *      HTML needs no Canvas token and no API key, so readiness is reported per
 *      capability rather than as one red/green verdict.
 *   2. Secrets never leave this module. `readSetupState` and `runDoctor` report
 *      presence, JSON validity, and POSIX permissions — never a token, key, or
 *      file body. The one exception is a Canvas host and a model name, which are
 *      not credentials and are needed to tell two stores apart.
 */

/** Which capability a report is being requested for. */
export type SetupJourney =
  | 'local-authoring'
  | 'canvas-connected'
  | 'ai-assisted'
  | 'full';

export type ActiveProvider = 'anthropic' | 'ollama';

/**
 * Every config file the engine inspects. Logical keys, not paths, so the doctor
 * can name a file in a check without re-deriving where it lives.
 */
export type ConfigFileKey =
  | 'cc-config'
  | 'canvas-config'
  | 'institution-config'
  | 'anthropic-config'
  | 'ollama-config'
  | 'llm-provider'
  | 'transcript-config'
  | 'lecture-answers-config'
  | 'modules-manifest';

/**
 * The MCP hosts (AI clients) the doctor can read, read-only, to report whether
 * canvas-toolchain is wired in. Reading another app's config is a decision of
 * record (#151 D5); writing one is not, and never will be.
 */
export type McpHostId =
  | 'claude-desktop'
  | 'claude-code'
  | 'cursor'
  | 'vscode'
  | 'windsurf'
  | 'zed'
  | 'codex'
  | 'gemini'
  | 'kiro'
  | 'antigravity';

/**
 * What one host's config says about canvas-toolchain. Booleans, plus the one
 * path that belongs to us — never another server's command, args, or env, any
 * of which can hold a token.
 */
export interface McpHostWiring {
  id: McpHostId;
  displayName: string;
  /** The host's own config directory exists. */
  installed: boolean;
  /** The host's config file exists on disk. */
  configFound: boolean;
  /** A server entry in that file runs canvas-toolchain. */
  wired: boolean;
  /** Wired, but the script it names is gone — usually a checkout that moved. */
  stalePath: boolean;
  /**
   * Present but unreadable: corrupt, too large, or unparseable. Never a throw,
   * and never true on a host that was wired anyway.
   */
  parseError: boolean;
  /**
   * The canvas-toolchain entry's script, with the home directory collapsed to
   * `~`. Null when the host is not wired, or is wired through a package runner
   * (`npx canvas-toolchain`) rather than a file path.
   */
  scriptPath: string | null;
}

export interface HostWiringReport {
  /** One entry per known host, in a stable order. */
  hosts: McpHostWiring[];
  /** At least one host runs canvas-toolchain from a path that exists. */
  anyWired: boolean;
  /** Hosts wired to a script that is no longer on disk. */
  staleHosts: McpHostId[];
}

/** Where the host detector looks. Every field is an injection point for tests. */
export interface HostWiringOptions {
  platform?: NodeJS.Platform;
  homedir?: string;
  /** Environment for `%APPDATA%` and `XDG_CONFIG_HOME`. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
  /**
   * Read cap, overriding each host's own. A larger config is reported as a
   * parse error instead of read.
   */
  maxConfigBytes?: number;
}

/** Presence/validity/permission facts about one file. No file body, ever. */
export interface SecretFileHealth {
  path: string;
  present: boolean;
  /** True only when the file is present and parses as JSON. */
  validJson: boolean;
  /** File mode bits, or null when the file is missing or the platform has none. */
  modeOctal: number | null;
  /** `(mode & 0o077) === 0` on POSIX. Null on Windows, where the bits are synthetic. */
  permissionsOk: boolean | null;
}

/**
 * Result of an opt-in live probe. `errorCode` is a machine code from the
 * environment (`ENOTFOUND`, `ABORT_ERR`, `HTTP_401`) — never an error message,
 * which can echo request material.
 */
export interface ProbeResult {
  attempted: boolean;
  reachable: boolean;
  status?: number;
  errorCode?: string;
}

/**
 * One read-only pass over the machine's setup. Discriminated by concern, not by
 * file, so a check reads the concern it owns.
 */
export interface SetupState {
  platform: NodeJS.Platform;
  /** Courses root from config.json, or null when unset. */
  coursesRoot: string | null;
  coursesRootExists: boolean;
  /** Health of every file the engine read. Values are never included. */
  files: Record<ConfigFileKey, SecretFileHealth>;
  /** The subset of `files` that currently holds a secret value on disk. */
  secretBearingFiles: ConfigFileKey[];

  canvas: {
    /** canvas-config.json loads with a host and a token. */
    configured: boolean;
    /** Normalized bare hostname, e.g. "example.instructure.com". Not a secret. */
    host: string | null;
    configuredAt: string | null;
    probe?: ProbeResult;
  };

  /** Canvas Design Studio's own store, the other half of the Canvas split. */
  designStudio: {
    configured: boolean;
    /** Bare hostname derived from institution.json's canvasUrl. */
    host: string | null;
    hasApiToken: boolean;
    hasWaveApiKey: boolean;
    institutionName: string | null;
  };

  /** The two Canvas stores agree, or neither exists. */
  storesInSync: boolean;

  llm: {
    activeProvider: ActiveProvider | null;
    anthropic: {
      configured: boolean;
      /** Where the key came from. The runtime reads the file only, so 'env' is a trap. */
      source: 'file' | 'env' | 'both' | 'none';
      configuredAt: string | null;
      probe?: ProbeResult;
    };
    ollama: {
      configured: boolean;
      host: string | null;
      model: string | null;
    };
    lectureAnswers: {
      configured: boolean;
      provider: string | null;
    };
  };

  transcripts: {
    /** 'panopto' is the default when no transcript-config.json exists. */
    source: string | null;
    configured: boolean;
  };

  backup: {
    executableConfigured: boolean;
    executableSource: 'env' | 'config' | 'sibling-venv' | 'none';
    managedTomlPresent: boolean;
  };

  modules: {
    bundled: Array<{ id: string; enabled: boolean }>;
    installed: Array<{ id: string; version: string; enabled: boolean }>;
    /** Module ids the installer's picker requested but nobody installed yet. */
    pendingRequests: string[];
  };

  /**
   * Whether canvas-toolchain is wired into each MCP host on this machine, read
   * from the hosts' own config files and never written back. Null when the read
   * was turned off, which the doctor reports as such instead of as "not wired".
   */
  hosts: HostWiringReport | null;
}

export interface ReadSetupStateOptions {
  /**
   * Default false: read-only, no network. True runs bounded live probes against
   * the configured Canvas and Anthropic endpoints.
   */
  probe?: boolean;
  /**
   * Default true: read the other MCP hosts' config files (read-only) to report
   * whether canvas-toolchain is wired into each. Set false to leave those files
   * untouched entirely.
   */
  hosts?: boolean;
}

export type DoctorStatus = 'ok' | 'warn' | 'fail';

export type DoctorCheckId =
  | 'runtime.courses_root'
  | 'security.file_permissions'
  | 'canvas.credentials'
  | 'canvas.store_sync'
  | 'llm.active_provider'
  | 'llm.credentials'
  | 'transcripts.source'
  | 'backup.sidecar'
  | 'modules.pending'
  | 'hosts.wiring';

/** The exact operation that fixes a check, naming a real registered action. */
export interface DoctorFix {
  tool: 'ct_setup' | 'ct_advanced';
  action: string;
  hint: string;
}

export interface DoctorCheck {
  id: DoctorCheckId;
  status: DoctorStatus;
  summary: string;
  /** Paths, ids, and status codes only — never file contents. */
  detail?: string[];
  fix?: DoctorFix;
}

export interface DoctorReport {
  overallStatus: DoctorStatus;
  journey: SetupJourney;
  probed: boolean;
  checkedAt: string;
  checks: DoctorCheck[];
  /** Per-capability verdicts, so a valid partial setup is never shown as all-red. */
  readyJourneys: {
    localAuthoring: boolean;
    canvasConnected: boolean;
    aiAssisted: boolean;
  };
}

export interface RunDoctorOptions {
  /** Forwarded to `readSetupState`. Default false. */
  probe?: boolean;
  /** Default 'full'. */
  journey?: SetupJourney;
  /** A pre-read state, so a caller that already read the disk does not pay twice. */
  state?: SetupState;
  /** Forwarded to `readSetupState` when no `state` is supplied. Default true. */
  hosts?: boolean;
}
