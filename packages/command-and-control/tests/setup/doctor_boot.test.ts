import { afterEach, describe, expect, it, vi } from 'vitest';

// CT200-07: `canvas-toolchain doctor` calls runDoctor() directly and never runs
// a server entrypoint, so runDoctor() must boot the app homes itself: exactly
// once, before readSetupState. A caller that injects a pre-read state (tests,
// get_started) has already read the disk, so no boot then.

const order: string[] = [];

vi.mock('../../src/setup/app_home_boot.js', () => ({
  ALL_APP_HOMES: ['cc', 'cds', 'ci'],
  bootAppHomes: vi.fn(async (apps: readonly string[]) => {
    order.push(`boot:${apps.join(',')}`);
    return {};
  }),
}));

vi.mock('../../src/setup/read_state.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/setup/read_state.js')>();
  return {
    ...real,
    readSetupState: vi.fn(async (...args: Parameters<typeof real.readSetupState>) => {
      order.push('readSetupState');
      return real.readSetupState(...args);
    }),
  };
});

const { runDoctor } = await import('../../src/setup/doctor.js');
const { bootAppHomes } = await import('../../src/setup/app_home_boot.js');
const { readSetupState } = await import('../../src/setup/read_state.js');

afterEach(() => {
  order.length = 0;
  vi.mocked(bootAppHomes).mockClear();
  vi.mocked(readSetupState).mockClear();
});

describe('runDoctor boots the app homes', () => {
  it('calls bootAppHomes exactly once, for all three apps, before readSetupState', async () => {
    await runDoctor({ hosts: false });

    expect(bootAppHomes).toHaveBeenCalledTimes(1);
    expect(bootAppHomes).toHaveBeenCalledWith(['cc', 'cds', 'ci']);
    expect(order).toEqual(['boot:cc,cds,ci', 'readSetupState']);
  });

  it('does not boot when the caller injects a pre-read state', async () => {
    const state = await readSetupState({ hosts: false });
    order.length = 0;

    const report = await runDoctor({ state });

    expect(bootAppHomes).not.toHaveBeenCalled();
    expect(order).toEqual([]);
    expect(report.checks.length).toBeGreaterThan(0);
  });
});
