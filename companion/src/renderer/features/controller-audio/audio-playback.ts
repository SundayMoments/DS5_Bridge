// Plays the speaker test tone and the live microphone monitor through the
// bridge's Windows audio endpoints, found by matching device labels.
import testSpeakerToneUrl from '../../assets/test-speaker-tone-silence-tail.mp3';
import {
  bridgeAudioInputLabelScore,
  bridgeAudioOutputLabelScore,
  isBridgeAudioDeviceLabel
} from './audio-endpoint-matching';
import {
  BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE,
  BRIDGE_MIC_ENDPOINT_UNAVAILABLE,
  TEST_SPEAKER_ENDPOINT_ATTEMPTS,
  TEST_SPEAKER_ENDPOINT_RETRY_MS,
  TEST_SPEAKER_ENDPOINT_VERIFY_MS,
  TEST_SPEAKER_PREROLL_MS
} from './model';

type SinkSelectableAudio = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
  sinkId?: string;
};

export function bridgeAudioOutputScore(device: MediaDeviceInfo): number {
  return bridgeAudioOutputLabelScore(device.label);
}

export function bridgeAudioInputScore(device: MediaDeviceInfo): number {
  return bridgeAudioInputLabelScore(device.label);
}

export async function findBridgeAudioOutputIdOnce(): Promise<string | null> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return null;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((device) => (
      device.kind === 'audiooutput'
      && isBridgeAudioDeviceLabel(device.label)
      && device.deviceId
      && device.deviceId !== 'default'
      && device.deviceId !== 'communications'
    ));
    outputs.sort((left, right) => bridgeAudioOutputScore(right) - bridgeAudioOutputScore(left));
    const output = outputs[0];
    return output?.deviceId ?? null;
  } catch {
    return null;
  }
}

export async function findBridgeAudioInputIdOnce(): Promise<string | null> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return null;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((device) => (
      device.kind === 'audioinput'
      && isBridgeAudioDeviceLabel(device.label)
      && device.deviceId
      && device.deviceId !== 'default'
      && device.deviceId !== 'communications'
    ));
    inputs.sort((left, right) => bridgeAudioInputScore(right) - bridgeAudioInputScore(left));
    const input = inputs[0];
    return input?.deviceId ?? null;
  } catch {
    return null;
  }
}

export async function unlockMediaDeviceLabels(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return false;
  }

  let permissionStream: MediaStream | null = null;
  try {
    permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return true;
  } catch {
    return false;
  } finally {
    permissionStream?.getTracks().forEach((track) => track.stop());
  }
}

export async function findBridgeAudioInputId(): Promise<string | null> {
  let inputId = await findBridgeAudioInputIdOnce();
  if (inputId || !navigator.mediaDevices?.getUserMedia) {
    return inputId;
  }

  if (!await unlockMediaDeviceLabels()) {
    return null;
  }

  inputId = await findBridgeAudioInputIdOnce();
  return inputId;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

let speakerPrerollSilenceUrl: string | null = null;

export function getSpeakerPrerollSilenceUrl(): string {
  if (speakerPrerollSilenceUrl) {
    return speakerPrerollSilenceUrl;
  }

  const sampleRate = 48000;
  const channels = 2;
  const bytesPerSample = 2;
  const frames = Math.round((sampleRate * TEST_SPEAKER_PREROLL_MS) / 1000);
  const dataSize = frames * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  speakerPrerollSilenceUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  return speakerPrerollSilenceUrl;
}

export async function findBridgeAudioOutputId(attempts = 1): Promise<string | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const sinkId = await findBridgeAudioOutputIdOnce();
    if (sinkId) {
      return sinkId;
    }
    if (attempt + 1 < attempts) {
      await delay(TEST_SPEAKER_ENDPOINT_RETRY_MS);
    }
  }
  if (await unlockMediaDeviceLabels()) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const sinkId = await findBridgeAudioOutputIdOnce();
      if (sinkId) {
        return sinkId;
      }
      if (attempt + 1 < attempts) {
        await delay(TEST_SPEAKER_ENDPOINT_RETRY_MS);
      }
    }
  }
  return null;
}

let speakerToneAudio: SinkSelectableAudio | null = null;
let speakerToneSinkId: string | null = null;

