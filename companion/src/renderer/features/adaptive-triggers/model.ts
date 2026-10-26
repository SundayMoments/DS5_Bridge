import type { TriggerTestMode, TriggerTestTarget } from '@shared/protocol';
import type { BridgeSnapshot } from '@shared/types';
import { capControllerPowerSavingValue } from '../../common/controller-power-saving';

export const TRIGGER_EFFECT_STEP = 10;

export const TEST_TRIGGER_LOCK_MS = 2800;

export const TRIGGER_EFFECT_PRESETS: Array<[string, number]> = [
  ['Low', 30],
  ['Medium', 70],
  ['High', 100]
];

export const TRIGGER_TEST_MODE_OPTIONS: Array<[string, TriggerTestMode]> = [
  ['Feedback', 'feedback'],
  ['Weapon', 'weapon'],
  ['Vibration', 'vibration']
];

export const TRIGGER_TARGET_OPTIONS: Array<[string, TriggerTestTarget]> = [
  ['L2', 'l2'],
  ['R2', 'r2'],
  ['Both Triggers', 'both']
];

export function snapTriggerEffectIntensity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / TRIGGER_EFFECT_STEP) * TRIGGER_EFFECT_STEP));
}

export function displayTriggerEffectIntensityValue(snapshot: BridgeSnapshot): number {
  return capControllerPowerSavingValue(snapshot.settings.triggerEffectIntensityPercent, snapshot);
}
