import { useRef, useState } from 'react';
import type { BridgeSnapshot } from '@shared/types';
import type { AppRuntime } from '../../composition/app-runtime';
import {
  CONTROLLER_POWER_SAVING_CAP_PERCENT,
  capControllerPowerSavingValue,
  controllerPowerSavingActiveFromSnapshot,
  isPreservingPowerSavingCap
} from '../../common/controller-power-saving';
import {
  TEST_HAPTICS_LOCK_MS,
  displayClassicRumbleValue,
  displayHapticsValue,
  feedbackSliderMaxFromSnapshot,
  feedbackSliderTicks,
  snapHapticsValue
} from './model';

export interface ControllerFeedbackInput {
  /** Speaker and lightbar writes share the controller output report with a feedback test. */
  readonly speakerVolumeCommitPending: boolean;
  readonly lightbarCommitPending: boolean;
}

/**
 * Haptics and classic rumble strength, feedback boost, and the feedback test.
 * Slider values stay local while the user drags; while power saving is active
 * a capped value never overwrites the saved strength.
 */
export function useControllerFeedbackController(runtime: AppRuntime, input: ControllerFeedbackInput) {
  const { snapshot, connected, pendingAction, setSnapshot, runAction } = runtime;
  const { speakerVolumeCommitPending, lightbarCommitPending } = input;
  const [hapticsValue, setHapticsValue] = useState(100);
  const [classicRumbleValue, setClassicRumbleValue] = useState(100);
  const [showClassicRumbleControl, setShowClassicRumbleControl] = useState(false);
  const [testLocked, setTestLocked] = useState(false);
  const [hapticsCommitPending, setHapticsCommitPending] = useState(false);
  const [classicRumbleCommitPending, setClassicRumbleCommitPending] = useState(false);
  const [classicRumbleV1CommitPending, setClassicRumbleV1CommitPending] = useState(false);
  const [feedbackBoostCommitPending, setFeedbackBoostCommitPending] = useState(false);
  const hapticsEditingRef = useRef(false);
  const classicRumbleEditingRef = useRef(false);

  const hapticsEnabled = Boolean(snapshot?.settings.hapticsEnabled);
  const classicRumbleEnabled = Boolean(snapshot?.settings.classicRumbleEnabled);
  const classicRumbleV1Enabled = Boolean(snapshot?.settings.classicRumbleV1Enabled);
  const activeHapticsFeatureEnabled = showClassicRumbleControl ? classicRumbleEnabled : hapticsEnabled;
  const controllerPowerSavingActive = controllerPowerSavingActiveFromSnapshot(snapshot);
  const feedbackBoostEnabled = Boolean(snapshot?.settings.feedbackBoostEnabled);
  const hapticsSliderMax = feedbackSliderMaxFromSnapshot(snapshot);
  const hapticsSliderTicks = feedbackSliderTicks(hapticsSliderMax);
  const testHapticsUnavailable = !connected
    || !hapticsEnabled
    || pendingAction !== null
    || speakerVolumeCommitPending
    || lightbarCommitPending
    || testLocked
    || Boolean(snapshot?.status?.testHapticsBusy)
    || Boolean(snapshot?.status?.testHapticsCooldown);
  const testRumbleUnavailable = !connected
    || !classicRumbleEnabled
    || pendingAction !== null
    || speakerVolumeCommitPending
    || lightbarCommitPending
    || testLocked
    || Boolean(snapshot?.status?.testHapticsBusy);
  const hapticsStatusReady = connected
    && hapticsEnabled
    && !testLocked
    && !snapshot?.status?.testHapticsBusy
    && !snapshot?.status?.testHapticsCooldown;
  const rumbleStatusReady = connected
    && classicRumbleEnabled
    && !testLocked
    && !snapshot?.status?.testHapticsBusy;
  const hapticsStatusLabel = testLocked || snapshot?.status?.testHapticsBusy
    ? 'Testing'
      : snapshot?.status?.testHapticsCooldown
        ? 'Cooling Down'
      : hapticsStatusReady
        ? 'Ready'
        : 'Unavailable';
  const rumbleStatusLabel = testLocked
    ? 'Testing'
    : rumbleStatusReady
      ? 'Ready'
      : 'Unavailable';
  const hapticsStatusTone = testLocked || snapshot?.status?.testHapticsBusy || hapticsStatusReady
    ? 'good'
    : connected && snapshot?.status?.testHapticsCooldown
      ? 'warn'
      : 'idle';
  const rumbleStatusTone = testLocked || rumbleStatusReady
    ? 'good'
    : 'idle';
  const activeFeedbackTestUnavailable = showClassicRumbleControl ? testRumbleUnavailable : testHapticsUnavailable;
  const activeFeedbackStatusLabel = showClassicRumbleControl ? rumbleStatusLabel : hapticsStatusLabel;
  const activeFeedbackStatusTone = showClassicRumbleControl ? rumbleStatusTone : hapticsStatusTone;

  function syncSnapshot(next: BridgeSnapshot) {
    if (!hapticsEditingRef.current) {
      setHapticsValue(displayHapticsValue(next));
    }
    if (!classicRumbleEditingRef.current) {
      setClassicRumbleValue(displayClassicRumbleValue(next));
    }
  }

  async function commitHapticsValue(value = hapticsValue) {
    const snappedValue = snapHapticsValue(value, hapticsSliderMax);
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !snapshot.settings.hapticsEnabled
      || (controllerPowerSavingActive && snapshot.settings.hapticsGainPercent > CONTROLLER_POWER_SAVING_CAP_PERCENT && snappedValue === CONTROLLER_POWER_SAVING_CAP_PERCENT)
      || snappedValue === snapshot.settings.hapticsGainPercent
      || hapticsCommitPending
    ) {
      hapticsEditingRef.current = false;
      return;
    }

    setHapticsCommitPending(true);
    hapticsEditingRef.current = true;
    try {
      const next = await window.bridge.setHapticsGain(snappedValue);
      setSnapshot(next);
      setHapticsValue(displayHapticsValue(next));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setHapticsValue(displayHapticsValue(next));
    } finally {
      setHapticsCommitPending(false);
      hapticsEditingRef.current = false;
    }
  }

  async function commitClassicRumbleValue(value = classicRumbleValue) {
    const snappedValue = snapHapticsValue(value, hapticsSliderMax);
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !snapshot.settings.classicRumbleEnabled
      || (controllerPowerSavingActive && snapshot.settings.classicRumbleGainPercent > CONTROLLER_POWER_SAVING_CAP_PERCENT && snappedValue === CONTROLLER_POWER_SAVING_CAP_PERCENT)
      || snappedValue === snapshot.settings.classicRumbleGainPercent
      || classicRumbleCommitPending
    ) {
      classicRumbleEditingRef.current = false;
      return;
    }

    setClassicRumbleCommitPending(true);
    classicRumbleEditingRef.current = true;
    try {
      const next = await window.bridge.setClassicRumbleGain(snappedValue);
      setSnapshot(next);
      setClassicRumbleValue(displayClassicRumbleValue(next));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setClassicRumbleValue(displayClassicRumbleValue(next));
    } finally {
      setClassicRumbleCommitPending(false);
      classicRumbleEditingRef.current = false;
    }
  }

  function setHapticsPreset(value: number) {
    const snappedValue = snapHapticsValue(capControllerPowerSavingValue(value, snapshot), hapticsSliderMax);
    hapticsEditingRef.current = true;
    setHapticsValue(snappedValue);
    void commitHapticsValue(snappedValue);
  }

  function setClassicRumblePreset(value: number) {
    const snappedValue = snapHapticsValue(capControllerPowerSavingValue(value, snapshot), hapticsSliderMax);
    classicRumbleEditingRef.current = true;
    setClassicRumbleValue(snappedValue);
    void commitClassicRumbleValue(snappedValue);
  }

  function runFeedbackTest() {
    setTestLocked(true);
    void runAction(showClassicRumbleControl ? 'test-rumble' : 'test', async () => {
      if (snapshot && showClassicRumbleControl) {
        if (
          classicRumbleValue !== snapshot.settings.classicRumbleGainPercent
          && !isPreservingPowerSavingCap(snapshot, snapshot.settings.classicRumbleGainPercent, classicRumbleValue)
        ) {
          await window.bridge.setClassicRumbleGain(classicRumbleValue);
        }
        return window.bridge.testClassicRumble();
      }
      if (
        snapshot
        && hapticsValue !== snapshot.settings.hapticsGainPercent
        && !isPreservingPowerSavingCap(snapshot, snapshot.settings.hapticsGainPercent, hapticsValue)
      ) {
        await window.bridge.setHapticsGain(hapticsValue);
      }
      return window.bridge.testHaptics();
    }).finally(() => {
      window.setTimeout(() => setTestLocked(false), TEST_HAPTICS_LOCK_MS);
    });
  }

  function stopFeedbackTest() {
    setTestLocked(false);
  }

  function toggleHapticsEnabled() {
    if (!snapshot) return;
    void runAction('haptics-enabled', () => window.bridge.setHapticsEnabled(!snapshot.settings.hapticsEnabled));
  }

  function toggleClassicRumbleEnabled() {
    if (!snapshot) return;
    void runAction('classic-rumble-enabled', () => (
      window.bridge.setClassicRumbleEnabled(!snapshot.settings.classicRumbleEnabled)
    ));
  }

  function toggleClassicRumbleV1Enabled() {
    if (!snapshot || classicRumbleV1CommitPending) return;

    setClassicRumbleV1CommitPending(true);
    void (async () => {
      try {
        const next = await window.bridge.setClassicRumbleV1Enabled(!snapshot.settings.classicRumbleV1Enabled);
        setSnapshot(next);
      } catch {
        const next = await window.bridge.getStatus();
        setSnapshot(next);
      } finally {
        setClassicRumbleV1CommitPending(false);
      }
    })();
  }

  function toggleFeedbackBoostEnabled() {
    if (!snapshot || feedbackBoostCommitPending) return;

    setFeedbackBoostCommitPending(true);
    void (async () => {
      try {
        const next = await window.bridge.setFeedbackBoostEnabled(!snapshot.settings.feedbackBoostEnabled);
        setSnapshot(next);
        setHapticsValue(displayHapticsValue(next));
        setClassicRumbleValue(displayClassicRumbleValue(next));
      } catch {
        const next = await window.bridge.getStatus();
        setSnapshot(next);
        setHapticsValue(displayHapticsValue(next));
        setClassicRumbleValue(displayClassicRumbleValue(next));
      } finally {
        setFeedbackBoostCommitPending(false);
      }
    })();
  }

  return {
    hapticsValue,
    setHapticsValue,
    classicRumbleValue,
    setClassicRumbleValue,
    showClassicRumbleControl,
    setShowClassicRumbleControl,
    testLocked,
    hapticsCommitPending,
    classicRumbleV1CommitPending,
    feedbackBoostCommitPending,
    hapticsEditingRef,
    classicRumbleEditingRef,
    classicRumbleV1Enabled,
    activeHapticsFeatureEnabled,
    controllerPowerSavingActive,
    feedbackBoostEnabled,
    hapticsSliderMax,
    hapticsSliderTicks,
    activeFeedbackTestUnavailable,
    activeFeedbackStatusLabel,
    activeFeedbackStatusTone,
    syncSnapshot,
    commitHapticsValue,
    commitClassicRumbleValue,
    setHapticsPreset,
    setClassicRumblePreset,
    runFeedbackTest,
    stopFeedbackTest,
    toggleHapticsEnabled,
    toggleClassicRumbleEnabled,
    toggleClassicRumbleV1Enabled,
    toggleFeedbackBoostEnabled
  };
}

export type ControllerFeedbackController = ReturnType<typeof useControllerFeedbackController>;
