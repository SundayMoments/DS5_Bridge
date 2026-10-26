import type { BridgeSnapshot } from '@shared/types';
import { hexByte } from './model';

/** The audio debug block on the Diagnostics card, one `key=value` per line for copying. */
export function audioDebugReport(snapshot: BridgeSnapshot | null | undefined): string {
  if (!snapshot) {
    return 'state=starting';
  }
  if (!snapshot.status) {
    return `state=${snapshot.state}\nmessage=${snapshot.message}`;
  }

  const debug = snapshot.status.audioDebug;
  const stats = snapshot.diagnostics.audioDebugStats;
  const audio = snapshot.diagnostics.audioStatus;
  const lines = [
    `state=${snapshot.state}`,
    `firmware=${snapshot.status.firmwareVersion}`,
    `triggerEffectIntensity=${snapshot.settings.triggerEffectIntensityPercent}%`,
    `classicRumble=${snapshot.settings.classicRumbleEnabled ? snapshot.settings.classicRumbleGainPercent : 0}%`,
    `appSpeakerSlider=${snapshot.settings.speakerVolumePercent}%`,
    `firmwareSpeakerGate=${snapshot.status.speakerVolumePercent}%`,
    `audioRecent=${snapshot.status.audioRecent ? 'true' : 'false'}`,
    `hostOutputRecent=${snapshot.status.hostOutputRecent ? 'true' : 'false'}`,
    `usbHostSpeakerVolume=${debug.usbHostSpeakerVolumePercent}%`,
    `usbHostSpeakerMute=${debug.usbHostSpeakerMute ? 'true' : 'false'}`,
    `usbHostMicVolume=${debug.usbHostMicVolumePercent}%`,
    `usbHostMicMute=${debug.usbHostMicMute ? 'true' : 'false'}`,
    `audioRepairCount=${debug.lastHostOutputCount}`,
    `lastAudioRepairReportId=0x${hexByte(debug.lastHostOutputReportId)}`,
    `lastAudioRepairLength=${debug.lastHostOutputLength}`
  ];
  if (audio) {
    lines.push(
      'audioPath=pico-local',
      `controllerStateReady=${audio.controllerStateReady ? 'true' : 'false'}`,
      `headsetPlugged=${audio.headsetPlugged ? 'true' : 'false'}`,
      `headsetAudioRoute=${audio.headsetAudioRoute ? 'true' : 'false'}`,
      `duplexRequested=${audio.duplexRequested ? 'true' : 'false'}`,
      `duplexActive=${audio.duplexActive ? 'true' : 'false'}`,
      `micPacketsReceived=${audio.micPacketsReceived}`,
      `micPacketsDropped=${audio.micPacketsDropped}`,
      `micDecodeSuccess=${audio.micDecodeSuccess}`,
      `micDecodeFail=${audio.micDecodeFail}`,
      `micUsbWriteSuccess=${audio.micUsbWriteSuccess}`,
      `micUsbWriteShort=${audio.micUsbWriteShort}`,
      `micUsbConcealCount=${audio.micUsbConcealCount}`,
      `micPlcCount=${audio.micPlcCount}`,
      `micLastDecodedSamples=${audio.micLastDecodedSamples}`,
      `micLastWrittenBytes=${audio.micLastWrittenBytes}`,
      `micPeakPermille=${audio.micPeakPermille}`,
      `micUsbStreaming=${audio.micUsbStreaming ? 'true' : 'false'}`
    );
  }
  if (stats) {
    lines.push(
      `usbAudioGapMaxUs=${stats.usbAudioGapMaxUs}`,
      `usbAudioGapOver1500Count=${stats.usbAudioGapOver1500Count}`,
      `opusEncodeMaxUs=${stats.opusEncodeMaxUs}`,
      `opusEncodeOverBudgetCount=${stats.opusEncodeOverBudgetCount}`,
      `audio0x36EnqueueToSendMaxUs=${stats.audio0x36EnqueueToSendMaxUs}`,
      `audio0x36SendGapMaxUs=${stats.audio0x36SendGapMaxUs}`,
      `audio0x36LateCountOver12000Us=${stats.audio0x36LateCountOver12000Us}`,
      `audio0x36DropOldestCount=${stats.audio0x36DropOldestCount}`,
      `audioGenerationDropCount=${stats.audioGenerationDropCount}`,
      `nonAudioReportsBetweenAudioMax=${stats.nonAudioReportsBetweenAudioMax}`,
      `btAudioQueueDepthMax=${stats.btAudioQueueDepthMax}`,
      `audio0x36EnqueuedCount=${stats.audio0x36EnqueuedCount}`,
      `audio0x36SentCount=${stats.audio0x36SentCount}`,
      `criticalStarvingAudioCount=${stats.criticalStarvingAudioCount}`
    );
  }
  return lines.join('\n');
}

/** What firmware UART log capture is doing. */
export function firmwareLogStatus(snapshot: BridgeSnapshot | null | undefined): string {
  return snapshot?.diagnostics.firmwareLogLastError
    ? `Write failed: ${snapshot.diagnostics.firmwareLogLastError}`
    : !snapshot?.diagnostics.firmwareLogDirectory
      ? 'Choose a folder to start capture.'
      : snapshot.diagnostics.firmwareLogEnabled === false
        ? 'Unavailable: firmware was not compiled with UART logging.'
        : snapshot.diagnostics.firmwareLogEnabled === null
          ? 'Waiting for UART-enabled firmware.'
          : snapshot.diagnostics.firmwareLogPath
            ? 'Capturing retained firmware logs.'
            : 'Starting capture.';
}
