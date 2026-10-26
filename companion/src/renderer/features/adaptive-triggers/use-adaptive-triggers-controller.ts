import { useRef, useState } from 'react';
import type { TriggerTestMode, TriggerTestTarget } from '@shared/protocol';
import type { BridgeSnapshot } from '@shared/types';
import type { AppRuntime } from '../../composition/app-runtime';
import {
  CONTROLLER_POWER_SAVING_CAP_PERCENT,
  capControllerPowerSavingValue,
  controllerPowerSavingActiveFromSnapshot,
  isPreservingPowerSavingCap as preservesPowerSavingCap
} from '../../common/controller-power-saving';
import {
  TEST_TRIGGER_LOCK_MS,
  displayTriggerEffectIntensityValue,
  snapTriggerEffectIntensity
} from './model';

/** Trigger effect intensity, the short trigger test, and the enable switch. */
export function useAdaptiveTriggersController(runtime: AppRuntime) {
  const { snapshot, connected, pendingAction, setSnapshot, runAction } = runtime;
  const adaptiveTriggersSupported = Boolean(snapshot?.status?.firmwareFlags.adaptiveTriggersControl);
  const adaptiveTriggersEnabled = Boolean(snapshot?.settings.adaptiveTriggersEnabled);
  const adaptiveTriggerOutputActive = Boolean(snapshot?.status?.adaptiveTriggerOutputRecent);
  const controllerPowerSavingActive = controllerPowerSavingActiveFromSnapshot(snapshot);
  const percentSliderMax = controllerPowerSavingActive ? CONTROLLER_POWER_SAVING_CAP_PERCENT : 100;
  function isPreservingPowerSavingCap(savedValue: number, visibleValue: number): boolean {
    return preservesPowerSavingCap(snapshot, savedValue, visibleValue);
  }
  const [triggerEffectIntensityValue, setTriggerEffectIntensityValue] = useState(100);
  const [triggerTarget, setTriggerTarget] = useState<TriggerTestTarget>('both');

  const [triggerTestLocked, setTriggerTestLocked] = useState(false);

  const triggerEffectEditingRef = useRef(false);

  const testTriggersUnavailable = !connected
    || !adaptiveTriggersSupported
    || !adaptiveTriggersEnabled
    || pendingAction !== null
    || triggerTestLocked
    || adaptiveTriggerOutputActive
    || Boolean(snapshot?.status?.testAdaptiveTriggersBusy);
  const triggerStatusReady = connected
    && adaptiveTriggersSupported
    && adaptiveTriggersEnabled
    && !triggerTestLocked
    && !adaptiveTriggerOutputActive
    && !snapshot?.status?.testAdaptiveTriggersBusy;
  const triggerStatusLabel = triggerTestLocked || snapshot?.status?.testAdaptiveTriggersBusy
    ? 'Testing'
    : triggerStatusReady
      ? 'Ready'
      : connected && adaptiveTriggerOutputActive
        ? 'Game Triggers Active'
        : 'Unavailable';
  const triggerStatusTone = triggerTestLocked || snapshot?.status?.testAdaptiveTriggersBusy || triggerStatusReady
    ? 'good'
    : connected && adaptiveTriggerOutputActive
      ? 'warn'
      : 'idle';

  async function commitTriggerEffectIntensity(value = triggerEffectIntensityValue) {
    const snappedValue = snapTriggerEffectIntensity(value);
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !adaptiveTriggersSupported
      || !snapshot.settings.adaptiveTriggersEnabled
      || (controllerPowerSavingActive && snapshot.settings.triggerEffectIntensityPercent > CONTROLLER_POWER_SAVING_CAP_PERCENT && snappedValue === CONTROLLER_POWER_SAVING_CAP_PERCENT)
      || snappedValue === snapshot.settings.triggerEffectIntensityPercent
    ) {
      triggerEffectEditingRef.current = false;
      return;
    }

    try {
      const next = await window.bridge.setTriggerEffectIntensity(snappedValue);
      setSnapshot(next);
      setTriggerEffectIntensityValue(displayTriggerEffectIntensityValue(next));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setTriggerEffectIntensityValue(displayTriggerEffectIntensityValue(next));
    } finally {
      triggerEffectEditingRef.current = false;
    }
  }

  function setTriggerIntensityPreset(value: number) {
    const snappedValue = snapTriggerEffectIntensity(capControllerPowerSavingValue(value, snapshot));
    setTriggerEffectIntensityValue(snappedValue);
    void commitTriggerEffectIntensity(snappedValue);
  }

  function runTestAdaptiveTriggers() {
    setTriggerTestLocked(true);
    void runAction('triggers', async () => {
      if (
        snapshot
        && triggerEffectIntensityValue !== snapshot.settings.triggerEffectIntensityPercent
        && !isPreservingPowerSavingCap(snapshot.settings.triggerEffectIntensityPercent, triggerEffectIntensityValue)
      ) {
        await window.bridge.setTriggerEffectIntensity(triggerEffectIntensityValue);
      }
      return window.bridge.testAdaptiveTriggers(snapshot?.settings.triggerTestMode ?? 'feedback', triggerTarget);
    }).finally(() => {
      window.setTimeout(() => setTriggerTestLocked(false), TEST_TRIGGER_LOCK_MS);
    });
  }

  function setTriggerTestMode(mode: TriggerTestMode) {
    void runAction('trigger-mode', () => window.bridge.setTriggerTestMode(mode));
  }

  function toggleAdaptiveTriggersEnabled() {
    if (!snapshot) return;
    void runAction('triggers-enabled', () => (
      window.bridge.setAdaptiveTriggersEnabled(!snapshot.settings.adaptiveTriggersEnabled)
    ));
  }

  function syncSnapshot(next: BridgeSnapshot) {
    if (!triggerEffectEditingRef.current) {
      setTriggerEffectIntensityValue(displayTriggerEffectIntensityValue(next));
    }
  }

  return {
    adaptiveTriggersSupported,
    adaptiveTriggersEnabled,
    adaptiveTriggerOutputActive,
    controllerPowerSavingActive,
    percentSliderMax,
    triggerEffectIntensityValue,
    setTriggerEffectIntensityValue,
    triggerEffectEditingRef,
    triggerTarget,
    setTriggerTarget,
    triggerTestLocked,
    setTriggerTestLocked,
    testTriggersUnavailable,
    triggerStatusLabel,
    triggerStatusTone,
    commitTriggerEffectIntensity,
    setTriggerIntensityPreset,
    runTestAdaptiveTriggers,
    setTriggerTestMode,
    toggleAdaptiveTriggersEnabled,
    syncSnapshot
  };
}

export type AdaptiveTriggersController = ReturnType<typeof useAdaptiveTriggersController>;
