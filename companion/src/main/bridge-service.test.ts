import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACK_RESULT,
  AUDIO_DEBUG_EVENT,
  COMMAND_ID,
  COMPANION_USAGE,
  COMPANION_USAGE_PAGE,
  DEFAULT_CONTROLLER_PROFILE_ID,
  MAGIC,
  PROTOCOL_MAJOR,
  PROTOCOL_MINOR,
  REPORT_ID,
  REPORT_LENGTH,
  SHORTCUT_EVENT
} from '../shared/protocol';

const hidMock = vi.hoisted(() => {
  const state = {
    devicesList: [] as Array<Record<string, unknown>>,
    openDevices: new Map<string, MockHidDevice>()
  };

  function HidConstructor(this: unknown, devicePath: string) {
    const device = state.openDevices.get(devicePath);
    if (!device) {
      throw new Error(`Unexpected HID open: ${devicePath}`);
    }
    return device;
  }

  return {
    state,
    devices: vi.fn(() => state.devicesList),
    HID: vi.fn(HidConstructor)
  };
});

vi.mock('node-hid', () => ({
  default: {
    devices: hidMock.devices,
    HID: hidMock.HID
  }
}));

import { BridgeService } from './bridge-service';
import { SettingsStore } from './settings-store';

type StatusOverrides = {
  controllerConnected?: boolean;
  batteryPercent?: number;
  speakerVolumePercent?: number;
  idleDisconnectTimeoutMinutes?: number;
  settingsRevision?: number;
  uptimeSeconds?: number;
  protocolMajor?: number;
  protocolMinor?: number;
  magic?: string;
  firmwareMajor?: number;
  firmwareMinor?: number;
  firmwarePatch?: number;
  firmwareFlags?: number;
  statusFlags?: number;
};

const FULL_REAPPLY_COMMANDS = [
  COMMAND_ID.SET_LIGHTBAR_COLOR,
  COMMAND_ID.SET_LIGHTBAR_OVERRIDE,
  COMMAND_ID.SET_MUTE_BUTTON_ACTION,
  COMMAND_ID.SET_HAPTICS_GAIN,
  COMMAND_ID.SET_HAPTICS_BUFFER_LENGTH,
  COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN,
  COMMAND_ID.SET_TRIGGER_EFFECT_INTENSITY,
  COMMAND_ID.SET_SPEAKER_VOLUME,
  COMMAND_ID.SET_MIC_VOLUME,
  COMMAND_ID.SET_MIC_MUTE,
  COMMAND_ID.SET_HOST_AUDIO_ENABLED,
  COMMAND_ID.SET_DUPLEX_ENABLED,
  COMMAND_ID.SET_LED_ENABLED,
  COMMAND_ID.SET_IDLE_DISCONNECT_ENABLED,
  COMMAND_ID.SET_IDLE_DISCONNECT_TIMEOUT,
  COMMAND_ID.SET_USB_SUSPEND_DISCONNECT_ENABLED,
  COMMAND_ID.SET_SLEEP_KEYBIND_ENABLED,
  COMMAND_ID.SET_SPEAKER_VOLUME_SHORTCUT_ENABLED,
  COMMAND_ID.SET_BUTTON_REMAP,
  COMMAND_ID.SET_POLLING_RATE_MODE
];

class MockHidDevice extends EventEmitter {
  status = statusReport();
  audioDebugReports: number[][] = [];
  audioStatsReports: number[][] = [];
  hostAudioStatusReports: number[][] = [];
  featureReportIds: number[] = [];
  sentReports: number[][] = [];
  outReports: number[][] = [];
  ackResults: number[] = [];
  settingsRevision = 0;
  fixedAckRevision: number | null = null;

  constructor() {
    super();
  }

  getFeatureReport(reportId: number, length: number): number[] {
    expect(length).toBe(REPORT_LENGTH);
    this.featureReportIds.push(reportId);
    if (reportId === REPORT_ID.STATUS) {
      return [...this.status];
    }
    if (reportId === REPORT_ID.ACK) {
      const command = this.sentReports.at(-1);
      const result = this.ackResults.shift() ?? ACK_RESULT.OK;
      if (result === ACK_RESULT.OK && this.fixedAckRevision === null) {
        this.settingsRevision = (this.settingsRevision + 1) & 0xffff;
      }
      return ackReport({
        commandId: command?.[7] ?? 0,
        sequence: command?.[8] ?? 0,
        result,
        settingsRevision: this.fixedAckRevision ?? this.settingsRevision
      });
    }
    if (reportId === REPORT_ID.AUDIO_DEBUG) {
      return [...(this.audioDebugReports.shift() ?? audioDebugReport())];
    }
    if (reportId === REPORT_ID.AUDIO_STATS) {
      return [...(this.audioStatsReports.shift() ?? audioStatsReport())];
    }
    if (reportId === REPORT_ID.HOST_AUDIO_STATUS) {
      return [...(this.hostAudioStatusReports.shift() ?? hostAudioStatusReport())];
    }
    throw new Error(`Unexpected report ID: ${reportId}`);
  }

  sendFeatureReport(report: number[]): number {
    this.sentReports.push([...report]);
    return report.length;
  }

  write(report: number[]): number {
    this.outReports.push([...report]);
    return report.length;
  }

  close(): void {
    // No-op for tests.
  }
}

function companionDeviceInfo(devicePath = 'companion-path') {
  return {
    path: devicePath,
    vendorId: 0x054c,
    productId: 0x0ce6,
    usagePage: COMPANION_USAGE_PAGE,
    usage: COMPANION_USAGE,
    product: 'DS5 Bridge Companion',
    manufacturer: 'DS5 Bridge',
    interface: 4
  };
}

