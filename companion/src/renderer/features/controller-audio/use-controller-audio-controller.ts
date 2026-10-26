import { useEffect, useRef, useState } from 'react';
import { IconHeadphones as Headphones, IconVolume as Volume2 } from '@tabler/icons-react';
import type { BridgeSnapshot } from '@shared/types';
import type { AppRuntime } from '../../composition/app-runtime';
import { delay, findBridgeAudioOutputId, playMicLiveListen, stopMicLiveListen } from './audio-playback';
import {
  BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE,
  BRIDGE_MIC_ENDPOINT_UNAVAILABLE,
  TEST_MIC_LISTEN_MS,
  TEST_SPEAKER_ENDPOINT_REFRESH_MS,
  TEST_SPEAKER_LOCK_MS,
  TEST_SPEAKER_VOLUME_SETTLE_MS,
  clampAudioBufferLength,
  snapMicVolume,
  snapSpeakerVolume
} from './model';

export interface ControllerAudioControllerInput {
  /** Speaker and mic tests wait for a light bar change to land. */
  readonly lightbarCommitPending: boolean;
}

/**
 * Controller speaker and headphones, the duplex microphone, the audio buffer,
 * and the speaker and mic tests. Tests play through the bridge's Windows
 * audio endpoints.
 */
export function useControllerAudioController(runtime: AppRuntime, { lightbarCommitPending }: ControllerAudioControllerInput) {
  const { snapshot, connected, pendingAction, setSnapshot, setPendingAction, runAction, runQuietAction } = runtime;
  const personaTransitionActive = Boolean(snapshot?.personaTransition);
  const speakerVolumeSupported = Boolean(snapshot?.status?.firmwareFlags.speakerVolumeControl);
  const audioBufferLengthControlSupported = Boolean(snapshot?.status?.firmwareFlags.hapticsBufferLengthControl);
  const audioStatus = snapshot?.diagnostics.audioStatus;
  const headsetOutputDetected = Boolean(audioStatus?.headsetPlugged);
  const [speakerVolumeValue, setSpeakerVolumeValue] = useState(100);
  const [micVolumeValue, setMicVolumeValue] = useState(100);
  const [audioBufferLengthValue, setAudioBufferLengthValue] = useState(64);

  const [showMicrophoneControl, setShowMicrophoneControl] = useState(false);

  const [speakerTestLocked, setSpeakerTestLocked] = useState(false);
  const [speakerOutputAvailable, setSpeakerOutputAvailable] = useState<boolean | null>(null);
  const [speakerTestError, setSpeakerTestError] = useState<string | null>(null);
  const [micTestLocked, setMicTestLocked] = useState(false);
  const [micTestError, setMicTestError] = useState<string | null>(null);

  const [speakerVolumeCommitPending, setSpeakerVolumeCommitPending] = useState(false);
  const [micVolumeCommitPending, setMicVolumeCommitPending] = useState(false);
  const [audioBufferLengthCommitPending, setAudioBufferLengthCommitPending] = useState(false);

  const speakerVolumeEditingRef = useRef(false);
  const micVolumeEditingRef = useRef(false);
  const audioBufferLengthEditingRef = useRef(false);

  useEffect(() => {
    setSpeakerOutputAvailable(true);
  }, []);

  useEffect(() => {
    if (!connected) {
      setSpeakerTestError(null);
    }
  }, [connected]);

  const speakerEnabled = Boolean(snapshot?.settings.speakerEnabled);
  const speakerGainLevel = Math.max(1, Math.min(7, Math.round(
    snapshot?.settings.speakerGainLevel ?? snapshot?.status?.speakerGainLevel ?? 4
  )));

  const gameStreamActive = Boolean(snapshot?.status?.hostOutputRecent);

  const OutputIcon = headsetOutputDetected ? Headphones : Volume2;

  const outputControlLabel = headsetOutputDetected ? 'Headphones' : 'Speaker';
  const outputControlLower = headsetOutputDetected ? 'headphones' : 'speaker';
  const outputPresetLower = headsetOutputDetected ? 'headphones' : 'speaker';
  const duplexMicEnabled = Boolean(snapshot?.settings.duplexMicEnabled);
  const audioEnabled = speakerEnabled || duplexMicEnabled;
  const audioPathLabel = personaTransitionActive
    ? 'Switching Mode'
    : !connected
    ? 'Unavailable'
    : 'Pico Local';
  const audioPathTooltip = personaTransitionActive
    ? 'Waiting for the controller to re-enumerate.'
    : audioPathLabel;
  const audioPathTone = connected && !personaTransitionActive ? 'good' : 'idle';
  const audioBufferLengthControlDisabled = !connected
    || !audioBufferLengthControlSupported
    || pendingAction !== null
    || audioBufferLengthCommitPending;

  const duplexMicLabel = audioStatus?.duplexActive
    ? 'Duplex Active'
    : duplexMicEnabled
      ? 'Mic Standby'
      : 'Off';
  const speakerOutputMissing = false;

  const testSpeakerUnavailable = !connected
    || !speakerVolumeSupported
    || !speakerEnabled
    || pendingAction !== null
    || speakerVolumeCommitPending
    || lightbarCommitPending
    || speakerTestLocked
    || gameStreamActive
    || Boolean(snapshot?.status?.testHapticsBusy);
  const testMicUnavailable = !connected
    || !duplexMicEnabled
    || pendingAction !== null
    || micVolumeCommitPending
    || lightbarCommitPending
    || micTestLocked
    || gameStreamActive;
  const speakerStatusReady = connected
    && speakerVolumeSupported
    && speakerEnabled
    && !speakerTestLocked
    && !speakerOutputMissing
    && !gameStreamActive
    && !snapshot?.status?.testHapticsBusy;
  const micStatusReady = connected
    && duplexMicEnabled
    && !micTestLocked
    && !gameStreamActive;
  const speakerStatusLabel = speakerTestLocked
    ? 'Playing'
    : connected && speakerTestError
      ? speakerTestError
    : connected && speakerOutputMissing
        ? BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE
        : speakerStatusReady
          ? 'Ready'
          : connected && gameStreamActive
            ? 'Game Audio Active'
            : 'Unavailable';
  const speakerStatusTone = speakerTestLocked || speakerStatusReady
    ? 'good'
    : connected && (speakerTestError || speakerOutputMissing)
        ? 'bad'
      : connected && gameStreamActive
        ? 'warn'
        : 'idle';
  const micTestStatusLabel = micTestLocked
    ? 'Listening'
    : connected && micTestError
      ? micTestError
      : micStatusReady
        ? 'Ready'
        : 'Unavailable';
  const micTestStatusTone = micTestLocked || micStatusReady
    ? 'good'
    : connected && micTestError
      ? 'bad'
      : 'idle';
  const activeAudioTestUnavailable = showMicrophoneControl ? testMicUnavailable : testSpeakerUnavailable;
  const activeAudioTestLocked = showMicrophoneControl ? micTestLocked : speakerTestLocked;
  const activeAudioTestStatusLabel = showMicrophoneControl ? micTestStatusLabel : speakerStatusLabel;
  const activeAudioTestStatusTone = showMicrophoneControl ? micTestStatusTone : speakerStatusTone;

  useEffect(() => {
    if (!connected || speakerOutputAvailable !== false || speakerTestLocked) {
      return undefined;
    }

    const refresh = () => {
      void findBridgeAudioOutputId(2).then((sinkId) => {
        if (!sinkId) {
          return;
        }
        setSpeakerOutputAvailable(true);
        setSpeakerTestError(null);
      });
    };

    const handle = window.setInterval(refresh, TEST_SPEAKER_ENDPOINT_REFRESH_MS);
    return () => window.clearInterval(handle);
  }, [connected, speakerOutputAvailable, speakerTestLocked]);

  useEffect(() => () => {
    stopMicLiveListen();
  }, []);

  useEffect(() => {
    if ((!connected || !showMicrophoneControl) && micTestLocked) {
      stopMicLiveListen();
    }
  }, [connected, showMicrophoneControl, micTestLocked]);

  async function commitSpeakerVolume(value = speakerVolumeValue) {
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !speakerVolumeSupported
      || !snapshot.settings.speakerEnabled
      || value === snapshot.settings.speakerVolumePercent
      || speakerVolumeCommitPending
    ) {
      speakerVolumeEditingRef.current = false;
      return;
    }

    setSpeakerVolumeCommitPending(true);
    speakerVolumeEditingRef.current = true;
    try {
      const next = await window.bridge.setSpeakerVolume(value);
      setSnapshot(next);
      setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
      await delay(TEST_SPEAKER_VOLUME_SETTLE_MS);
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
    } finally {
      setSpeakerVolumeCommitPending(false);
      speakerVolumeEditingRef.current = false;
    }
  }

  function setSpeakerPreset(value: number) {
    const snappedValue = snapSpeakerVolume(value);
    speakerVolumeEditingRef.current = true;
    setSpeakerVolumeValue(snappedValue);
    void commitSpeakerVolume(snappedValue);
  }

  function setSpeakerGainLevel(level: number) {
    if (!snapshot) {
      return;
    }
    const value = Math.max(1, Math.min(7, Math.round(level)));
    if (value === snapshot.settings.speakerGainLevel) {
      return;
    }
    void runQuietAction(() => window.bridge.setSpeakerGainLevel(value));
  }

  async function commitMicVolume(value = micVolumeValue) {
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || value === snapshot.settings.micVolumePercent
      || micVolumeCommitPending
    ) {
      micVolumeEditingRef.current = false;
      return;
    }

    setMicVolumeCommitPending(true);
    micVolumeEditingRef.current = true;
    try {
      const next = await window.bridge.setMicVolume(value);
      setSnapshot(next);
      setMicVolumeValue(snapMicVolume(next.settings.micVolumePercent));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setMicVolumeValue(snapMicVolume(next.settings.micVolumePercent));
    } finally {
      setMicVolumeCommitPending(false);
      micVolumeEditingRef.current = false;
    }
  }

  function setMicPreset(value: number) {
    const snappedValue = snapMicVolume(value);
    micVolumeEditingRef.current = true;
    setMicVolumeValue(snappedValue);
    void commitMicVolume(snappedValue);
  }

  async function commitAudioBufferLength(value = audioBufferLengthValue) {
    const snappedValue = clampAudioBufferLength(value);
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !audioBufferLengthControlSupported
      || snappedValue === snapshot.settings.hapticsBufferLength
      || audioBufferLengthCommitPending
    ) {
      audioBufferLengthEditingRef.current = false;
      setAudioBufferLengthValue(snappedValue);
      return;
    }

    setAudioBufferLengthCommitPending(true);
    audioBufferLengthEditingRef.current = true;
    try {
      const next = await window.bridge.setHapticsBufferLength(snappedValue);
      setSnapshot(next);
      setAudioBufferLengthValue(clampAudioBufferLength(next.settings.hapticsBufferLength));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setAudioBufferLengthValue(clampAudioBufferLength(next.settings.hapticsBufferLength));
    } finally {
      setAudioBufferLengthCommitPending(false);
      audioBufferLengthEditingRef.current = false;
    }
  }

  function runTestSpeaker() {
    setSpeakerTestLocked(true);
    setPendingAction('speaker');
    setSpeakerTestError(null);
    void (async () => {
      try {
        let volumeChanged = false;
        if (snapshot && speakerVolumeSupported && speakerVolumeValue !== snapshot.settings.speakerVolumePercent) {
          speakerVolumeEditingRef.current = true;
          const next = await window.bridge.setSpeakerVolume(speakerVolumeValue);
          setSnapshot(next);
          setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
          speakerVolumeEditingRef.current = false;
          volumeChanged = true;
        }
        if (volumeChanged) {
          await delay(TEST_SPEAKER_VOLUME_SETTLE_MS);
        }
        const next = await window.bridge.testSpeaker();
        setSnapshot(next);
        setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
        setSpeakerOutputAvailable(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE;
        setSpeakerTestError(message);
        setSpeakerOutputAvailable(true);
        const next = await window.bridge.getStatus();
        setSnapshot(next);
        setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
        speakerVolumeEditingRef.current = false;
      } finally {
        speakerVolumeEditingRef.current = false;
        setPendingAction(null);
        window.setTimeout(() => setSpeakerTestLocked(false), TEST_SPEAKER_LOCK_MS);
      }
    })();
  }

  function runTestMic() {
    setMicTestLocked(true);
    setPendingAction('mic-test');
    setMicTestError(null);
    void (async () => {
      try {
        if (snapshot && micVolumeValue !== snapshot.settings.micVolumePercent) {
          micVolumeEditingRef.current = true;
          const next = await window.bridge.setMicVolume(micVolumeValue);
          setSnapshot(next);
          setMicVolumeValue(snapMicVolume(next.settings.micVolumePercent));
          micVolumeEditingRef.current = false;
        }
        await playMicLiveListen(TEST_MIC_LISTEN_MS);
      } catch (error) {
        const message = error instanceof Error ? error.message : BRIDGE_MIC_ENDPOINT_UNAVAILABLE;
        setMicTestError(message);
        const next = await window.bridge.getStatus();
        setSnapshot(next);
        setMicVolumeValue(snapMicVolume(next.settings.micVolumePercent));
      } finally {
        micVolumeEditingRef.current = false;
        setPendingAction(null);
        setMicTestLocked(false);
      }
    })();
  }

  function toggleSpeakerEnabled() {
    if (!snapshot) return;
    void runAction('speaker-enabled', () => window.bridge.setSpeakerEnabled(!snapshot.settings.speakerEnabled));
  }

  function toggleAudioEnabled() {
    if (!snapshot) return;
    const enabled = !(snapshot.settings.speakerEnabled || snapshot.settings.duplexMicEnabled);
    void runAction('audio-enabled', async () => {
      let next = snapshot;
      if (next.settings.speakerEnabled !== enabled) {
        next = await window.bridge.setSpeakerEnabled(enabled);
      }
      if (!enabled && next.settings.duplexMicEnabled) {
        next = await window.bridge.setDuplexMicEnabled(false);
      }
      return next;
    });
  }

  function toggleDuplexMicEnabled() {
    if (!snapshot) return;
    void runAction('duplex-mic-enabled', () => (
      window.bridge.setDuplexMicEnabled(!snapshot.settings.duplexMicEnabled)
    ));
  }

  function toggleMicMute() {
    if (!snapshot) return;
    void runAction('mic-mute', () => window.bridge.setMicMute(!snapshot.settings.micMuted));
  }

  function syncSnapshot(next: BridgeSnapshot) {
    if (!speakerVolumeEditingRef.current) {
      setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
    }
    if (!micVolumeEditingRef.current) {
      setMicVolumeValue(snapMicVolume(next.settings.micVolumePercent));
    }
    if (!audioBufferLengthEditingRef.current) {
      setAudioBufferLengthValue(clampAudioBufferLength(next.settings.hapticsBufferLength));
    }
  }

  return {
    personaTransitionActive,
    speakerVolumeSupported,
    audioBufferLengthControlSupported,
    audioStatus,
    headsetOutputDetected,
    speakerVolumeValue,
    setSpeakerVolumeValue,
    micVolumeValue,
    setMicVolumeValue,
    audioBufferLengthValue,
    setAudioBufferLengthValue,
    showMicrophoneControl,
    setShowMicrophoneControl,
    speakerTestLocked,
    setSpeakerTestLocked,
    speakerOutputAvailable,
    setSpeakerOutputAvailable,
    speakerTestError,
    setSpeakerTestError,
    micTestLocked,
    setMicTestLocked,
    micTestError,
    setMicTestError,
    speakerVolumeCommitPending,
    setSpeakerVolumeCommitPending,
    micVolumeCommitPending,
    setMicVolumeCommitPending,
    audioBufferLengthCommitPending,
    setAudioBufferLengthCommitPending,
    speakerVolumeEditingRef,
    micVolumeEditingRef,
    audioBufferLengthEditingRef,
    speakerEnabled,
    speakerGainLevel,
    gameStreamActive,
    OutputIcon,
    outputControlLabel,
    outputControlLower,
    outputPresetLower,
    duplexMicEnabled,
    audioEnabled,
    audioPathLabel,
    audioPathTooltip,
    audioPathTone,
    audioBufferLengthControlDisabled,
    duplexMicLabel,
    speakerOutputMissing,
    testSpeakerUnavailable,
    testMicUnavailable,
    speakerStatusReady,
    micStatusReady,
    speakerStatusLabel,
    speakerStatusTone,
    micTestStatusLabel,
    micTestStatusTone,
    activeAudioTestUnavailable,
    activeAudioTestLocked,
    activeAudioTestStatusLabel,
    activeAudioTestStatusTone,
    commitSpeakerVolume,
    setSpeakerPreset,
    setSpeakerGainLevel,
    commitMicVolume,
    setMicPreset,
    commitAudioBufferLength,
    runTestSpeaker,
    runTestMic,
    toggleSpeakerEnabled,
    toggleAudioEnabled,
    toggleDuplexMicEnabled,
    toggleMicMute,
    syncSnapshot
  };
}

export type ControllerAudioController = ReturnType<typeof useControllerAudioController>;
