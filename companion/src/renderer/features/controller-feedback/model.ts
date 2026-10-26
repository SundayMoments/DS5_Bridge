import type { BridgeSnapshot } from '@shared/types';
import {
  CONTROLLER_POWER_SAVING_CAP_PERCENT,
  capControllerPowerSavingValue,
  controllerPowerSavingActiveFromSnapshot
} from '../../common/controller-power-saving';

export const HAPTICS_STEP = 20;
export const STANDARD_FEEDBACK_GAIN_PERCENT = 200;
export const BOOSTED_FEEDBACK_GAIN_PERCENT = 500;
export const TEST_HAPTICS_LOCK_MS = 1100;
export const HAPTICS_PRESETS: Array<[string, number]> = [
  ['Low', 50],
  ['Medium', 100],
  ['High', 150]
];
const STANDARD_HAPTICS_SLIDER_TICKS = Array.from({ length: 11 }, (_, index) => index * 20);

export function snapHapticsValue(value: number, max = STANDARD_FEEDBACK_GAIN_PERCENT): number {
  return Math.max(0, Math.min(max, Math.round(value / HAPTICS_STEP) * HAPTICS_STEP));
}

export function feedbackSliderMaxFromSnapshot(snapshot: BridgeSnapshot | null | undefined): number {
  if (controllerPowerSavingActiveFromSnapshot(snapshot)) {
    return CONTROLLER_POWER_SAVING_CAP_PERCENT;
  }
  return snapshot?.settings.feedbackBoostEnabled ? BOOSTED_FEEDBACK_GAIN_PERCENT : STANDARD_FEEDBACK_GAIN_PERCENT;
}

export function feedbackSliderTicks(max: number): number[] {
  if (max === STANDARD_FEEDBACK_GAIN_PERCENT) {
    return STANDARD_HAPTICS_SLIDER_TICKS;
  }
  return Array.from({ length: 11 }, (_, index) => (max / 10) * index);
}

export function displayHapticsValue(snapshot: BridgeSnapshot): number {
  return capControllerPowerSavingValue(snapshot.settings.hapticsGainPercent, snapshot);
}

export function displayClassicRumbleValue(snapshot: BridgeSnapshot): number {
  return capControllerPowerSavingValue(snapshot.settings.classicRumbleGainPercent, snapshot);
}
