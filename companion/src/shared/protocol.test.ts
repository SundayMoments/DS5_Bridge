import { describe, expect, it } from 'vitest';
import {
  ACK_RESULT,
  AUDIO_DEBUG_EVENT,
  CHORD_MUTE_STARTER_ID,
  COMMAND_ID,
  DEFAULT_BUTTON_REMAP_PROFILE,
  MAGIC,
  MUTE_KEYBOARD_CHORD_STARTER_FLAG,
  MUTE_KEYBOARD_HOLD_FLAG,
  PROTOCOL_MAJOR,
  PROTOCOL_MINOR,
  ProtocolError,
  REMAP_BUTTON_IDS,
  REPORT_ID,
  buildButtonRemapPayload,
  buildChordBindingsPayload,
  buildCommandReport,
  hostPersonaModeValue,
  isChordBindingAllowed,
  normalizeBridgePresetId,
  parseAudioDebugReport,
  parseAudioStatusReport,
  parseAudioStatsReport,
  parseAckReport,
  parseFeedbackTraceReport,
  parseTriggerTraceReport,
  parseStatusReport,
  remapButtonIdValue
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
  it('rejects malformed report envelopes with protocol-specific errors', () => {
    const cases: Array<{
      name: string;
      report: number[];
      parse: (report: number[]) => unknown;
      code: string;
    }> = [
      {
        name: 'bad length',
        report: baseReport(REPORT_ID.STATUS).slice(0, 63),
        parse: parseStatusReport,
        code: 'bad-length'
      },
      {
        name: 'bad report id',
        report: baseReport(REPORT_ID.ACK),
        parse: parseStatusReport,
        code: 'bad-report-id'
      },
      {
        name: 'bad magic',
        report: (() => {
          const report = baseReport(REPORT_ID.STATUS);
          report[1] = 'N'.charCodeAt(0);
          return report;
        })(),
        parse: parseStatusReport,
        code: 'bad-magic'
      },
      {
        name: 'bad version',
        report: (() => {
          const report = baseReport(REPORT_ID.STATUS);
          report[5] = PROTOCOL_MAJOR + 1;
          return report;
        })(),
        parse: parseStatusReport,
        code: 'bad-version'
      }
    ];

    for (const testCase of cases) {
      try {
        testCase.parse(testCase.report);
        throw new Error(`Expected ${testCase.name} to throw`);
      } catch (error) {
        expect(error).toBeInstanceOf(ProtocolError);
        expect((error as ProtocolError).code).toBe(testCase.code);
      }
    }
  });

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
    report[48] = 2;
    report[49] = 0x07;
    report[51] = 1;
    report[57] = 6;
    report[60] = 1;
    report[61] = 0x68;
    report[62] = MUTE_KEYBOARD_HOLD_FLAG | MUTE_KEYBOARD_CHORD_STARTER_FLAG | 0x02;
    report[63] = 1;

    const status = parseStatusReport(report);
    expect(status.controllerConnected).toBe(true);
    expect(status.controllerType).toBe('dualsense-edge');
    expect(status.batteryPercent).toBe(80);
    expect(status.hapticsGainPercent).toBe(150);
    expect(status.speakerGainLevel).toBe(6);
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
    expect(status.micMuted).toBe(true);
    expect(status.idleDisconnectTimeoutMinutes).toBe(45);
    expect(status.signalStrengthDbm).toBe(-40);
    expect(status.muteButtonMode).toBe('keyboard');
    expect(status.muteKeyboardUsage).toBe(0x68);
    expect(status.muteKeyboardModifiers).toBe(0x02);
    expect(status.muteKeyboardBehavior).toBe('hold');
    expect(status.muteKeyboardChordStarterEnabled).toBe(true);
    expect(status.quietModeEnabled).toBe(true);
    expect(status.firmwareFlags.hostPersonaControl).toBe(true);
    expect(status.hostPersonaMode).toBe('ds4');
    expect(status.supportedHostPersonaModes).toEqual(['dualsense', 'xbox', 'ds4']);
  });

  it('parses chord mute button mode', () => {
    const report = baseReport(REPORT_ID.STATUS);
    report[60] = 3;

    const status = parseStatusReport(report);
    expect(status.muteButtonMode).toBe('chord');
  });

  it('encodes host persona command values', () => {
    expect(hostPersonaModeValue('dualsense')).toBe(0);
    expect(hostPersonaModeValue('xbox')).toBe(1);
    expect(hostPersonaModeValue('ds4')).toBe(2);
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

  it('can parse an older ACK report when protocol mismatch is explicitly allowed', () => {
    const report = baseReport(REPORT_ID.ACK);
    report[6] = PROTOCOL_MINOR - 1;
    report[7] = COMMAND_ID.ENTER_BOOTLOADER;
    report[8] = 4;
    report[9] = ACK_RESULT.OK;

    expect(() => parseAckReport(report)).toThrow(ProtocolError);
    const ack = parseAckReport(report, { allowProtocolMismatch: true });
    expect(ack.commandId).toBe(COMMAND_ID.ENTER_BOOTLOADER);
    expect(ack.protocolVersion).toBe(`${PROTOCOL_MAJOR}.${PROTOCOL_MINOR - 1}`);
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

  it('parses a trigger trace report', () => {
    const report = baseReport(REPORT_ID.TRIGGER_TRACE);
    report[7] = 1;
    report[8] = 38;
    writeU32(report, 9, 260);
    writeU16(report, 13, 3);

    const offset = 15;
    writeU16(report, offset, 260);
    writeU32(report, offset + 2, 12345);
    report[offset + 6] = 4;
    report[offset + 7] = 0x31;
    report[offset + 8] = 78;
    report[offset + 9] = 0xa0;
    report[offset + 10] = 0x0c;
    report[offset + 11] = 0x04;
    report[offset + 12] = 0x00;
    report[offset + 13] = 0x05;
    report[offset + 14] = 1;
    for (let index = 0; index < 11; index += 1) {
      report[offset + 15 + index] = index + 1;
      report[offset + 26 + index] = index + 21;
    }

    const trace = parseTriggerTraceReport(report);
    expect(trace).toEqual({
      latestSequence: 260,
      droppedCount: 3,
      events: [
        {
          sequence: 260,
          timeMs: 12345,
          stage: 4,
          reportId: 0x31,
          length: 78,
          sequenceTag: 0xa0,
          flag0: 0x0c,
          flag1: 0x04,
          flag2: 0x00,
          motorPower: 0x05,
          decision: 1,
          rightTrigger: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
          leftTrigger: [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]
        }
      ]
    });
  });

  it('parses a feedback trace report', () => {
    const report = baseReport(REPORT_ID.FEEDBACK_TRACE);
    report[7] = 1;
    report[8] = 24;
    writeU32(report, 9, 33);
    writeU16(report, 13, 2);

    const offset = 15;
    writeU16(report, offset, 33);
    writeU32(report, offset + 2, 4444);
    report[offset + 6] = 4;
    report[offset + 7] = 0x36;
    report[offset + 8] = 255;
    report[offset + 9] = 0xa0;
    report[offset + 10] = 2;
    report[offset + 11] = 0xa2;
    report[offset + 12] = 0x80;
    report[offset + 13] = 0x04;
    report[offset + 14] = 0x12;
    report[offset + 15] = 0x34;
    report[offset + 16] = 96;
    report[offset + 17] = 22;
    report[offset + 18] = 40;
    report[offset + 19] = 1;
    report[offset + 20] = 2;
    report[offset + 21] = 3;
    report[offset + 22] = 4;

    const trace = parseFeedbackTraceReport(report);
    expect(trace).toEqual({
      latestSequence: 33,
      droppedCount: 2,
      events: [
        {
          sequence: 33,
          timeMs: 4444,
          stage: 4,
          reportId: 0x36,
          length: 255,
          sequenceTag: 0xa0,
          decision: 2,
          flag0: 0xa2,
          flag1: 0x80,
          flag2: 0x04,
          motorRight: 0x12,
          motorLeft: 0x34,
          hapticPeak: 96,
          hapticMean: 22,
          hapticNonZero: 40,
          detail0: 1,
          detail1: 2,
          detail2: 3,
          detail3: 4
        }
      ]
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

  it('can build a Pico bootloader command report for an older protocol minor', () => {
    const oldMinor = PROTOCOL_MINOR - 1;
    const report = buildCommandReport(COMMAND_ID.ENTER_BOOTLOADER, 11, 0, [], { protocolMinor: oldMinor });
    expect(report[5]).toBe(PROTOCOL_MAJOR);
    expect(report[6]).toBe(oldMinor);
    expect(report[7]).toBe(COMMAND_ID.ENTER_BOOTLOADER);
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
      lb: 'square',
      rfn: 'ps'
    });
    const report = buildCommandReport(COMMAND_ID.SET_BUTTON_REMAP, 7, 0, payload);
    expect(payload).toHaveLength(REMAP_BUTTON_IDS.length);
    expect(report[7]).toBe(COMMAND_ID.SET_BUTTON_REMAP);
    expect(report[11 + remapButtonIdValue('cross')]).toBe(remapButtonIdValue('circle'));
    expect(report[11 + remapButtonIdValue('lb')]).toBe(remapButtonIdValue('square'));
    expect(report[11 + remapButtonIdValue('rfn')]).toBe(remapButtonIdValue('ps'));
  });

  it('builds chord binding command payloads', () => {
    const payload = buildChordBindingsPayload([{
      id: 'chord-ps-triangle',
      kind: 'chord',
      starter: 'ps',
      button: 'triangle',
      functionId: 'play-pause'
    }, {
      id: 'chord-lfn-options',
      kind: 'chord',
      starter: 'lfn',
      button: 'options',
      functionId: 'open-task-manager'
    }, {
      id: 'chord-mute-options',
      kind: 'chord',
      starter: CHORD_MUTE_STARTER_ID,
      button: 'options',
      functionId: 'mute-action'
    }]);
    const report = buildCommandReport(COMMAND_ID.SET_CHORD_BINDINGS, 8, 3, payload);

    expect(payload).toEqual([0x20, 0x01, 11, 0x21, 0x02, 10, 0x22, 0x04, 10]);
    expect(report[7]).toBe(COMMAND_ID.SET_CHORD_BINDINGS);
    expect(report.slice(11, 20)).toEqual(payload);
  });

  it('marks Edge Fn face-button chord combos as reserved', () => {
    expect(isChordBindingAllowed('ps', 'triangle')).toBe(true);
    expect(isChordBindingAllowed('lfn', 'options')).toBe(true);
    expect(isChordBindingAllowed('rfn', 'square')).toBe(false);
    expect(isChordBindingAllowed('lfn', 'circle')).toBe(false);
  });

  it('builds sleep controller command reports', () => {
    const keybindReport = buildCommandReport(COMMAND_ID.SET_SLEEP_KEYBIND_ENABLED, 6, 1);
    const sleepReport = buildCommandReport(COMMAND_ID.SLEEP_CONTROLLER, 7, 0);
    expect(keybindReport[7]).toBe(COMMAND_ID.SET_SLEEP_KEYBIND_ENABLED);
    expect(keybindReport[9]).toBe(1);
    expect(sleepReport[7]).toBe(COMMAND_ID.SLEEP_CONTROLLER);
    expect(sleepReport[9]).toBe(0);
  });

  it('rejects undersized variable-length diagnostic records', () => {
    const cases: Array<{
      reportId: number;
      recordSize: number;
      parse: (report: number[]) => unknown;
      code: string;
    }> = [
      {
        reportId: REPORT_ID.AUDIO_DEBUG,
        recordSize: 13,
        parse: parseAudioDebugReport,
        code: 'bad-audio-debug-record'
      },
      {
        reportId: REPORT_ID.TRIGGER_TRACE,
        recordSize: 37,
        parse: parseTriggerTraceReport,
        code: 'bad-trigger-trace-record'
      },
      {
        reportId: REPORT_ID.FEEDBACK_TRACE,
        recordSize: 23,
        parse: parseFeedbackTraceReport,
        code: 'bad-feedback-trace-record'
      }
    ];

    for (const testCase of cases) {
      const report = baseReport(testCase.reportId);
      report[7] = 1;
      report[8] = testCase.recordSize;

      try {
        testCase.parse(report);
        throw new Error(`Expected report 0x${testCase.reportId.toString(16)} to throw`);
      } catch (error) {
        expect(error).toBeInstanceOf(ProtocolError);
        expect((error as ProtocolError).code).toBe(testCase.code);
      }
    }
  });

  it('stops parsing audio debug records at the report boundary', () => {
    const report = baseReport(REPORT_ID.AUDIO_DEBUG);
    report[7] = 5;
    report[8] = 14;
    writeU32(report, 9, 9);

    for (let index = 0; index < 3; index += 1) {
      const offset = 15 + index * 14;
      writeU32(report, offset, index + 7);
      writeU32(report, offset + 4, 1000 + index);
      report[offset + 8] = AUDIO_DEBUG_EVENT.AUDIO_START;
      report[offset + 9] = index;
    }

    const debug = parseAudioDebugReport(report);

    expect(debug.events.map((event) => event.sequence)).toEqual([7, 8, 9]);
  });

  it('parses Pico-local audio mic concealment counters', () => {
    const report = baseReport(REPORT_ID.AUDIO_STATUS);
    report[7] = 1;
    report[8] = 0;
    report[9] = 0x10 | 0x20 | 0x40 | 0x80;
    report[10] = 0x01 | 0x02;
    writeU32(report, 25, 22540);
    writeU32(report, 29, 0);
    writeU32(report, 33, 22540);
    writeU32(report, 37, 0);
    writeU32(report, 41, 225802);
    writeU32(report, 45, 0);
    writeU32(report, 49, 402);
    writeU32(report, 53, 7);
    writeU16(report, 57, 480);
    writeU16(report, 59, 96);
    writeU16(report, 61, 47);

    expect(parseAudioStatusReport(report)).toMatchObject({
      duplexRequested: true,
      duplexActive: true,
      controllerStateReady: true,
      headsetPlugged: true,
      headsetAudioRoute: true,
      micUsbStreaming: true,
      micPacketsReceived: 22540,
      micUsbWriteSuccess: 225802,
      micUsbConcealCount: 402,
      micPlcCount: 7,
      micLastDecodedSamples: 480,
      micLastWrittenBytes: 96,
      micPeakPermille: 47,
      protocolVersion: `${PROTOCOL_MAJOR}.${PROTOCOL_MINOR}`
    });
  });

  it('parses older Pico-local audio status protocol versions', () => {
    const report = baseReport(REPORT_ID.AUDIO_STATUS);
    report[6] = 2;
    report[7] = 1;
    report[8] = 0;
    report[9] = 0x10 | 0x20 | 0x40 | 0x80;
    report[10] = 1;
    writeU32(report, 25, 10);
    writeU32(report, 29, 2);
    writeU32(report, 33, 100);
    writeU32(report, 37, 4);
    writeU32(report, 41, 88);
    writeU32(report, 45, 5);
    writeU32(report, 49, 82);
    writeU32(report, 53, 6);
    writeU16(report, 57, 480);
    writeU16(report, 59, 96);
    writeU16(report, 61, 33);
    report[63] = 1;

    expect(parseAudioStatusReport(report)).toMatchObject({
      duplexRequested: true,
      duplexActive: true,
      headsetPlugged: true,
      controllerStateReady: true,
      micPacketsReceived: 10,
      micUsbWriteSuccess: 88,
      micUsbConcealCount: 82,
      micPlcCount: 6,
      micUsbStreaming: true,
      protocolVersion: '1.2'
    });
  });

  it('masks command header bytes and truncates oversized extra payloads', () => {
    const payload = Array.from({ length: 100 }, (_, index) => index + 1);
    const report = buildCommandReport(0x123, 0x1ff, 0x1234, payload);

    expect(report).toHaveLength(64);
    expect(report[7]).toBe(0x23);
    expect(report[8]).toBe(0xff);
    expect(report[9]).toBe(0x34);
    expect(report[10]).toBe(0x12);
    expect(report[11]).toBe(1);
    expect(report[63]).toBe(53);
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
