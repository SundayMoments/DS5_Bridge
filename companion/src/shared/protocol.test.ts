import { describe, expect, it } from 'vitest';
import {
  ACK_RESULT,
  AUDIO_DEBUG_EVENT,
  COMMAND_ID,
  DEFAULT_BUTTON_REMAP_PROFILE,
  HOST_AUDIO_COMPACT_FRAME_LENGTH,
  HOST_AUDIO_FAST_FRAME_CHUNK_COUNT,
  HOST_AUDIO_FAST_PAYLOAD_LENGTH,
  HOST_AUDIO_FRAME_CHUNK_COUNT,
  HOST_AUDIO_PACKET_TYPE,
  HOST_AUDIO_PAYLOAD_LENGTH,
  HOST_AUDIO_REPORT_FRAME_LENGTH,
  MAGIC,
  PROTOCOL_MAJOR,
  PROTOCOL_MINOR,
  REPORT_ID,
  buildButtonRemapPayload,
  buildCommandReport,
  buildHostAudioFastFrameReports,
  buildHostAudioFrameChunkReports,
  normalizeBridgePresetId,
  parseAudioDebugReport,
  parseAudioStatsReport,
  parseAckReport,
  parseStatusReport
} from './protocol';

function baseReport(reportId: number): number[] {
  const report = new Array<number>(64).fill(0);
  report[0] = reportId;
  report[1] = MAGIC.charCodeAt(0);
  report[2] = MAGIC.charCodeAt(1);
  report[3] = MAGIC.charCodeAt(2);
  report[4] = MAGIC.charCodeAt(3);
  report[5] = PROTOCOL_MAJOR;
  report[6] = PROTOCOL_MINOR;
  return report;
}

function writeU32(report: number[], offset: number, value: number): void {
  report[offset] = value & 0xff;
  report[offset + 1] = (value >> 8) & 0xff;
  report[offset + 2] = (value >> 16) & 0xff;
  report[offset + 3] = (value >> 24) & 0xff;
}

function writeU16(report: number[], offset: number, value: number): void {
  report[offset] = value & 0xff;
  report[offset + 1] = (value >> 8) & 0xff;
}