export function resetSpeakerToneAudio(): void {
  if (speakerToneAudio) {
    try {
      speakerToneAudio.pause();
      speakerToneAudio.removeAttribute('src');
      speakerToneAudio.load();
    } catch {
      // Ignore teardown races while Windows is removing the audio endpoint.
    }
  }
  speakerToneAudio = null;
  speakerToneSinkId = null;
}

export async function playSpeakerAudioSource(sourceUrl: string): Promise<void> {
  const sinkId = await findBridgeAudioOutputId(TEST_SPEAKER_ENDPOINT_ATTEMPTS);
  if (!sinkId) {
    throw new Error(BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE);
  }

  // Reuse the persistent Audio element if the endpoint hasn't changed.
  // This keeps the WASAPI session alive so the firmware audio pipeline stays warm.
  if (!speakerToneAudio || speakerToneSinkId !== sinkId) {
    const audio = new Audio() as SinkSelectableAudio;
    audio.volume = 1;
    if (!audio.setSinkId) {
      throw new Error(BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE);
    }
    try {
      await audio.setSinkId(sinkId);
    } catch {
      throw new Error(BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE);
    }
    if (audio.sinkId !== undefined && audio.sinkId !== sinkId) {
      throw new Error(BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE);
    }
    speakerToneAudio = audio;
    speakerToneSinkId = sinkId;
  }

  const audio = speakerToneAudio;
  audio.src = sourceUrl;
  audio.currentTime = 0;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const mediaDevices = navigator.mediaDevices;
    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };
    const verifySink = () => {
      void (async () => {
        const currentSinkId = await findBridgeAudioOutputIdOnce();
        if (
          currentSinkId !== sinkId
          || (audio.sinkId !== undefined && audio.sinkId !== sinkId)
        ) {
          resetSpeakerToneAudio();
          fail(new Error(BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE));
        }
      })();
    };
    const verifyTimer = window.setInterval(verifySink, TEST_SPEAKER_ENDPOINT_VERIFY_MS);
    function cleanup() {
      window.clearInterval(verifyTimer);
      audio.removeEventListener('ended', finish);
      audio.removeEventListener('error', onAudioError);
      mediaDevices?.removeEventListener?.('devicechange', verifySink);
    }
    function onAudioError() {
      fail(new Error('Speaker test audio playback failed.'));
    }

    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', onAudioError, { once: true });
    mediaDevices?.addEventListener?.('devicechange', verifySink);
    audio.play().then(verifySink).catch((error: unknown) => {
      fail(error instanceof Error ? error : new Error('Speaker test audio playback failed.'));
    });
  });
}

export async function playSpeakerToneFile(): Promise<void> {
  await playSpeakerAudioSource(getSpeakerPrerollSilenceUrl());
  await delay(25);
  await playSpeakerAudioSource(testSpeakerToneUrl);
}

let micListenAudio: HTMLAudioElement | null = null;
let micListenStream: MediaStream | null = null;
let micListenTimer: number | null = null;
let micListenResolve: (() => void) | null = null;

export function stopMicLiveListen(): void {
  if (micListenTimer !== null) {
    window.clearTimeout(micListenTimer);
  }
  micListenTimer = null;
  if (micListenAudio) {
    try {
      micListenAudio.pause();
      micListenAudio.srcObject = null;
    } catch {
      // Ignore teardown races while the mic endpoint is closing.
    }
  }
  micListenAudio = null;
  micListenStream?.getTracks().forEach((track) => track.stop());
  micListenStream = null;
  const resolve = micListenResolve;
  micListenResolve = null;
  resolve?.();
}

export async function openBridgeMicStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(BRIDGE_MIC_ENDPOINT_UNAVAILABLE);
  }

  const inputId = await findBridgeAudioInputId();
  if (!inputId) {
    throw new Error(BRIDGE_MIC_ENDPOINT_UNAVAILABLE);
  }

  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: inputId },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    },
    video: false
  });
}

export async function playMicLiveListen(durationMs: number): Promise<void> {
  stopMicLiveListen();
  const stream = await openBridgeMicStream();
  const audio = new Audio();
  audio.srcObject = stream;
  audio.volume = 1;
  micListenAudio = audio;
  micListenStream = stream;

  try {
    await audio.play();
  } catch (error) {
    stopMicLiveListen();
    throw error;
  }

  await new Promise<void>((resolve) => {
    micListenResolve = resolve;
    micListenTimer = window.setTimeout(stopMicLiveListen, durationMs);
  });
}