function normalFirmwareDeviceInfo() {
  return {
    path: 'dualsense-path',
    vendorId: 0x054c,
    productId: 0x0ce6,
    usagePage: 0x0001,
    usage: 0x0005,
    product: 'DualSense Wireless Controller',
    manufacturer: 'Sony Interactive Entertainment',
    interface: 0
  };
}

function writeU16(report: number[], offset: number, value: number): void {
  report[offset] = value & 0xff;
  report[offset + 1] = (value >> 8) & 0xff;
}

function writeU32(report: number[], offset: number, value: number): void {
  report[offset] = value & 0xff;
  report[offset + 1] = (value >> 8) & 0xff;
  report[offset + 2] = (value >> 16) & 0xff;
  report[offset + 3] = (value >> 24) & 0xff;
}

function writeMagic(report: number[], magic = MAGIC): void {
  report[1] = magic.charCodeAt(0);
  report[2] = magic.charCodeAt(1);
  report[3] = magic.charCodeAt(2);
  report[4] = magic.charCodeAt(3);
}

function writeVersion(report: number[]): void {
  report[5] = PROTOCOL_MAJOR;
  report[6] = PROTOCOL_MINOR;
}

function statusReport(overrides: StatusOverrides = {}): number[] {
  const report = new Array<number>(REPORT_LENGTH).fill(0);
  report[0] = REPORT_ID.STATUS;
  writeMagic(report, overrides.magic);
  report[5] = overrides.protocolMajor ?? PROTOCOL_MAJOR;
  report[6] = overrides.protocolMinor ?? PROTOCOL_MINOR;
  report[7] = overrides.controllerConnected ?? true ? 1 : 0;
  report[8] = 1;
  report[9] = overrides.batteryPercent ?? 78;
  report[10] = 1;
  report[11] = 1;
  report[12] = 1;
  writeU16(report, 13, 100);
  report[15] = 1;
  report[16] = 1;
  writeU16(report, 17, overrides.settingsRevision ?? 0);
  report[19] = ACK_RESULT.OK;
  report[20] = overrides.statusFlags ?? 0xb0;
  writeU32(report, 21, overrides.uptimeSeconds ?? 10);
  report[25] = overrides.firmwareMajor ?? 1;
  report[26] = overrides.firmwareMinor ?? 0;
  report[27] = overrides.firmwarePatch ?? 0;
  report[28] = overrides.firmwareFlags ?? 1;
  writeU16(report, 29, overrides.speakerVolumePercent ?? 30);
  writeU16(report, 43, overrides.idleDisconnectTimeoutMinutes ?? 15);
  return report;
}

function ackReport(options: {
  commandId: number;
  sequence: number;
  result: number;
  settingsRevision: number;
}): number[] {
  const report = new Array<number>(REPORT_LENGTH).fill(0);
  report[0] = REPORT_ID.ACK;
  writeMagic(report);
  writeVersion(report);
  report[7] = options.commandId;
  report[8] = options.sequence;
  report[9] = options.result;
  writeU16(report, 11, options.settingsRevision);
  writeU32(report, 13, 12);
  return report;
}

function audioDebugReport(events: Array<{
  sequence: number;
  timeUs: number;
  eventCode: number;
  args: number[];
}> = [], droppedCount = 0): number[] {
  const report = new Array<number>(REPORT_LENGTH).fill(0);
  report[0] = REPORT_ID.AUDIO_DEBUG;
  writeMagic(report);
  writeVersion(report);
  report[7] = Math.min(events.length, 3);
  report[8] = 14;
  writeU32(report, 9, events.at(-1)?.sequence ?? 0);
  writeU16(report, 13, droppedCount);
  events.slice(0, 3).forEach((event, index) => {
    const offset = 15 + index * 14;
    writeU32(report, offset, event.sequence);
    writeU32(report, offset + 4, event.timeUs);
    report[offset + 8] = event.eventCode;
    for (let argIndex = 0; argIndex < 5; argIndex += 1) {
      report[offset + 9 + argIndex] = event.args[argIndex] ?? 0;
    }
  });
  return report;
}

function audioStatsReport(values: Partial<{
  usbAudioGapMaxUs: number;
  usbAudioGapOver1500Count: number;
  opusEncodeMaxUs: number;
  opusEncodeOverBudgetCount: number;
  audio0x36EnqueueToSendMaxUs: number;
  audio0x36SendGapMaxUs: number;
  audio0x36LateCountOver12000Us: number;
  audio0x36DropOldestCount: number;
  audioGenerationDropCount: number;
  nonAudioReportsBetweenAudioMax: number;
  btAudioQueueDepthMax: number;
  audio0x36EnqueuedCount: number;
  audio0x36SentCount: number;
  criticalStarvingAudioCount: number;
}> = {}): number[] {
  const report = new Array<number>(REPORT_LENGTH).fill(0);
  report[0] = REPORT_ID.AUDIO_STATS;
  writeMagic(report);
  writeVersion(report);
  report[7] = 1;
  writeU32(report, 8, values.usbAudioGapMaxUs ?? 0);
  writeU32(report, 12, values.usbAudioGapOver1500Count ?? 0);
  writeU32(report, 16, values.opusEncodeMaxUs ?? 0);
  writeU32(report, 20, values.opusEncodeOverBudgetCount ?? 0);
  writeU32(report, 24, values.audio0x36EnqueueToSendMaxUs ?? 0);
  writeU32(report, 28, values.audio0x36SendGapMaxUs ?? 0);
  writeU32(report, 32, values.audio0x36LateCountOver12000Us ?? 0);
  writeU32(report, 36, values.audio0x36DropOldestCount ?? 0);
  writeU32(report, 40, values.audioGenerationDropCount ?? 0);
  writeU32(report, 44, values.nonAudioReportsBetweenAudioMax ?? 0);
  writeU32(report, 48, values.btAudioQueueDepthMax ?? 0);
  writeU32(report, 52, values.audio0x36EnqueuedCount ?? 0);
  writeU32(report, 56, values.audio0x36SentCount ?? 0);
  writeU32(report, 60, values.criticalStarvingAudioCount ?? 0);
  return report;
}

