#!/usr/bin/env node
// Canvas Toolchain entrypoint.
//
// Default: launch the unified MCP server (Command & Control). In that mode stdout
// belongs to the MCP protocol, so all human output goes to stderr.
// The `doctor` subcommand instead reports this machine's setup (see --help).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

const CC_PACKAGE = '@canvas-toolchain/command-and-control';
const SERVER_SPEC = `${CC_PACKAGE}/dist/index.js`;
const DOCTOR_SPEC = `${CC_PACKAGE}/dist/setup/index.js`;

const JOURNEYS = ['local-authoring', 'canvas-connected', 'ai-assisted', 'full'];
const DOCTOR_USAGE = 'usage: canvas-toolchain doctor [--json] [--probe] [--journey <id>]';

const HELP = `Canvas Toolchain — course-refresh toolchain for Canvas LMS

Usage:
  canvas-toolchain
      Start the unified MCP server (default). Wire this into your MCP client.

  canvas-toolchain doctor [--json] [--probe] [--journey <id>]
      Check this machine's setup and print what to fix.

  canvas-toolchain --help, -h, help
      Show this help.

doctor options:
  --json            Print one JSON report (no secrets) to stdout, nothing else
  --probe           Also run bounded live network probes (off by default)
  --journey <id>    Judge readiness for one journey (default: full):
                    ${JOURNEYS.join(' | ')}

doctor exit codes:
  0  ready — ok, or warnings only
  1  not ready — the chosen journey failed
  2  usage error, or the Command & Control build is missing
`;

function resolveSpec(spec) {
  try {
    return require.resolve(spec);
  } catch {
    return null;
  }
}

/** The original message and exit code for the default server path, unchanged. */
function startServer(args) {
  const serverPath = resolveSpec(SERVER_SPEC);
  if (!serverPath) {
    console.error(
      'Canvas Toolchain: server build not found.\n' +
      'From a source checkout, run `npm install` in the repo root first — install builds the toolchain.'
    );
    process.exit(1);
  }
  const child = spawn(process.execPath, [serverPath, ...args], { stdio: 'inherit' });
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

function usageError(message) {
  console.error(`Canvas Toolchain doctor: ${message}\n${DOCTOR_USAGE}`);
  process.exit(2);
}

function parseDoctorArgs(args) {
  const options = { json: false, probe: false, journey: 'full' };
  const setJourney = (value) => {
    if (value === undefined) usageError('--journey needs a journey id.');
    if (!JOURNEYS.includes(value)) {
      usageError(`unknown journey "${value}" (expected one of ${JOURNEYS.join(', ')}).`);
    }
    options.journey = value;
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--probe') options.probe = true;
    else if (arg === '--journey') {
      setJourney(args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--journey=')) setJourney(arg.slice('--journey='.length));
    else usageError(`unknown option "${arg}".`);
  }
  return options;
}

function printSummary(report) {
  const lines = [
    `Canvas Toolchain setup — ${report.overallStatus.toUpperCase()} (journey: ${report.journey}` +
      `${report.probed ? ', probed' : ''})`,
  ];
  for (const check of report.checks) {
    const fix = check.fix
      ? ` → fix: ${check.fix.tool} action ${check.fix.action} — ${check.fix.hint}`
      : '';
    lines.push(`[${check.status}] ${check.id} — ${check.summary}${fix}`);
  }
  const ready = report.readyJourneys;
  lines.push(
    `ready: local-authoring=${ready.localAuthoring} ` +
      `canvas-connected=${ready.canvasConnected} ai-assisted=${ready.aiAssisted}`
  );
  process.stdout.write(lines.join('\n') + '\n');
}

async function doctorCommand(args) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  const options = parseDoctorArgs(args);

  const doctorPath = resolveSpec(DOCTOR_SPEC);
  if (!doctorPath) {
    console.error(
      'Canvas Toolchain: the Command & Control build is missing, so the setup check cannot run.\n' +
        'Fix: from a source checkout, run `npm install` in the repo root (it builds the toolchain);\n' +
        'if you installed with the desktop installer, re-run the installer; otherwise run ' +
        '`npx canvas-toolchain@latest`.'
    );
    process.exit(2);
  }

  // The bin's resolution rules put the build next to this file, so no checkout
  // path is ever hardcoded.
  const { runDoctor } = await import(pathToFileURL(doctorPath).href);
  const report = await runDoctor({ probe: options.probe, journey: options.journey });

  if (options.json) {
    process.stdout.write(JSON.stringify(report) + '\n');
  } else {
    printSummary(report);
  }
  process.exit(report.overallStatus === 'fail' ? 1 : 0);
}

const [subcommand, ...rest] = process.argv.slice(2);

if (subcommand === 'doctor') {
  await doctorCommand(rest);
} else if (subcommand === '--help' || subcommand === '-h' || subcommand === 'help') {
  process.stdout.write(HELP);
} else {
  startServer(process.argv.slice(2));
}