describe('companion protocol', () => {
  it('parses a status report', () => {
    const report = baseReport(REPORT_ID.STATUS);
    report[7] = 1;
    report[8] = 2;
    report[9] = 80;
    report[13] = 150;
    report[15] = 1;
    report[16] = 1;
    report[17] = 3;
    report[20] = 0xf8;
    report[21] = 42;
    report[25] = 0;
    report[26] = 5;
    report[27] = 15;
    report[28] = 0xff;
    writeU16(report, 43, 45);
    report[45] = 0xd8;
    report[46] = 1;
    report[47] = 1;
    report[60] = 1;
    report[61] = 0x68;
    report[62] = 0x82;
    report[63] = 1;

    const status = parseStatusReport(report);
    expect(status.controllerConnected).toBe(true);
    expect(status.controllerType).toBe('dualsense-edge');
    expect(status.batteryPercent).toBe(80);
    expect(status.hapticsGainPercent).toBe(150);
    expect(status.settingsRevision).toBe(3);
    expect(status.firmwareFlags.companion).toBe(true);
    expect(status.firmwareFlags.dse).toBe(true);
    expect(status.firmwareFlags.muteButtonActions).toBe(true);
    expect(status.firmwareFlags.hapticsBufferLengthControl).toBe(true);
    expect(status.firmwareFlags.adaptiveTriggersControl).toBe(true);
    expect(status.firmwareFlags.usbSuspendDisconnectControl).toBe(true);
    expect(status.firmwareFlags.sleepControllerControl).toBe(true);
    expect(status.firmwareFlags.pollingRateControl).toBe(true);
    expect(status.usbSuspendDisconnectEnabled).toBe(true);
    expect(status.sleepKeybindEnabled).toBe(true);
    expect(status.testAdaptiveTriggersBusy).toBe(true);
    expect(status.adaptiveTriggerOutputRecent).toBe(true);
    expect(status.idleDisconnectTimeoutMinutes).toBe(45);
    expect(status.signalStrengthDbm).toBe(-40);
    expect(status.muteButtonMode).toBe('keyboard');
    expect(status.muteKeyboardUsage).toBe(0x68);
    expect(status.muteKeyboardModifiers).toBe(0x02);
    expect(status.muteKeyboardBehavior).toBe('hold');
    expect(status.quietModeEnabled).toBe(true);
  });

  it('parses an ACK report', () => {
    const report = baseReport(REPORT_ID.ACK);
    report[7] = COMMAND_ID.TEST_HAPTICS;
    report[8] = 7;
    report[9] = ACK_RESULT.ERR_BUSY;
    report[11] = 9;

    const ack = parseAckReport(report);
    expect(ack.commandId).toBe(COMMAND_ID.TEST_HAPTICS);
    expect(ack.commandSequence).toBe(7);
    expect(ack.resultCode).toBe(ACK_RESULT.ERR_BUSY);
    expect(ack.settingsRevision).toBe(9);
  });

  it('parses an audio debug report', () => {
    const report = baseReport(REPORT_ID.AUDIO_DEBUG);
    report[7] = 1;
    report[8] = 14;
    writeU32(report, 9, 42);
    report[13] = 2;
    writeU32(report, 15, 42);
    writeU32(report, 19, 123456);
    report[23] = AUDIO_DEBUG_EVENT.RESET_GAP;
    report[24] = 1;
    report[25] = 2;
    report[26] = 255;
    report[27] = 9;
    report[28] = 2;

    const debug = parseAudioDebugReport(report);
    expect(debug.latestSequence).toBe(42);
    expect(debug.droppedCount).toBe(2);
    expect(debug.events).toEqual([
      {
        sequence: 42,
        timeUs: 123456,
        eventCode: AUDIO_DEBUG_EVENT.RESET_GAP,
        args: [1, 2, 255, 9, 2]
      }
    ]);
  });

  it('parses an audio stats report', () => {
    const report = baseReport(REPORT_ID.AUDIO_STATS);
    report[7] = 1;
    writeU32(report, 8, 1001);
    writeU32(report, 12, 2);
    writeU32(report, 16, 3333);
    writeU32(report, 20, 4);
    writeU32(report, 24, 5555);
    writeU32(report, 28, 6666);
    writeU32(report, 32, 7);
    writeU32(report, 36, 8);
    writeU32(report, 40, 9);
    writeU32(report, 44, 10);
    writeU32(report, 48, 11);
    writeU32(report, 52, 12);
    writeU32(report, 56, 13);
    writeU32(report, 60, 14);

    const stats = parseAudioStatsReport(report);
    expect(stats).toEqual({
      statsVersion: 1,
      usbAudioGapMaxUs: 1001,
      usbAudioGapOver1500Count: 2,
      opusEncodeMaxUs: 3333,
      opusEncodeOverBudgetCount: 4,
      audio0x36EnqueueToSendMaxUs: 5555,
      audio0x36SendGapMaxUs: 6666,
      audio0x36LateCountOver12000Us: 7,
      audio0x36DropOldestCount: 8,
      audioGenerationDropCount: 9,
      nonAudioReportsBetweenAudioMax: 10,
      btAudioQueueDepthMax: 11,
      audio0x36EnqueuedCount: 12,
      audio0x36SentCount: 13,
      criticalStarvingAudioCount: 14
    });
  });

  it('builds a command report', () => {
    const report = buildCommandReport(COMMAND_ID.SET_HAPTICS_GAIN, 12, 175);
    expect(report).toHaveLength(64);
    expect(report[0]).toBe(REPORT_ID.COMMAND);
    expect(report[7]).toBe(COMMAND_ID.SET_HAPTICS_GAIN);
    expect(report[8]).toBe(12);
    expect(report[9]).toBe(175);
    expect(report[10]).toBe(0);
  });

  it('builds a mute button action command report', () => {
    const report = buildCommandReport(COMMAND_ID.SET_MUTE_BUTTON_ACTION, 4, 1, [0x68, 0x02]);
    expect(report[7]).toBe(COMMAND_ID.SET_MUTE_BUTTON_ACTION);
    expect(report[8]).toBe(4);
    expect(report[9]).toBe(1);
    expect(report[11]).toBe(0x68);
    expect(report[12]).toBe(0x02);
  });

  it('builds a USB suspend disconnect setting command report', () => {
    const report = buildCommandReport(COMMAND_ID.SET_USB_SUSPEND_DISCONNECT_ENABLED, 5, 1);
    expect(report[7]).toBe(COMMAND_ID.SET_USB_SUSPEND_DISCONNECT_ENABLED);
    expect(report[8]).toBe(5);
    expect(report[9]).toBe(1);
  });

  it('builds an idle disconnect timeout command report', () => {
    const report = buildCommandReport(COMMAND_ID.SET_IDLE_DISCONNECT_TIMEOUT, 6, 15);
    expect(report[7]).toBe(COMMAND_ID.SET_IDLE_DISCONNECT_TIMEOUT);
    expect(report[8]).toBe(6);
    expect(report[9]).toBe(15);
  });

  it('builds a button remap command payload', () => {
    const payload = buildButtonRemapPayload({
      ...DEFAULT_BUTTON_REMAP_PROFILE.mappings,
      cross: 'circle',
      lb: 'square'
    });
    const report = buildCommandReport(COMMAND_ID.SET_BUTTON_REMAP, 7, 0, payload);
    expect(payload).toHaveLength(20);
    expect(report[7]).toBe(COMMAND_ID.SET_BUTTON_REMAP);
    expect(report[11 + 13]).toBe(12);
    expect(report[11 + 16]).toBe(14);
  });

  it('builds sleep controller command reports', () => {
    const keybindReport = buildCommandReport(COMMAND_ID.SET_SLEEP_KEYBIND_ENABLED, 6, 1);
    const sleepReport = buildCommandReport(COMMAND_ID.SLEEP_CONTROLLER, 7, 0);
    expect(keybindReport[7]).toBe(COMMAND_ID.SET_SLEEP_KEYBIND_ENABLED);
    expect(keybindReport[9]).toBe(1);
    expect(sleepReport[7]).toBe(COMMAND_ID.SLEEP_CONTROLLER);
    expect(sleepReport[9]).toBe(0);
  });

  it('chunks a synthetic host audio frame for the companion OUT stream', () => {
    const frame = new Array<number>(HOST_AUDIO_REPORT_FRAME_LENGTH).fill(0);
    frame[0] = 0x36;
    frame[76] = 0x92;
    const reports = buildHostAudioFrameChunkReports({
      streamGeneration: 7,
      frameSequence: 33,
      frame
    });

    expect(frame).toHaveLength(HOST_AUDIO_REPORT_FRAME_LENGTH);
    expect(frame[0]).toBe(0x36);
    expect(frame[76]).toBe(0x92);
    expect(reports).toHaveLength(HOST_AUDIO_FRAME_CHUNK_COUNT);
    expect(reports[0][0]).toBe(REPORT_ID.HOST_AUDIO_STREAM);
    expect(reports[0][7]).toBe(HOST_AUDIO_PACKET_TYPE.FRAME_CHUNK);
    expect(reports[0][9]).toBe(7);
    expect(reports[0][11]).toBe(33);
    expect(reports[0][13]).toBe(0);
    expect(reports[0][14]).toBe(HOST_AUDIO_FRAME_CHUNK_COUNT);
    expect(reports[0][15]).toBe(HOST_AUDIO_PAYLOAD_LENGTH);
    expect(reports.at(-1)?.[15]).toBe(HOST_AUDIO_REPORT_FRAME_LENGTH % HOST_AUDIO_PAYLOAD_LENGTH);
  });

  it('chunks compact host audio frames with the fast stream format', () => {
    const frame = new Array<number>(HOST_AUDIO_COMPACT_FRAME_LENGTH).fill(0).map((_, index) => index & 0xff);
    const reports = buildHostAudioFastFrameReports({ frame, frameSequence: 42 });

    expect(reports).toHaveLength(HOST_AUDIO_FAST_FRAME_CHUNK_COUNT);
    expect(reports[0][0]).toBe(REPORT_ID.HOST_AUDIO_STREAM);
    expect(reports[0][1]).toBe(HOST_AUDIO_PACKET_TYPE.FAST_FRAME_FRAGMENT);
    expect(reports[0][2]).toBe(42);
    expect(reports[0][4]).toBe(0);
    expect(reports[0][5]).toBe(HOST_AUDIO_FAST_FRAME_CHUNK_COUNT);
    expect(reports[0][6]).toBe(HOST_AUDIO_FAST_PAYLOAD_LENGTH);
    expect(reports[0][7]).toBe(0);
    expect(reports.at(-1)?.[6]).toBe(HOST_AUDIO_COMPACT_FRAME_LENGTH % HOST_AUDIO_FAST_PAYLOAD_LENGTH);
  });

  it('builds polling rate command reports', () => {
    const report = buildCommandReport(COMMAND_ID.SET_POLLING_RATE_MODE, 8, 1);
    expect(report[7]).toBe(COMMAND_ID.SET_POLLING_RATE_MODE);
    expect(report[9]).toBe(1);
  });

  it('normalizes deleted or unknown bridge presets to a fallback', () => {
    expect(normalizeBridgePresetId('quiet')).toBe('quiet');
    expect(normalizeBridgePresetId('ptt-f24')).toBe('balanced');
    expect(normalizeBridgePresetId('retired-profile', 'custom')).toBe('custom');
  });
});