function hostAudioStatusReport(overrides: Partial<{
  mode: number;
  fallbackReason: number;
  hostRequested: boolean;
  heartbeatHealthy: boolean;
  streamActive: boolean;
  streamHealthy: boolean;
  duplexRequested: boolean;
  duplexActive: boolean;
  controllerStateReady: boolean;
  headsetPlugged: boolean;
  headsetAudioRoute: boolean;
  streamGeneration: number;
}> = {}): number[] {
  const report = new Array<number>(REPORT_LENGTH).fill(0);
  report[0] = REPORT_ID.HOST_AUDIO_STATUS;
  writeMagic(report);
  writeVersion(report);
  report[7] = overrides.mode ?? 0;
  report[8] = overrides.fallbackReason ?? 1;
  report[9] = overrides.hostRequested ? 1 : 0;
  report[10] = overrides.heartbeatHealthy ? 1 : 0;
  report[11] = overrides.streamActive ? 1 : 0;
  report[12] = overrides.streamHealthy ? 1 : 0;
  report[13] = overrides.duplexRequested ? 1 : 0;
  report[14] = (overrides.duplexActive ? 0x01 : 0x00)
    | (overrides.headsetPlugged ? 0x02 : 0x00)
    | (overrides.headsetAudioRoute ? 0x04 : 0x00)
    | (overrides.controllerStateReady ? 0x08 : 0x00);
  writeU16(report, 15, overrides.streamGeneration ?? 0);
  return report;
}

function createService(initialSettings?: Parameters<SettingsStore['update']>[0]): { service: BridgeService; tempDir: string } {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'ds5-bridge-companion-'));
  const settingsStore = new SettingsStore(tempDir);
  if (initialSettings) {
    settingsStore.update(initialSettings);
  }
  return {
    service: new BridgeService(settingsStore),
    tempDir
  };
}

async function poll(service: BridgeService): Promise<void> {
  await (service as unknown as { poll(): Promise<void> }).poll();
}

async function pollAndPublishErrors(service: BridgeService): Promise<void> {
  try {
    await poll(service);
  } catch (error) {
    (service as unknown as { publishError(error: unknown): void }).publishError(error);
  }
}

