import type { SetupSpotCheckInput, ShellWeekday, SpotCheckPreference } from '../shell_ready/types.js';
import {
  loadSpotCheckPreference,
  saveSpotCheckPreference,
} from '../shell_ready/spot_check_preference.js';

export interface SetupSpotCheckResult {
  ok: boolean;
  preference?: SpotCheckPreference;
  message: string;
  recommendDay: ShellWeekday;
}

const RECOMMEND: ShellWeekday = 'saturday';

export function setupSpotCheck(input: SetupSpotCheckInput): SetupSpotCheckResult {
  const prior = loadSpotCheckPreference();
  const day: ShellWeekday = input.day
    ?? (input.enabled ? RECOMMEND : (prior?.weeklyCheckDay ?? RECOMMEND));

  const preference = saveSpotCheckPreference({
    weeklyCheckEnabled: input.enabled,
    weeklyCheckDay: day,
  });

  const recommendNote =
    'Recommended weekly day is Saturday (two days before the new week’s Monday). ';
  const manualNote =
    'You can still run check_shell_readiness anytime without enabling weekly checks.';

  return {
    ok: true,
    preference,
    recommendDay: RECOMMEND,
    message: input.enabled
      ? `${recommendNote}Weekly spot-check enabled for ${day}. ${manualNote}`
      : `Weekly spot-check disabled. ${manualNote}`,
  };
}
