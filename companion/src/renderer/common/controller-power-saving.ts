import type { BridgeSnapshot } from '@shared/types';

/** While power saving is active, feedback, triggers, and lightbar output stay at or below this. */
export const CONTROLLER_POWER_SAVING_CAP_PERCENT = 60;

/** Power saving only engages while headphones are plugged into the controller. */
export function controllerPowerSavingActiveFromSnapshot(snapshot: BridgeSnapshot | null | undefined): boolean {
  return Boolean(snapshot?.settings.controllerPowerSavingEnabled && snapshot.diagnostics.audioStatus?.headsetPlugged);
}

export function capControllerPowerSavingValue(value: number, snapshot: BridgeSnapshot | null | undefined): number {
  return controllerPowerSavingActiveFromSnapshot(snapshot)
    ? Math.min(value, CONTROLLER_POWER_SAVING_CAP_PERCENT)
    : value;
}

/** True when a saved value above the cap is only being shown capped, so it should not be overwritten. */
export function isPreservingPowerSavingCap(
  snapshot: BridgeSnapshot | null | undefined,
  savedValue: number,
  visibleValue: number
): boolean {
  return controllerPowerSavingActiveFromSnapshot(snapshot)
    && savedValue > CONTROLLER_POWER_SAVING_CAP_PERCENT
    && visibleValue === CONTROLLER_POWER_SAVING_CAP_PERCENT;
}