async function flushReapply(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('BridgeService', () => {
  let tempDirs: string[] = [];

  beforeEach(() => {
    hidMock.state.devicesList = [];
    hidMock.state.openDevices.clear();
    hidMock.devices.mockClear();
    hidMock.HID.mockClear();
    tempDirs = [];
  });

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function serviceFixture(initialSettings?: Parameters<SettingsStore['update']>[0]): BridgeService {
    const fixture = createService(initialSettings);
    tempDirs.push(fixture.tempDir);
    return fixture.service;
  }

  it('reports no bridge when no matching HID device is present', async () => {
    const service = serviceFixture();

    await poll(service);

    expect(service.getSnapshot().state).toBe('no-bridge');
    expect(service.getSnapshot().message).toBe('No bridge detected');
  });

  it('reports normal firmware when only the game-facing DualSense HID exists', async () => {
    const service = serviceFixture();
    hidMock.state.devicesList = [normalFirmwareDeviceInfo()];

    await poll(service);

    expect(service.getSnapshot().state).toBe('normal-firmware');
    expect(service.getSnapshot().message).toBe('Companion firmware required');
  });

  it('treats HID read errors as disconnects instead of fatal main-process errors', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    device.emit('error', new Error('could not read from HID device'));

    expect(service.getSnapshot().state).toBe('no-bridge');
    expect(service.getSnapshot().message).toBe('No bridge detected');
  });

  it('blocks emergency Windows device repair while a controller is connected to the bridge', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: true });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    await expect(service.repairWindowsDeviceCache()).rejects.toThrow(
      'Disconnect the controller from the bridge before running emergency device repair.'
    );
  });

  it('keeps audio debug diagnostics disabled during normal polling', async () => {
    const fixture = createService();
    tempDirs.push(fixture.tempDir);
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false });
    device.audioDebugReports.push(audioDebugReport([
      {
        sequence: 7,
        timeUs: 123456,
        eventCode: AUDIO_DEBUG_EVENT.RESET_GAP,
        args: [1, 2, 255, 9, 2]
      }
    ], 3));
    device.audioStatsReports.push(audioStatsReport({
      usbAudioGapMaxUs: 2100,
      audio0x36SendGapMaxUs: 13000,
      nonAudioReportsBetweenAudioMax: 3
    }));
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(fixture.service);

    const snapshot = fixture.service.getSnapshot();
    expect(snapshot.diagnostics.audioDebugDroppedCount).toBe(0);
    expect(snapshot.diagnostics.audioDebugLogPath).toBeNull();
    expect(snapshot.diagnostics.audioDebugStats).toBeNull();
    expect(snapshot.diagnostics.audioDebugLogLines).toEqual([]);
    expect(device.featureReportIds).not.toContain(REPORT_ID.AUDIO_DEBUG);
    expect(device.featureReportIds).not.toContain(REPORT_ID.AUDIO_STATS);
    expect(existsSync(path.join(fixture.tempDir, 'logs'))).toBe(false);
  });

  it('rejects companion candidates with bad magic or unsupported protocol', async () => {
    const badMagicService = serviceFixture();
    const badMagicDevice = new MockHidDevice();
    badMagicDevice.status = statusReport({ magic: 'NOPE' });
    hidMock.state.devicesList = [companionDeviceInfo('bad-magic')];
    hidMock.state.openDevices.set('bad-magic', badMagicDevice);

    await poll(badMagicService);

    expect(badMagicService.getSnapshot().state).toBe('incompatible');

    const badVersionService = serviceFixture();
    const badVersionDevice = new MockHidDevice();
    badVersionDevice.status = statusReport({ protocolMajor: 2 });
    hidMock.state.devicesList = [companionDeviceInfo('bad-version')];
    hidMock.state.openDevices.set('bad-version', badVersionDevice);

    await pollAndPublishErrors(badVersionService);

    expect(badVersionService.getSnapshot().state).toBe('incompatible');
    expect(badVersionService.getSnapshot().message).toBe('Firmware 1.0.1 update required');
    expect(badVersionService.getSnapshot().diagnostics.lastError).toContain('Firmware update required');
  });

  it('requires users to update pre-1.0 bridge firmware', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ firmwareMajor: 0, firmwareMinor: 5, firmwarePatch: 15 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    const snapshot = service.getSnapshot();
    expect(snapshot.state).toBe('incompatible');
    expect(snapshot.message).toBe('Firmware 1.0.1 update required');
    expect(snapshot.status?.firmwareVersion).toBe('0.5.15');
    expect(snapshot.diagnostics.lastError).toContain('Update the bridge firmware to 1.0.1 or newer');
    expect(device.sentReports).toEqual([]);
  });

  it('reapplies saved settings once per companion session and again after uptime drops', async () => {
    const service = serviceFixture({ hostEncodedAudioEnabled: false });
    const device = new MockHidDevice();
    device.settingsRevision = 4;
    device.status = statusReport({ controllerConnected: true, settingsRevision: 4, uptimeSeconds: 30 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await flushReapply();

    expect(service.getSnapshot().state).toBe('connected');
    expect(device.sentReports.map((report) => report[7])).toEqual(FULL_REAPPLY_COMMANDS);

    device.status = statusReport({
      controllerConnected: true,
      settingsRevision: device.settingsRevision,
      uptimeSeconds: 30
    });
    await poll(service);
    await flushReapply();
    expect(device.sentReports).toHaveLength(FULL_REAPPLY_COMMANDS.length);

    device.status = statusReport({
      controllerConnected: true,
      settingsRevision: device.settingsRevision,
      uptimeSeconds: 1
    });
    await poll(service);
    await flushReapply();
    expect(device.sentReports).toHaveLength(FULL_REAPPLY_COMMANDS.length * 2);
  });

  it('reapplies current settings without feature-bit fallbacks', async () => {
    const service = serviceFixture({ hostEncodedAudioEnabled: false });
    const device = new MockHidDevice();
    device.status = statusReport({
      controllerConnected: true,
      settingsRevision: 4,
      uptimeSeconds: 30,
      statusFlags: 0
    });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await flushReapply();

    expect(device.sentReports.map((report) => report[7])).toEqual(FULL_REAPPLY_COMMANDS);
  });

  it('surfaces test haptics ACK failures without rejecting IPC', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.ackResults = [ACK_RESULT.ERR_NOT_CONNECTED];
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    const snapshot = await service.testHaptics();

    expect(snapshot.diagnostics.lastError).toBe('Controller not connected');
    expect(snapshot.diagnostics.lastAck?.resultCode).toBe(ACK_RESULT.ERR_NOT_CONNECTED);
  });

  it('sends rumble test commands without rejecting busy ACKs', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.ackResults = [ACK_RESULT.ERR_BUSY];
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    const snapshot = await service.testClassicRumble();

    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.TEST_CLASSIC_RUMBLE);
    expect(snapshot.diagnostics.lastError).toBe('Test is busy');
    expect(snapshot.diagnostics.lastAck?.resultCode).toBe(ACK_RESULT.ERR_BUSY);
  });

  it('sends and stores mute button keyboard bindings', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, firmwareFlags: 0x21 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setMuteButtonAction('keyboard', 0x68, 0x02, 'hold');

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_MUTE_BUTTON_ACTION);
    expect(command?.[9]).toBe(1);
    expect(command?.[11]).toBe(0x68);
    expect(command?.[12]).toBe(0x82);
    expect(snapshot.settings.muteButtonMode).toBe('keyboard');
    expect(snapshot.settings.muteKeyboardUsage).toBe(0x68);
    expect(snapshot.settings.muteKeyboardModifiers).toBe(0x02);
    expect(snapshot.settings.muteKeyboardBehavior).toBe('hold');
  });

  it('sends and stores haptics buffer length', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, firmwareFlags: 0x41 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setHapticsBufferLength(64);

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_HAPTICS_BUFFER_LENGTH);
    expect(command?.[9]).toBe(64);
    expect(snapshot.settings.hapticsBufferLength).toBe(64);
  });

  it('sends and stores adaptive trigger intensity', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, firmwareFlags: 0x81 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setTriggerEffectIntensity(45);

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_TRIGGER_EFFECT_INTENSITY);
    expect(command?.[9]).toBe(45);
    expect(snapshot.settings.triggerEffectIntensityPercent).toBe(45);
  });

  it('caps power-hungry controller settings while headphones are plugged in', async () => {
    const service = serviceFixture({
      hostEncodedAudioEnabled: false,
      controllerPowerSavingEnabled: true
    });
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false });
    device.hostAudioStatusReports = [hostAudioStatusReport({ headsetPlugged: true })];
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    let snapshot = await service.setHapticsGain(140);
    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.SET_HAPTICS_GAIN);
    expect(device.sentReports.at(-1)?.[9]).toBe(60);
    expect(snapshot.settings.hapticsGainPercent).toBe(140);

    snapshot = await service.setClassicRumbleGain(120);
    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN);
    expect(device.sentReports.at(-1)?.[9]).toBe(60);
    expect(snapshot.settings.classicRumbleGainPercent).toBe(120);

    snapshot = await service.setTriggerEffectIntensity(80);
    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.SET_TRIGGER_EFFECT_INTENSITY);
    expect(device.sentReports.at(-1)?.[9]).toBe(60);
    expect(snapshot.settings.triggerEffectIntensityPercent).toBe(80);

    snapshot = await service.setLightbarColor('#ffffff', 100);
    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.SET_LIGHTBAR_COLOR);
    expect(device.sentReports.at(-1)?.[9]).toBe(60);
    expect(snapshot.settings.lightbarBrightnessPercent).toBe(100);

    snapshot = await service.setTriggerEffectIntensity(45);
    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.SET_TRIGGER_EFFECT_INTENSITY);
    expect(device.sentReports.at(-1)?.[9]).toBe(45);
    expect(snapshot.settings.triggerEffectIntensityPercent).toBe(45);
  });

  it('applies and removes power-saving caps as headphones connect and disconnect', async () => {
    const service = serviceFixture({
      hostEncodedAudioEnabled: false,
      controllerPowerSavingEnabled: true,
      hapticsGainPercent: 100,
      classicRumbleGainPercent: 120,
      triggerEffectIntensityPercent: 80,
      lightbarBrightnessPercent: 90
    });
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false });
    device.hostAudioStatusReports = [hostAudioStatusReport({ headsetPlugged: false })];
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    expect(device.sentReports).toEqual([]);

    device.hostAudioStatusReports = [hostAudioStatusReport({ headsetPlugged: true })];
    await poll(service);
    expect(device.sentReports.map((report) => [report[7], report[9]])).toEqual([
      [COMMAND_ID.SET_HAPTICS_GAIN, 60],
      [COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN, 60],
      [COMMAND_ID.SET_TRIGGER_EFFECT_INTENSITY, 60],
      [COMMAND_ID.SET_LIGHTBAR_COLOR, 60],
      [COMMAND_ID.SET_LIGHTBAR_OVERRIDE, 0]
    ]);
    expect(service.getSnapshot().settings).toMatchObject({
      hapticsGainPercent: 100,
      classicRumbleGainPercent: 120,
      triggerEffectIntensityPercent: 80,
      lightbarBrightnessPercent: 90
    });

    device.sentReports = [];
    device.hostAudioStatusReports = [hostAudioStatusReport({ headsetPlugged: false })];
    await poll(service);
    expect(device.sentReports.map((report) => [report[7], report[9]])).toEqual([
      [COMMAND_ID.SET_HAPTICS_GAIN, 100],
      [COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN, 120],
      [COMMAND_ID.SET_TRIGGER_EFFECT_INTENSITY, 80],
      [COMMAND_ID.SET_LIGHTBAR_COLOR, 90],
      [COMMAND_ID.SET_LIGHTBAR_OVERRIDE, 0]
    ]);
  });

  it('sends speaker volume as firmware gain', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, firmwareFlags: 0x05 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setSpeakerVolume(25);

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_SPEAKER_VOLUME);
    expect(command?.[9]).toBe(25);
    expect(snapshot.settings.speakerVolumePercent).toBe(25);
    expect(snapshot.status?.speakerVolumePercent).toBe(25);
  });

  it('sends and stores USB suspend disconnect settings', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, statusFlags: 0x30 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setUsbSuspendDisconnectEnabled(false);

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_USB_SUSPEND_DISCONNECT_ENABLED);
    expect(command?.[9]).toBe(0);
    expect(snapshot.settings.usbSuspendDisconnectEnabled).toBe(false);
  });

  it('sends and stores idle disconnect timeout settings', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setIdleDisconnectTimeoutMinutes(20);

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_IDLE_DISCONNECT_TIMEOUT);
    expect(command?.[9]).toBe(20);
    expect(snapshot.settings.idleDisconnectTimeoutMinutes).toBe(20);
  });

  it('sends and stores sleep keybind settings', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, statusFlags: 0x80 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setSleepKeybindEnabled(true);

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_SLEEP_KEYBIND_ENABLED);
    expect(command?.[9]).toBe(1);
    expect(snapshot.settings.sleepKeybindEnabled).toBe(true);
    expect(snapshot.status?.sleepKeybindEnabled).toBe(true);
  });

  it('applies sleep shortcut input through the normal sleep command path', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, statusFlags: 0x80 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await service.setSleepKeybindEnabled(true);

    device.emit('data', Buffer.from([REPORT_ID.INPUT, SHORTCUT_EVENT.SLEEP_CONTROLLER]));
    await flushReapply();
    await flushReapply();

    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.SLEEP_CONTROLLER);
    expect(device.sentReports.at(-1)?.[9]).toBe(0);
  });

  it('sends and stores speaker volume shortcut settings', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setSpeakerVolumeShortcutEnabled(true);

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_SPEAKER_VOLUME_SHORTCUT_ENABLED);
    expect(command?.[9]).toBe(1);
    expect(snapshot.settings.speakerVolumeShortcutEnabled).toBe(true);
  });

  it('applies speaker volume shortcut input through the normal volume command path', async () => {
    const service = serviceFixture({ speakerVolumePercent: 30 });
    const device = new MockHidDevice();
    device.status = statusReport({
      controllerConnected: false,
      settingsRevision: 4,
      speakerVolumePercent: 30
    });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await service.setSpeakerVolumeShortcutEnabled(true);
    expect(service.getSnapshot().settings.speakerEnabled).toBe(true);

    device.emit('data', Buffer.from([REPORT_ID.INPUT, SHORTCUT_EVENT.CONTROLLER_VOLUME_UP]));
    await flushReapply();
    await flushReapply();

    expect(service.getSnapshot().settings.speakerVolumePercent).toBe(40);
    expect(service.getSnapshot().status?.speakerVolumePercent).toBe(40);
    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.SET_SPEAKER_VOLUME);
    expect(device.sentReports.at(-1)?.[9]).toBe(40);
  });

  it('sends and stores classic rumble gain', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setClassicRumbleGain(140);

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN);
    expect(command?.[9]).toBe(140);
    expect(snapshot.settings.classicRumbleGainPercent).toBe(140);
  });

  it('sends and stores polling rate settings', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setPollingRateMode('500');

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_POLLING_RATE_MODE);
    expect(command?.[9]).toBe(1);
    expect(snapshot.settings.pollingRateMode).toBe('500');
  });

  it('sends manual sleep command without requiring a settings revision change', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.fixedAckRevision = 4;
    device.settingsRevision = 4;
    device.status = statusReport({ controllerConnected: true, settingsRevision: 4, statusFlags: 0x80 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.sleepController();

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SLEEP_CONTROLLER);
    expect(command?.[9]).toBe(0);
    expect(snapshot.diagnostics.lastAck?.resultCode).toBe(ACK_RESULT.OK);
  });

  it('stores notification preferences without sending firmware commands', async () => {
    const service = serviceFixture();

    let snapshot = await service.setNotifyControllerConnection(true);
    expect(snapshot.settings.notifyControllerConnection).toBe(true);

    snapshot = await service.setNotifyLowBattery(true);
    expect(snapshot.settings.notifyLowBattery).toBe(true);
  });

  it('emits controller connect and disconnect toasts on status transitions', async () => {
    const service = serviceFixture({ hostEncodedAudioEnabled: false });
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false });
    const toasts: Array<{ title: string; body: string }> = [];
    service.on('toast', (toast) => toasts.push(toast));
    await service.setNotifyControllerConnection(true);
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    expect(toasts).toEqual([]);

    device.status = statusReport({ controllerConnected: true, uptimeSeconds: 11 });
    await poll(service);
    expect(toasts.at(-1)?.body).toBe('Controller connected');

    device.status = statusReport({ controllerConnected: false, uptimeSeconds: 12 });
    await poll(service);
    expect(toasts.at(-1)?.body).toBe('Controller disconnected');
    expect(toasts).toHaveLength(2);
  });

  it('emits controller toasts when the companion interface disappears and returns', async () => {
    const service = serviceFixture({ hostEncodedAudioEnabled: false });
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: true });
    const toasts: Array<{ title: string; body: string }> = [];
    service.on('toast', (toast) => toasts.push(toast));
    await service.setNotifyControllerConnection(true);
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    expect(toasts).toEqual([]);

    hidMock.state.devicesList = [];
    await poll(service);
    expect(toasts.at(-1)?.body).toBe('Controller disconnected');

    device.status = statusReport({ controllerConnected: true, uptimeSeconds: 1 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    await poll(service);
    expect(toasts.at(-1)?.body).toBe('Controller connected');
    expect(toasts).toHaveLength(2);
  });

  it('emits low battery toasts once until battery recovers', async () => {
    const service = serviceFixture({ hostEncodedAudioEnabled: false });
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: true, batteryPercent: 30 });
    const toasts: Array<{ title: string; body: string }> = [];
    service.on('toast', (toast) => toasts.push(toast));
    await service.setNotifyLowBattery(true);
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    expect(toasts).toEqual([]);

    device.status = statusReport({ controllerConnected: true, batteryPercent: 20, uptimeSeconds: 11 });
    await poll(service);
    expect(toasts.at(-1)?.body).toBe('Controller battery low: 20%');
    expect(toasts).toHaveLength(1);

    device.status = statusReport({ controllerConnected: true, batteryPercent: 10, uptimeSeconds: 12 });
    await poll(service);
    expect(toasts).toHaveLength(1);

    device.status = statusReport({ controllerConnected: true, batteryPercent: 30, uptimeSeconds: 13 });
    await poll(service);
    device.status = statusReport({ controllerConnected: true, batteryPercent: 20, uptimeSeconds: 14 });
    await poll(service);
    expect(toasts).toHaveLength(2);
  });

  it('emits a test notification toast on demand', async () => {
    const service = serviceFixture();
    const toasts: Array<{ title: string; body: string }> = [];
    service.on('toast', (toast) => toasts.push(toast));

    await service.testNotification();

    expect(toasts).toEqual([{ title: 'DS5 Bridge', body: 'Notifications are working.' }]);
  });

  it('turns feature kill switches into effective zero-value firmware commands', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, firmwareFlags: 0x85 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await service.setHapticsEnabled(false);
    await service.setClassicRumbleEnabled(false);
    await service.setSpeakerEnabled(false);
    const snapshot = await service.setAdaptiveTriggersEnabled(false);

    expect(device.sentReports.at(-5)?.[7]).toBe(COMMAND_ID.SET_HAPTICS_GAIN);
    expect(device.sentReports.at(-5)?.[9]).toBe(0);
    expect(device.sentReports.at(-4)?.[7]).toBe(COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN);
    expect(device.sentReports.at(-4)?.[9]).toBe(0);
    expect(device.sentReports.at(-3)?.[7]).toBe(COMMAND_ID.SET_SPEAKER_VOLUME);
    expect(device.sentReports.at(-3)?.[9]).toBe(0);
    expect(device.sentReports.at(-2)?.[7]).toBe(COMMAND_ID.SET_TRIGGER_EFFECT_INTENSITY);
    expect(device.sentReports.at(-2)?.[9]).toBe(0);
    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.RESET_ADAPTIVE_TRIGGERS);
    expect(snapshot.settings.hapticsEnabled).toBe(false);
    expect(snapshot.settings.classicRumbleEnabled).toBe(false);
    expect(snapshot.settings.speakerEnabled).toBe(false);
    expect(snapshot.settings.adaptiveTriggersEnabled).toBe(false);
  });

  it('applies quiet preset as persisted app settings plus zeroed runtime features', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: true, firmwareFlags: 0xff });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await flushReapply();
    device.sentReports = [];

    const snapshot = await service.applyPreset('quiet');
    const commands = device.sentReports.map((report) => [report[7], report[9]]);

    expect(commands).toContainEqual([COMMAND_ID.SET_HAPTICS_GAIN, 0]);
    expect(commands).toContainEqual([COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN, 0]);
    expect(commands).toContainEqual([COMMAND_ID.SET_TRIGGER_EFFECT_INTENSITY, 0]);
    expect(commands).toContainEqual([COMMAND_ID.RESET_ADAPTIVE_TRIGGERS, 0]);
    expect(commands).toContainEqual([COMMAND_ID.SET_SPEAKER_VOLUME, 0]);
    expect(snapshot.settings.selectedPresetId).toBe('quiet');
    expect(snapshot.settings.muteButtonMode).toBe('quiet');
  });

  it('restores the remembered custom profile after switching through presets', async () => {
    const fixture = createService();
    tempDirs.push(fixture.tempDir);
    const { service } = fixture;
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: true, firmwareFlags: 0xff });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await flushReapply();

    await service.setHapticsEnabled(false);
    await service.setSpeakerEnabled(false);
    expect(service.getSnapshot().settings.selectedPresetId).toBe('custom');

    const presetSnapshot = await service.applyPreset('balanced');
    expect(presetSnapshot.settings.selectedPresetId).toBe('balanced');
    expect(presetSnapshot.settings.hapticsEnabled).toBe(true);
    expect(presetSnapshot.settings.speakerEnabled).toBe(true);

    const restartedService = new BridgeService(new SettingsStore(fixture.tempDir));
    const customSnapshot = await restartedService.applyPreset('custom');
    expect(customSnapshot.settings.selectedPresetId).toBe('custom');
    expect(customSnapshot.settings.hapticsEnabled).toBe(false);
    expect(customSnapshot.settings.speakerEnabled).toBe(false);
  });

  it('falls back when applying or loading a deleted preset id', async () => {
    const fixture = createService();
    tempDirs.push(fixture.tempDir);

    const appliedSnapshot = await fixture.service.applyPreset('ptt-f24' as never);
    expect(appliedSnapshot.settings.selectedPresetId).toBe('balanced');

    const settingsPath = path.join(fixture.tempDir, 'settings.json');
    mkdirSync(path.dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({
      selectedPresetId: 'ptt-f24',
      hapticsEnabled: false
    }), 'utf8');

    const restartedService = new BridgeService(new SettingsStore(fixture.tempDir));
    expect(restartedService.getSnapshot().settings.selectedPresetId).toBe('balanced');
  });

  it('adds the protected default controller profile without changing the selected profile', () => {
    const fixture = createService();
    tempDirs.push(fixture.tempDir);
    const settingsPath = path.join(fixture.tempDir, 'settings.json');
    mkdirSync(path.dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({
      selectedControllerProfileId: 'profile-personalized',
      controllerProfiles: [{
        id: 'profile-personalized',
        name: 'Personalized',
        settings: {
          speakerVolumePercent: 30,
          micMuted: true
        }
      }]
    }), 'utf8');

    const restartedService = new BridgeService(new SettingsStore(fixture.tempDir));
    const profiles = restartedService.getSnapshot().settings.controllerProfiles;
    expect(profiles.find((profile) => profile.id === DEFAULT_CONTROLLER_PROFILE_ID)?.name).toBe('Default');
    expect(profiles.find((profile) => profile.id === 'profile-personalized')?.name).toBe('Personalized');
    expect(restartedService.getSnapshot().settings.selectedControllerProfileId).toBe('profile-personalized');
  });

  it('forks default controller settings into an auto-saved custom profile', () => {
    const fixture = createService();
    tempDirs.push(fixture.tempDir);
    const store = new SettingsStore(fixture.tempDir);

    const updated = store.update({ speakerVolumePercent: 30 });

    expect(updated.selectedControllerProfileId).toBe('custom');
    expect(updated.controllerProfiles.map((profile) => profile.name)).toEqual(['Default', 'Custom']);
    expect(updated.controllerProfiles.find((profile) => profile.id === DEFAULT_CONTROLLER_PROFILE_ID)?.settings.speakerVolumePercent).toBe(100);
    expect(updated.controllerProfiles.find((profile) => profile.id === 'custom')?.settings.speakerVolumePercent).toBe(30);
  });

  it('keeps default protected and restores it when requested', async () => {
    const fixture = createService();
    tempDirs.push(fixture.tempDir);

    const initialProfiles = fixture.service.getSnapshot().settings.controllerProfiles;
    expect(initialProfiles.map((profile) => profile.name)).toEqual(['Default']);

    const afterBlockedDelete = await fixture.service.deleteControllerProfile(DEFAULT_CONTROLLER_PROFILE_ID);
    expect(afterBlockedDelete.settings.controllerProfiles).toHaveLength(1);
    expect(afterBlockedDelete.settings.controllerProfiles[0]?.name).toBe('Default');

    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: true, firmwareFlags: 0xff });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);
    await poll(fixture.service);

    const restored = await fixture.service.restoreDefaults();
    expect(restored.settings.controllerProfiles[0]?.id).toBe(DEFAULT_CONTROLLER_PROFILE_ID);
    expect(restored.settings.controllerProfiles[0]?.name).toBe('Default');
    expect(restored.settings.controllerProfiles[0]?.settings.speakerVolumePercent).toBe(100);
    expect(restored.settings.selectedControllerProfileId).toBe(DEFAULT_CONTROLLER_PROFILE_ID);
  });

  it('persists button remapping drafts and profiles without a connected device', async () => {
    const fixture = createService();
    tempDirs.push(fixture.tempDir);

    const changedSnapshot = await fixture.service.setButtonRemap('cross', 'circle');
    expect(changedSnapshot.settings.buttonRemappingDraft.cross).toBe('circle');
    expect(changedSnapshot.settings.selectedButtonRemappingProfileId).toBe('custom');
    expect(changedSnapshot.settings.buttonRemappingProfiles.find((profile) => profile.id === 'custom')?.mappings.cross).toBe('circle');

    const savedSnapshot = await fixture.service.saveButtonRemappingProfile('Fighting Game');
    const savedProfile = savedSnapshot.settings.buttonRemappingProfiles.find((profile) => profile.name === 'Fighting Game');
    expect(savedProfile?.mappings.cross).toBe('circle');
    expect(savedSnapshot.settings.selectedButtonRemappingProfileId).toBe(savedProfile?.id);

    const updatedDraftSnapshot = await fixture.service.setButtonRemap('square', 'triangle');
    const updatedProfile = updatedDraftSnapshot.settings.buttonRemappingProfiles.find((profile) => (
      profile.id === savedProfile?.id
    ));
    expect(updatedDraftSnapshot.settings.buttonRemappingDraft.square).toBe('triangle');
    expect(updatedProfile?.mappings.square).toBe('triangle');
    expect(updatedDraftSnapshot.settings.buttonRemappingProfiles).toHaveLength(3);

    const restoredSnapshot = await fixture.service.restoreButtonRemappingDefaults();
    expect(restoredSnapshot.settings.buttonRemappingDraft.cross).toBe('cross');
    expect(restoredSnapshot.settings.selectedButtonRemappingProfileId).toBe('default');

    const restartedService = new BridgeService(new SettingsStore(fixture.tempDir));
    const restartedProfile = restartedService.getSnapshot().settings.buttonRemappingProfiles.find((profile) => (
      profile.name === 'Fighting Game'
    ));
    expect(restartedProfile?.mappings.cross).toBe('circle');
  });

  it('sends button remapping settings to firmware', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: true, firmwareFlags: 0xff });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await service.setButtonRemap('lb', 'square');
    const snapshot = await service.setButtonRemap('cross', 'circle');

    const command = device.sentReports.filter((report) => report[7] === COMMAND_ID.SET_BUTTON_REMAP).at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_BUTTON_REMAP);
    expect(command?.[9]).toBe(0);
    expect(command?.[11 + 13]).toBe(12);
    expect(command?.[11 + 16]).toBe(14);
    expect(snapshot.settings.buttonRemappingDraft.cross).toBe('circle');
    expect(snapshot.settings.buttonRemappingDraft.lb).toBe('square');
  });

  it('sends adaptive trigger test commands without rejecting busy ACKs', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.ackResults = [ACK_RESULT.ERR_BUSY, ACK_RESULT.OK];
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await service.setTriggerTestMode('vibration');
    const modeCommand = device.sentReports.at(-1);
    const testSnapshot = await service.testAdaptiveTriggers('weapon');
    const resetSnapshot = await service.resetAdaptiveTriggers();

    expect(modeCommand).toBeUndefined();
    expect(device.sentReports.at(-2)?.[7]).toBe(COMMAND_ID.TEST_ADAPTIVE_TRIGGERS);
    expect(device.sentReports.at(-2)?.[9]).toBe(1);
    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.RESET_ADAPTIVE_TRIGGERS);
    expect(testSnapshot.settings.triggerTestMode).toBe('vibration');
    expect(testSnapshot.diagnostics.lastError).toBe('Test is busy');
    expect(resetSnapshot.diagnostics.lastAck?.resultCode).toBe(ACK_RESULT.OK);
  });

  it('packs adaptive trigger target into the test command value', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await service.testAdaptiveTriggers('vibration', 'l2');
    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.TEST_ADAPTIVE_TRIGGERS);
    expect(device.sentReports.at(-1)?.[9]).toBe(0x02);
    expect(device.sentReports.at(-1)?.[10]).toBe(0x01);

    await service.testAdaptiveTriggers('feedback', 'r2');
    expect(device.sentReports.at(-1)?.[9]).toBe(0x00);
    expect(device.sentReports.at(-1)?.[10]).toBe(0x02);
  });

  it('rejects accepted setting commands that do not advance settings_revision', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.settingsRevision = 8;
    device.fixedAckRevision = 8;
    device.status = statusReport({
      controllerConnected: false,
      settingsRevision: 8
    });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    await expect(service.setHapticsGain(80)).rejects.toThrow('did not advance settings_revision');
  });
});
