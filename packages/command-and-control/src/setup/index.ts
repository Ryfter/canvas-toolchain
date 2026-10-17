export { readSetupState } from './read_state.js';
export { runDoctor } from './doctor.js';
export { getStarted } from './get_started.js';
export type {
  CapabilityId,
  GetStartedGuide,
  GetStartedOptions,
  ReadyCapability,
  SetupCall,
  SetupStep,
} from './get_started.js';
export { detectHostWiring } from './hosts.js';
export type {
  ActiveProvider,
  ConfigFileKey,
  DoctorCheck,
  DoctorCheckId,
  DoctorFix,
  DoctorReport,
  DoctorStatus,
  HostWiringOptions,
  HostWiringReport,
  McpHostId,
  McpHostWiring,
  ProbeResult,
  ReadSetupStateOptions,
  RunDoctorOptions,
  SecretFileHealth,
  SetupJourney,
  SetupState,
} from './types.js';
