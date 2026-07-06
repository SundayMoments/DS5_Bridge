import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACK_RESULT,
  AUDIO_DEBUG_EVENT,
  CHORD_FUNCTION_EVENT_BASE,
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
  process.env.DS5_BRIDGE_AUDIO_DEBUG_DIAGNOSTICS = '1';

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

const winUsbTransportMock = vi.hoisted(() => ({
  open: vi.fn(async () => {
    const listedPath = hidMock.state.devicesList[0]?.path;
    const device = (typeof listedPath === 'string' ? hidMock.state.openDevices.get(listedPath) : null)
      ?? hidMock.state.openDevices.values().next().value;
    if (!device) {
      throw new Error('No WinUSB bridge transport');
    }
    return device;
  })
}));

const audioHelperMock = vi.hoisted(() => ({
  playBridgeHapticsTestPattern: vi.fn(async () => undefined),
  playBridgeSpeakerTestTone: vi.fn(async () => undefined)
}));

vi.mock('node-hid', () => ({
  default: {
    devices: hidMock.devices,
    HID: hidMock.HID
  }
}));

vi.mock('./winusb-companion-transport', () => ({
  WinUsbCompanionTransport: {
    open: winUsbTransportMock.open
  }
}));

vi.mock('./audio-helper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./audio-helper')>();
  return {
    ...actual,
    playBridgeHapticsTestPattern: audioHelperMock.playBridgeHapticsTestPattern,
    playBridgeSpeakerTestTone: audioHelperMock.playBridgeSpeakerTestTone
  };
});

import { BridgeService } from './bridge-service';
import { SettingsStore } from './settings-store';

type StatusOverrides = {
  controllerConnected?: boolean;
  batteryPercent?: number;
  speakerVolumePercent?: number;
  speakerGainLevel?: number;
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
  hostPersonaMode?: 'dualsense' | 'xbox' | 'ds4';
  supportedHostPersonaModesMask?: number;
  micMuted?: boolean;
};

const FULL_REAPPLY_COMMANDS = [
  COMMAND_ID.SET_LIGHTBAR_COLOR,
  COMMAND_ID.SET_LIGHTBAR_OVERRIDE,
  COMMAND_ID.SET_MUTE_BUTTON_ACTION,
  COMMAND_ID.SET_HAPTICS_GAIN,
  COMMAND_ID.SET_HAPTICS_BUFFER_LENGTH,
  COMMAND_ID.SET_AUDIO_REACTIVE_HAPTICS,
  COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN,
  COMMAND_ID.SET_CLASSIC_RUMBLE_V1,
  COMMAND_ID.SET_TRIGGER_EFFECT_INTENSITY,
  COMMAND_ID.SET_SPEAKER_GAIN,
  COMMAND_ID.SET_SPEAKER_VOLUME,
  COMMAND_ID.SET_DUPLEX_ENABLED,
  COMMAND_ID.SET_MIC_VOLUME,
  COMMAND_ID.SET_MIC_MUTE,
  COMMAND_ID.SET_LED_ENABLED,
  COMMAND_ID.SET_PLAYER_LED_ENABLED,
  COMMAND_ID.SET_IDLE_DISCONNECT_ENABLED,
  COMMAND_ID.SET_IDLE_DISCONNECT_TIMEOUT,
  COMMAND_ID.SET_USB_SUSPEND_DISCONNECT_ENABLED,
  COMMAND_ID.SET_SLEEP_KEYBIND_ENABLED,
  COMMAND_ID.SET_SPEAKER_VOLUME_SHORTCUT_ENABLED,
  COMMAND_ID.SET_BUTTON_REMAP,
  COMMAND_ID.SET_CHORD_BINDINGS,
  COMMAND_ID.SET_POLLING_RATE_MODE,
  COMMAND_ID.SET_HOST_PERSONA
];

class MockHidDevice extends EventEmitter {
  path = 'winusb-path';
  status = statusReport();
  audioDebugReports: number[][] = [];
  audioStatsReports: number[][] = [];
  audioStatusReports: number[][] = [];
  shortcutEvents: number[] = [];
  shortcutReadError: Error | null = null;
  featureReportIds: number[] = [];
  sentReports: number[][] = [];
  outReports: number[][] = [];
  ackResults: number[] = [];
  ackReports: number[][] = [];
  writeError: Error | null = null;
  statusReadError: Error | null = null;
  ackReadErrorOnce: Error | null = null;
  featureReportWriteErrorOnce: Error | null = null;
  closeCount = 0;
  settingsRevision = 0;
  fixedAckRevision: number | null = null;

  constructor() {
    super();
  }

  getFeatureReport(reportId: number, length: number): number[] {
    expect(length).toBe(REPORT_LENGTH);
    this.featureReportIds.push(reportId);
    if (reportId === REPORT_ID.STATUS) {
      if (this.statusReadError) {
        throw this.statusReadError;
      }
      return [...this.status];
    }
    if (reportId === REPORT_ID.ACK) {
      if (this.ackReadErrorOnce) {
        const error = this.ackReadErrorOnce;
        this.ackReadErrorOnce = null;
        throw error;
      }
      const queuedAck = this.ackReports.shift();
      if (queuedAck) {
        return [...queuedAck];
      }
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
    if (reportId === REPORT_ID.AUDIO_STATUS) {
      return [...(this.audioStatusReports.shift() ?? audioStatusReport())];
    }
    if (reportId === REPORT_ID.INPUT) {
      if (this.shortcutReadError) {
        throw this.shortcutReadError;
      }
      return shortcutEventReport(this.shortcutEvents.shift() ?? 0);
    }
    throw new Error(`Unexpected report ID: ${reportId}`);
  }

  sendFeatureReport(report: number[]): number {
    this.sentReports.push([...report]);
    if (this.featureReportWriteErrorOnce) {
      const error = this.featureReportWriteErrorOnce;
      this.featureReportWriteErrorOnce = null;
      throw error;
    }
    return report.length;
  }

  write(report: number[]): number {
    if (this.writeError) {
      throw this.writeError;
    }
    this.outReports.push([...report]);
    return report.length;
  }

  queueShortcutEvent(event: number): void {
    this.shortcutEvents.push(event);
  }

  close(): void {
    this.closeCount += 1;
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
  report[26] = overrides.firmwareMinor ?? 6;
  report[27] = overrides.firmwarePatch ?? 3;
  report[28] = overrides.firmwareFlags ?? 1;
  writeU16(report, 29, overrides.speakerVolumePercent ?? 30);
  writeU16(report, 43, overrides.idleDisconnectTimeoutMinutes ?? 15);
  report[48] = overrides.hostPersonaMode === 'xbox' ? 1 : overrides.hostPersonaMode === 'ds4' ? 2 : 0;
  report[49] = overrides.supportedHostPersonaModesMask ?? 0;
  report[51] = overrides.micMuted ? 1 : 0;
  report[57] = overrides.speakerGainLevel ?? 4;
  return report;
}

function ackReport(options: {
  commandId: number;
  sequence: number;
  result: number;
  settingsRevision: number;
  protocolMajor?: number;
  protocolMinor?: number;
}): number[] {
  const report = new Array<number>(REPORT_LENGTH).fill(0);
  report[0] = REPORT_ID.ACK;
  writeMagic(report);
  report[5] = options.protocolMajor ?? PROTOCOL_MAJOR;
  report[6] = options.protocolMinor ?? PROTOCOL_MINOR;
  report[7] = options.commandId;
  report[8] = options.sequence;
  report[9] = options.result;
  writeU16(report, 11, options.settingsRevision);
  writeU32(report, 13, 12);
  return report;
}

function shortcutEventReport(event = 0): number[] {
  const report = new Array<number>(REPORT_LENGTH).fill(0);
  report[0] = REPORT_ID.INPUT;
  report[1] = event;
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

function audioStatusReport(overrides: Partial<{
  duplexRequested: boolean;
  duplexActive: boolean;
  controllerStateReady: boolean;
  headsetPlugged: boolean;
  headsetAudioRoute: boolean;
  micUsbConcealCount: number;
  micPlcCount: number;
}> = {}): number[] {
  const report = new Array<number>(REPORT_LENGTH).fill(0);
  report[0] = REPORT_ID.AUDIO_STATUS;
  writeMagic(report);
  writeVersion(report);
  report[7] = 1;
  report[9] = (overrides.duplexRequested ? 0x10 : 0x00)
    | (overrides.duplexActive ? 0x20 : 0x00)
    | (overrides.controllerStateReady ? 0x40 : 0x00);
  report[10] = (overrides.headsetPlugged ? 0x01 : 0x00)
    | (overrides.headsetAudioRoute ? 0x02 : 0x00);
  writeU32(report, 49, overrides.micUsbConcealCount ?? 0);
  writeU32(report, 53, overrides.micPlcCount ?? 0);
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

async function pollShortcut(service: BridgeService): Promise<void> {
  await (service as unknown as { pollShortcutEvent(): Promise<void> }).pollShortcutEvent();
}

async function flushShortcutActions(service: BridgeService): Promise<void> {
  await (service as unknown as { shortcutActionQueue: Promise<void> }).shortcutActionQueue;
}

async function flushReapply(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function flushImmediate(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('BridgeService', () => {
  let tempDirs: string[] = [];
  let services: BridgeService[] = [];

  beforeEach(() => {
    hidMock.state.devicesList = [];
    hidMock.state.openDevices.clear();
    hidMock.devices.mockClear();
    hidMock.HID.mockClear();
    winUsbTransportMock.open.mockClear();
    audioHelperMock.playBridgeHapticsTestPattern.mockClear();
    audioHelperMock.playBridgeSpeakerTestTone.mockClear();
    tempDirs = [];
    services = [];
  });

  afterEach(async () => {
    await Promise.allSettled(services.map((service) => service.stop()));
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function serviceFixture(initialSettings?: Parameters<SettingsStore['update']>[0]): BridgeService {
    const fixture = createService(initialSettings);
    tempDirs.push(fixture.tempDir);
    services.push(fixture.service);
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

  it('treats WinUSB transport close as a bridge disconnect', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    device.emit('close');
    await flushImmediate();

    expect(service.getSnapshot().state).toBe('no-bridge');
    expect(service.getSnapshot().message).toBe('No bridge detected');
  });

  it('does not mark the bridge disconnected when optional shortcut feature polling fails', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.shortcutReadError = new Error('could not read from HID device');
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    expect(service.getSnapshot().state).toBe('connected');
    expect(service.getSnapshot().message).toBe('Companion firmware connected');
  });

  it('retries shortcut polling after a transient shortcut report read failure', async () => {
    const service = serviceFixture({
      duplexMicEnabled: true,
      micMuted: true,
      muteButtonMode: 'normal'
    });
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, micMuted: true });
    device.shortcutReadError = new Error('could not read from HID device');
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await pollShortcut(service);

    device.shortcutReadError = null;
    (service as unknown as { shortcutFeaturePollRetryAt: number }).shortcutFeaturePollRetryAt = 0;
    device.queueShortcutEvent(SHORTCUT_EVENT.MIC_MUTE_OFF);
    await pollShortcut(service);
    await flushImmediate();

    expect(service.getSnapshot().settings.micMuted).toBe(false);
  });

  it('does not start the companion interrupt input read loop', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    expect(device.listenerCount('data')).toBe(0);
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

  it('polls audio debug diagnostics during normal polling', async () => {
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
    expect(snapshot.diagnostics.audioDebugDroppedCount).toBe(3);
    expect(snapshot.diagnostics.audioDebugLogPath).toBeNull();
    expect(snapshot.diagnostics.audioDebugStats?.usbAudioGapMaxUs).toBe(2100);
    expect(snapshot.diagnostics.audioDebugLogLines).toEqual([
      '#7 t=123456us [Audio] RESET: gap detected audio_fifo=1 opus_ready=2 gap_ms=255+ packet=9 skip=2',
      '[AudioStats] version=1 usbAudioGapMaxUs=2100 usbAudioGapOver1500Count=0 opusEncodeMaxUs=0 opusEncodeOverBudgetCount=0 audio0x36EnqueueToSendMaxUs=0 audio0x36SendGapMaxUs=13000 audio0x36LateCountOver12000Us=0 audio0x36DropOldestCount=0 audioGenerationDropCount=0 nonAudioReportsBetweenAudioMax=3 btAudioQueueDepthMax=0 audio0x36EnqueuedCount=0 audio0x36SentCount=0 criticalStarvingAudioCount=0'
    ]);
    expect(device.featureReportIds).toContain(REPORT_ID.AUDIO_DEBUG);
    expect(device.featureReportIds).toContain(REPORT_ID.AUDIO_STATS);
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
    expect(badVersionService.getSnapshot().message).toBe('Firmware 1.6.1 update required');
    expect(badVersionService.getSnapshot().diagnostics.lastError).toContain('Firmware update required');
  });

  it('requires users to update pre-1.6.1 bridge firmware', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ firmwareMajor: 0, firmwareMinor: 5, firmwarePatch: 15 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    const snapshot = service.getSnapshot();
    expect(snapshot.state).toBe('incompatible');
    expect(snapshot.message).toBe('Firmware 1.6.1 update required');
    expect(snapshot.status?.firmwareVersion).toBe('0.5.15');
    expect(snapshot.diagnostics.lastError).toContain('Update the bridge firmware to 1.6.1 or newer');
    expect(snapshot.diagnostics.firmwareUpdateAvailable).toBeNull();
    expect(device.sentReports).toEqual([]);
  });

  it('surfaces a compatible older bridge firmware as an available update', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ firmwareMajor: 1, firmwareMinor: 6, firmwarePatch: 2 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    const snapshot = service.getSnapshot();
    expect(snapshot.state).toBe('connected');
    expect(snapshot.status?.firmwareVersion).toBe('1.6.2');
    expect(snapshot.diagnostics.lastError).toBeNull();
    expect(snapshot.diagnostics.firmwareUpdateAvailable).toEqual({
      currentVersion: '1.6.2',
      availableVersion: '1.6.3'
    });
  });

  it('does not surface an available update for the bundled bridge firmware', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ firmwareMajor: 1, firmwareMinor: 6, firmwarePatch: 3 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    const snapshot = service.getSnapshot();
    expect(snapshot.state).toBe('connected');
    expect(snapshot.status?.firmwareVersion).toBe('1.6.3');
    expect(snapshot.diagnostics.firmwareUpdateAvailable).toBeNull();
  });

  it('reapplies saved settings once per companion session and again after uptime drops', async () => {
    const service = serviceFixture();
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

  it('starts saved audio haptics after startup settings reapply', async () => {
    const appSource = {
      kind: 'app-session' as const,
      processId: 4321,
      displayName: 'Microsoft Edge',
      executableName: 'msedge.exe',
      processPath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    };
    const service = serviceFixture({
      audioReactiveHapticsEnabled: true,
      audioReactiveHapticsSource: appSource
    });
    const device = new MockHidDevice();
    device.settingsRevision = 4;
    device.status = statusReport({
      controllerConnected: true,
      hostPersonaMode: 'dualsense',
      settingsRevision: 4,
      uptimeSeconds: 30
    });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    const start = vi.fn(async () => undefined);
    const stop = vi.fn(async () => undefined);
    const internals = service as unknown as {
      systemAudioHapticsEngine: {
        start: typeof start;
        stop: typeof stop;
        isActive(): boolean;
      };
    };
    internals.systemAudioHapticsEngine = {
      start,
      stop,
      isActive: () => false
    };

    await poll(service);
    await flushReapply();

    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      source: appSource,
      gainPercent: 100
    }), 'dualsense');
  });

  it('ignores firmware-reported mic unmute when duplex mic is disabled', async () => {
    const service = serviceFixture({ duplexMicEnabled: false, micMuted: true });
    const device = new MockHidDevice();
    device.settingsRevision = 4;
    device.status = statusReport({
      controllerConnected: true,
      micMuted: false,
      settingsRevision: 4,
      uptimeSeconds: 30
    });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    expect(service.getSnapshot().settings.micMuted).toBe(true);

    await flushReapply();
    expect(device.sentReports.find((report) => report[7] === COMMAND_ID.SET_MIC_MUTE)?.[9]).toBe(1);

    device.status = statusReport({
      controllerConnected: true,
      micMuted: false,
      settingsRevision: device.settingsRevision,
      uptimeSeconds: 31
    });
    await poll(service);

    expect(service.getSnapshot().settings.micMuted).toBe(true);
  });

  it('syncs firmware-reported mic mute after startup settings reapply when duplex mic is enabled', async () => {
    const service = serviceFixture({ duplexMicEnabled: true, micMuted: true });
    const device = new MockHidDevice();
    device.settingsRevision = 4;
    device.status = statusReport({
      controllerConnected: true,
      micMuted: false,
      settingsRevision: 4,
      uptimeSeconds: 30
    });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    expect(service.getSnapshot().settings.micMuted).toBe(true);

    await flushReapply();
    expect(device.sentReports.find((report) => report[7] === COMMAND_ID.SET_MIC_MUTE)?.[9]).toBe(1);

    device.status = statusReport({
      controllerConnected: true,
      micMuted: false,
      settingsRevision: device.settingsRevision,
      uptimeSeconds: 31
    });
    await poll(service);

    expect(service.getSnapshot().settings.micMuted).toBe(false);
  });

  it('reapplies current settings without feature-bit fallbacks', async () => {
    const service = serviceFixture();
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

  it('plays test haptics through the bridge audio helper', async () => {
    const service = serviceFixture({ hapticsGainPercent: 130 });
    const device = new MockHidDevice();
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.testHaptics();

    expect(audioHelperMock.playBridgeHapticsTestPattern).toHaveBeenCalledWith(130, 'dualsense');
    expect(device.sentReports.some((report) => report[7] === COMMAND_ID.TEST_HAPTICS)).toBe(false);
    expect(snapshot.settings.hapticsGainPercent).toBe(130);
  });

  it.each([
    ['ds4' as const],
    ['xbox' as const]
  ])('plays test haptics through the %s persona audio endpoint', async (hostPersonaMode) => {
    const service = serviceFixture({ hapticsGainPercent: 130 });
    const device = new MockHidDevice();
    device.status = statusReport({ hostPersonaMode, supportedHostPersonaModesMask: 0x07 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await service.testHaptics();

    expect(audioHelperMock.playBridgeHapticsTestPattern).toHaveBeenCalledWith(130, hostPersonaMode);
  });

  it('skips test haptics while a host persona transition is active', async () => {
    const service = serviceFixture({ hapticsGainPercent: 130 });
    const device = new MockHidDevice();
    device.status = statusReport({
      controllerConnected: false,
      hostPersonaMode: 'dualsense',
      supportedHostPersonaModesMask: 0x07
    });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await service.setHostPersonaMode('xbox');
    const snapshot = await service.testHaptics();

    expect(audioHelperMock.playBridgeHapticsTestPattern).not.toHaveBeenCalled();
    expect(snapshot.personaTransition?.to).toBe('xbox');
    expect(snapshot.state).toBe('transitioning');
  });

  it('does not reject test haptics when the persona audio endpoint is still reconnecting', async () => {
    const service = serviceFixture({ hapticsGainPercent: 130 });
    const device = new MockHidDevice();
    device.status = statusReport({ hostPersonaMode: 'xbox', supportedHostPersonaModesMask: 0x07 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);
    audioHelperMock.playBridgeHapticsTestPattern.mockRejectedValueOnce(new Error(
      "Unhandled exception. System.InvalidOperationException: Render endpoint matching persona 'xbox' ('Xbox 360 Controller for Windows') was not found."
    ));

    await poll(service);
    const snapshot = await service.testHaptics();

    expect(audioHelperMock.playBridgeHapticsTestPattern).toHaveBeenCalledWith(130, 'xbox');
    expect(snapshot.settings.hapticsGainPercent).toBe(130);
  });

  it('plays test speaker through the current persona audio endpoint', async () => {
    const service = serviceFixture({ speakerVolumePercent: 65 });
    const device = new MockHidDevice();
    device.status = statusReport({ hostPersonaMode: 'xbox', supportedHostPersonaModesMask: 0x07 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await service.testSpeaker();

    expect(audioHelperMock.playBridgeSpeakerTestTone).toHaveBeenCalledWith(65, 'xbox');
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

  it('does not persist setting updates when firmware rejects the command', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.ackResults = [ACK_RESULT.ERR_INVALID_VALUE];
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await expect(service.setHapticsGain(80)).rejects.toThrow('Invalid value');

    const snapshot = service.getSnapshot();
    expect(snapshot.settings.hapticsGainPercent).toBe(100);
    expect(snapshot.settings.selectedPresetId).toBe('balanced');
    expect(snapshot.diagnostics.lastError).toBe('Invalid value');
    expect(snapshot.diagnostics.lastAck?.resultCode).toBe(ACK_RESULT.ERR_INVALID_VALUE);
  });

  it('rejects stale ACKs instead of applying them to a different command', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, settingsRevision: 10 });
    device.settingsRevision = 10;
    device.ackReports.push(ackReport({
      commandId: COMMAND_ID.SET_SPEAKER_VOLUME,
      sequence: 99,
      result: ACK_RESULT.OK,
      settingsRevision: 11
    }));
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    await expect(service.setHapticsGain(80)).rejects.toThrow('Stale companion ACK');

    const snapshot = service.getSnapshot();
    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.SET_HAPTICS_GAIN);
    expect(snapshot.settings.hapticsGainPercent).toBe(100);
    expect(snapshot.diagnostics.settingsRevision).toBe(10);
    expect(snapshot.diagnostics.lastAck).toMatchObject({
      commandId: COMMAND_ID.SET_SPEAKER_VOLUME,
      commandSequence: 99,
      resultCode: ACK_RESULT.OK
    });
    expect(snapshot.diagnostics.lastError).toContain('expected command 0x01 sequence');
  });

  it('serializes overlapping companion commands before reading ACK reports', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    const internals = service as unknown as {
      device: MockHidDevice;
      sendCommand(commandId: number, value: number, options?: { extraPayload?: number[] }): Promise<{
        commandId: number;
        commandSequence: number;
      }>;
    };
    internals.device = device;

    const [lightbarAck, speakerAck] = await Promise.all([
      internals.sendCommand(COMMAND_ID.SET_LIGHTBAR_COLOR, 60, { extraPayload: [1, 2, 3] }),
      internals.sendCommand(COMMAND_ID.SET_SPEAKER_VOLUME, 80)
    ]);

    expect(lightbarAck.commandId).toBe(COMMAND_ID.SET_LIGHTBAR_COLOR);
    expect(speakerAck.commandId).toBe(COMMAND_ID.SET_SPEAKER_VOLUME);
    expect(lightbarAck.commandSequence).toBe(1);
    expect(speakerAck.commandSequence).toBe(2);
    expect(device.sentReports.map((report) => report[7])).toEqual([
      COMMAND_ID.SET_LIGHTBAR_COLOR,
      COMMAND_ID.SET_SPEAKER_VOLUME
    ]);
    expect(service.getSnapshot().diagnostics.lastError).toBeNull();
  });

  it('sends and stores mute button keyboard bindings', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, firmwareFlags: 0x21 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setMuteButtonAction('keyboard', 0x68, 0x02, 'hold', true);

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_MUTE_BUTTON_ACTION);
    expect(command?.[9]).toBe(1);
    expect(command?.[11]).toBe(0x68);
    expect(command?.[12]).toBe(0x92);
    expect(snapshot.settings.muteButtonMode).toBe('keyboard');
    expect(snapshot.settings.muteKeyboardUsage).toBe(0x68);
    expect(snapshot.settings.muteKeyboardModifiers).toBe(0x02);
    expect(snapshot.settings.muteKeyboardBehavior).toBe('hold');
    expect(snapshot.settings.muteKeyboardChordStarterEnabled).toBe(true);
  });

  it('sends and stores mute button chord mode', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, firmwareFlags: 0x21 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setMuteButtonAction('chord', 0x68, 0, 'tap');

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_MUTE_BUTTON_ACTION);
    expect(command?.[9]).toBe(3);
    expect(command?.[12]).toBe(0);
    expect(snapshot.settings.muteButtonMode).toBe('chord');
    expect(snapshot.settings.muteKeyboardChordStarterEnabled).toBe(false);
  });

  it('sends and stores clamped haptics buffer length', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, firmwareFlags: 0x41 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    let snapshot = await service.setHapticsBufferLength(2);

    let command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_HAPTICS_BUFFER_LENGTH);
    expect(command?.[9]).toBe(16);
    expect(snapshot.settings.hapticsBufferLength).toBe(16);

    snapshot = await service.setHapticsBufferLength(64);

    command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_HAPTICS_BUFFER_LENGTH);
    expect(command?.[9]).toBe(64);
    expect(snapshot.settings.hapticsBufferLength).toBe(64);

    snapshot = await service.setHapticsBufferLength(255);

    command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_HAPTICS_BUFFER_LENGTH);
    expect(command?.[9]).toBe(128);
    expect(snapshot.settings.hapticsBufferLength).toBe(128);
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
      controllerPowerSavingEnabled: true
    });
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false });
    device.audioStatusReports = [audioStatusReport({ headsetPlugged: true })];
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
      controllerPowerSavingEnabled: true,
      hapticsGainPercent: 100,
      classicRumbleGainPercent: 120,
      triggerEffectIntensityPercent: 80,
      lightbarBrightnessPercent: 90
    });
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false });
    device.audioStatusReports = [audioStatusReport({ headsetPlugged: false })];
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    expect(device.sentReports).toEqual([]);

    device.audioStatusReports = [audioStatusReport({ headsetPlugged: true })];
    await poll(service);
    expect(device.sentReports.map((report) => [report[7], report[9]])).toEqual([
      [COMMAND_ID.SET_HAPTICS_GAIN, 60],
      [COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN, 60],
      [COMMAND_ID.SET_TRIGGER_EFFECT_INTENSITY, 60],
      [COMMAND_ID.SET_AUDIO_REACTIVE_HAPTICS, 0],
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
    device.audioStatusReports = [audioStatusReport({ headsetPlugged: false })];
    await poll(service);
    expect(device.sentReports.map((report) => [report[7], report[9]])).toEqual([
      [COMMAND_ID.SET_HAPTICS_GAIN, 100],
      [COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN, 120],
      [COMMAND_ID.SET_TRIGGER_EFFECT_INTENSITY, 80],
      [COMMAND_ID.SET_AUDIO_REACTIVE_HAPTICS, 0],
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

  it('sends speaker gain as a global pinned firmware amp setting', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, firmwareFlags: 0x05 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setSpeakerGainLevel(6);

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_SPEAKER_GAIN);
    expect(command?.[9]).toBe(6);
    expect(snapshot.settings.speakerGainLevel).toBe(6);
    expect(snapshot.status?.speakerGainLevel).toBe(6);
    expect(snapshot.settings.controllerProfiles[0]?.settings).not.toHaveProperty('speakerGainLevel');
  });

  it('stores audio reactive haptics settings and enables firmware DSP only for bridge output passthrough', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setAudioReactiveHapticsConfig({
      enabled: true,
      mode: 'replace',
      gainPercent: 150,
      bassFocus: 'punchy',
      response: 'strong',
      attack: 'sharp',
      release: 'smooth'
    });

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_AUDIO_REACTIVE_HAPTICS);
    expect(command?.[9]).toBe(0);
    expect(command?.slice(11, 18)).toEqual([0x81, 150, 0, 2, 2, 3, 2]);
    expect(snapshot.settings).toMatchObject({
      audioReactiveHapticsEnabled: true,
      audioReactiveHapticsMode: 'replace',
      audioReactiveHapticsGainPercent: 150,
      audioReactiveHapticsBassFocus: 'punchy',
      audioReactiveHapticsResponse: 'strong',
      audioReactiveHapticsAttack: 'sharp',
      audioReactiveHapticsRelease: 'smooth'
    });

    await (service as unknown as {
      handleSystemAudioHapticsStatus(line: string): Promise<void>;
    }).handleSystemAudioHapticsStatus(
      "status: system-haptics-bypassed reason=source-is-bridge device='DS5 Bridge'"
    );
    const passthroughCommand = device.sentReports.at(-1);
    expect(passthroughCommand?.[7]).toBe(COMMAND_ID.SET_AUDIO_REACTIVE_HAPTICS);
    expect(passthroughCommand?.[9]).toBe(1);
    expect(passthroughCommand?.slice(11, 18)).toEqual([0x81, 150, 0, 2, 2, 3, 2]);
  });

  it('restarts system audio haptics immediately after a route change', async () => {
    const service = serviceFixture({
      audioReactiveHapticsEnabled: true
    });
    const device = new MockHidDevice();
    device.status = statusReport({ hostPersonaMode: 'ds4', supportedHostPersonaModesMask: 0x07 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    const start = vi.fn(async () => undefined);
    const stop = vi.fn(async () => undefined);
    const internals = service as unknown as {
      systemAudioHapticsEngine: {
        start: typeof start;
        stop: typeof stop;
        isActive(): boolean;
      };
      handleSystemAudioHapticsStatus(line: string): Promise<void>;
    };
    internals.systemAudioHapticsEngine = {
      start,
      stop,
      isActive: () => true
    };

    await internals.handleSystemAudioHapticsStatus('status: route-changed reason=default-render-changed');

    expect(stop).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      source: 'system-audio',
      gainPercent: 100
    }), 'ds4');
  });

  it('restarts system audio haptics after a host persona transition completes', async () => {
    const service = serviceFixture({
      audioReactiveHapticsEnabled: true
    });
    const device = new MockHidDevice();
    device.status = statusReport({
      controllerConnected: false,
      hostPersonaMode: 'dualsense',
      supportedHostPersonaModesMask: 0x07
    });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    const start = vi.fn(async () => undefined);
    const stop = vi.fn(async () => undefined);
    const getDefaultRenderEndpointStatus = vi.fn(async () => ({
      deviceName: 'Speakers (Yeti Classic)',
      isBridgeEndpoint: false
    }));
    const internals = service as unknown as {
      systemAudioHapticsEngine: {
        start: typeof start;
        stop: typeof stop;
        isActive(): boolean;
      };
      getDefaultRenderEndpointStatus: typeof getDefaultRenderEndpointStatus;
    };
    internals.systemAudioHapticsEngine = {
      start,
      stop,
      isActive: () => false
    };
    internals.getDefaultRenderEndpointStatus = getDefaultRenderEndpointStatus;

    await service.setHostPersonaMode('xbox');
    expect(stop).toHaveBeenCalledOnce();

    stop.mockClear();
    device.status = statusReport({
      controllerConnected: true,
      hostPersonaMode: 'xbox',
      supportedHostPersonaModesMask: 0x07
    });
    await poll(service);

    expect(stop).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      source: 'system-audio',
      gainPercent: 100
    }), 'xbox');
  });

  it('preserves selected audio haptics app source on partial config updates', async () => {
    const appSource = {
      kind: 'app-session' as const,
      processId: 4321,
      displayName: 'Battlefront II',
      executableName: 'starwarsbattlefrontii.exe',
      processPath: 'C:\\Games\\Battlefront\\starwarsbattlefrontii.exe'
    };
    const service = serviceFixture({
      audioReactiveHapticsSource: appSource
    });
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setAudioReactiveHapticsConfig({
      gainPercent: 130
    });

    expect(snapshot.settings.audioReactiveHapticsSource).toEqual(appSource);
  });

  it('does not poll app audio sessions while the controller is disconnected', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);
    const monitor = (service as unknown as {
      audioHapticsSessionMonitor: {
        listSessions: () => Promise<unknown[]>;
        stop: () => Promise<void>;
      };
    }).audioHapticsSessionMonitor;
    const listSessions = vi.spyOn(monitor, 'listSessions').mockResolvedValue([{
      processId: 4321,
      displayName: 'Battlefront II'
    }]);
    const stop = vi.spyOn(monitor, 'stop').mockResolvedValue(undefined);

    await poll(service);

    await expect(service.listAudioHapticsSessions()).resolves.toEqual([]);
    expect(listSessions).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });

  it('does not request classic rumble suppression when audio reactive haptics is disabled', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await service.setAudioReactiveHapticsConfig({
      enabled: false,
      mode: 'replace'
    });

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_AUDIO_REACTIVE_HAPTICS);
    expect(command?.[9]).toBe(0);
    expect(command?.slice(11, 18)).toEqual([1, 100, 0, 1, 1, 1, 1]);
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

  it('sends and stores player slot LED settings', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: true });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await flushReapply();
    device.sentReports = [];
    const snapshot = await service.setPlayerLedEnabled(false);

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_PLAYER_LED_ENABLED);
    expect(command?.[9]).toBe(0);
    expect(snapshot.settings.playerLedEnabled).toBe(false);
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

    device.queueShortcutEvent(SHORTCUT_EVENT.SLEEP_CONTROLLER);
    await pollShortcut(service);
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

    device.queueShortcutEvent(SHORTCUT_EVENT.CONTROLLER_VOLUME_UP);
    await pollShortcut(service);
    await flushReapply();
    await flushReapply();

    expect(service.getSnapshot().settings.speakerVolumePercent).toBe(40);
    expect(service.getSnapshot().status?.speakerVolumePercent).toBe(40);
    const volumeCommand = device.sentReports.filter((report) => report[7] === COMMAND_ID.SET_SPEAKER_VOLUME).at(-1);
    expect(volumeCommand?.[9]).toBe(40);
  });

  it('applies notch chord functions through the normal setting command path', async () => {
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
    await service.setChordConfiguration([{
      id: 'speaker-up',
      name: 'Speaker Up',
      type: 'controller-setting',
      action: 'speaker-up',
      stepPercent: 25
    }], [{
      id: 'ps-triangle',
      kind: 'chord',
      starter: 'ps',
      button: 'triangle',
      functionId: 'speaker-up'
    }]);

    device.queueShortcutEvent(CHORD_FUNCTION_EVENT_BASE);
    await pollShortcut(service);
    await flushReapply();
    await flushReapply();

    expect(service.getSnapshot().settings.speakerVolumePercent).toBe(55);
    const volumeCommand = device.sentReports.filter((report) => report[7] === COMMAND_ID.SET_SPEAKER_VOLUME).at(-1);
    expect(volumeCommand?.[9]).toBe(55);
  });

  it('applies arbitrary whole-number chord steps without coarse slider notches', async () => {
    const service = serviceFixture({ hapticsGainPercent: 30 });
    const device = new MockHidDevice();
    device.status = statusReport({
      controllerConnected: false,
      settingsRevision: 4
    });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await service.setChordConfiguration([{
      id: 'haptics-up',
      name: 'Haptics Up',
      type: 'controller-setting',
      action: 'haptics-up',
      stepPercent: 3
    }], [{
      id: 'ps-triangle',
      kind: 'chord',
      starter: 'ps',
      button: 'triangle',
      functionId: 'haptics-up'
    }]);

    device.queueShortcutEvent(CHORD_FUNCTION_EVENT_BASE);
    await pollShortcut(service);
    await flushShortcutActions(service);

    expect(service.getSnapshot().settings.hapticsGainPercent).toBe(33);
    const hapticsCommand = device.sentReports.filter((report) => report[7] === COMMAND_ID.SET_HAPTICS_GAIN).at(-1);
    expect(hapticsCommand?.[9]).toBe(33);
  });

  it('applies host persona chord functions through the normal persona command path', async () => {
    const service = serviceFixture({ hostPersonaMode: 'dualsense' });
    const device = new MockHidDevice();
    device.status = statusReport({
      controllerConnected: false,
      hostPersonaMode: 'dualsense',
      supportedHostPersonaModesMask: 0x07
    });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await service.setChordConfiguration([{
      id: 'persona-xbox',
      name: 'Xbox Persona',
      type: 'controller-setting',
      action: 'persona-xbox',
      stepPercent: 10
    }], [{
      id: 'ps-options',
      kind: 'chord',
      starter: 'ps',
      button: 'options',
      functionId: 'persona-xbox'
    }]);

    device.queueShortcutEvent(CHORD_FUNCTION_EVENT_BASE);
    await pollShortcut(service);
    await flushShortcutActions(service);

    expect(service.getSnapshot().settings.hostPersonaMode).toBe('xbox');
    const personaCommand = device.sentReports.filter((report) => report[7] === COMMAND_ID.SET_HOST_PERSONA).at(-1);
    expect(personaCommand?.[9]).toBe(1);
  });

  it('applies controller mic mute events without waiting for a status poll', async () => {
    const service = serviceFixture({
      duplexMicEnabled: true,
      micMuted: true,
      muteButtonMode: 'normal'
    });
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, micMuted: true });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    device.queueShortcutEvent(SHORTCUT_EVENT.MIC_MUTE_OFF);
    await pollShortcut(service);

    expect(service.getSnapshot().settings.micMuted).toBe(false);
    expect(service.getSnapshot().status?.micMuted).toBe(false);
  });

  it('emits controller mic mute snapshots before mic keepalive refresh completes', async () => {
    const service = serviceFixture({
      duplexMicEnabled: true,
      micMuted: true,
      muteButtonMode: 'normal'
    });
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: true, micMuted: true });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    let releaseKeepalive!: () => void;
    const keepaliveRefresh = vi.fn(() => new Promise<void>((resolve) => {
      releaseKeepalive = resolve;
    }));
    (service as unknown as {
      updateMicKeepaliveEngine(controllerConnected: boolean): Promise<void>;
    }).updateMicKeepaliveEngine = keepaliveRefresh;
    const emittedMicStates: boolean[] = [];
    service.on('snapshot', (snapshot) => {
      emittedMicStates.push(snapshot.settings.micMuted);
    });

    device.queueShortcutEvent(SHORTCUT_EVENT.MIC_MUTE_OFF);
    await pollShortcut(service);
    await flushImmediate();

    expect(keepaliveRefresh).toHaveBeenCalledWith(true);
    expect(service.getSnapshot().settings.micMuted).toBe(false);
    expect(emittedMicStates).toContain(false);

    releaseKeepalive();
    await flushImmediate();
  });

  it('ignores controller mic mute events when mic pass-through is not armed', async () => {
    const service = serviceFixture({
      duplexMicEnabled: true,
      micMuted: true,
      muteButtonMode: 'keyboard'
    });
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, micMuted: true });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    device.queueShortcutEvent(SHORTCUT_EVENT.MIC_MUTE_OFF);
    await pollShortcut(service);

    expect(service.getSnapshot().settings.micMuted).toBe(true);
    expect(service.getSnapshot().status?.micMuted).toBe(true);
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

  it('sends and stores classic rumble v1 compatibility mode', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setClassicRumbleV1Enabled(true);

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_CLASSIC_RUMBLE_V1);
    expect(command?.[9]).toBe(1);
    expect(snapshot.settings.classicRumbleV1Enabled).toBe(true);
  });

  it('allows boosted haptics and rumble gains up to 500 percent', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    let snapshot = await service.setFeedbackBoostEnabled(true);
    expect(snapshot.settings.feedbackBoostEnabled).toBe(true);

    snapshot = await service.setHapticsGain(500);
    let command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_HAPTICS_GAIN);
    expect(command?.[9]).toBe(244);
    expect(command?.[10]).toBe(1);
    expect(snapshot.settings.hapticsGainPercent).toBe(500);

    snapshot = await service.setClassicRumbleGain(500);
    command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN);
    expect(command?.[9]).toBe(244);
    expect(command?.[10]).toBe(1);
    expect(snapshot.settings.classicRumbleGainPercent).toBe(500);

    snapshot = await service.setFeedbackBoostEnabled(false);
    expect(snapshot.settings.feedbackBoostEnabled).toBe(false);
    expect(snapshot.settings.hapticsGainPercent).toBe(200);
    expect(snapshot.settings.classicRumbleGainPercent).toBe(200);
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

  it('sends and stores host persona settings', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, supportedHostPersonaModesMask: 0x07 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setHostPersonaMode('xbox');

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_HOST_PERSONA);
    expect(command?.[9]).toBe(1);
    expect(snapshot.settings.hostPersonaMode).toBe('xbox');
  });

  it('sends and stores DS4 host persona settings', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, supportedHostPersonaModesMask: 0x07 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setHostPersonaMode('ds4');

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_HOST_PERSONA);
    expect(command?.[9]).toBe(2);
    expect(snapshot.settings.hostPersonaMode).toBe('ds4');
    expect(snapshot.message).toBe('Switching to DualShock 4 mode');
    expect(snapshot.personaTransition?.to).toBe('ds4');
  });

  it('restores controller default output after a host persona transition reconnects', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({
      controllerConnected: false,
      hostPersonaMode: 'dualsense',
      supportedHostPersonaModesMask: 0x07
    });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);
    await poll(service);

    const getDefaultRenderEndpointStatus = vi.fn(async () => ({
      deviceName: 'Speakers (DualSense Wireless Controller)',
      isBridgeEndpoint: true
    }));
    const setDefaultRenderBridgeEndpoint = vi.fn(async () => undefined);
    const internals = service as unknown as {
      getDefaultRenderEndpointStatus: typeof getDefaultRenderEndpointStatus;
      setDefaultRenderBridgeEndpoint(mode: 'dualsense' | 'xbox' | 'ds4'): Promise<void>;
    };
    internals.getDefaultRenderEndpointStatus = getDefaultRenderEndpointStatus;
    internals.setDefaultRenderBridgeEndpoint = setDefaultRenderBridgeEndpoint;

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      await service.setHostPersonaMode('ds4');
      expect(getDefaultRenderEndpointStatus).toHaveBeenCalledOnce();
      expect(setDefaultRenderBridgeEndpoint).not.toHaveBeenCalled();

      device.status = statusReport({
        controllerConnected: false,
        hostPersonaMode: 'ds4',
        supportedHostPersonaModesMask: 0x07
      });
      nowSpy.mockReturnValue(1_000_050);
      await poll(service);
      expect(setDefaultRenderBridgeEndpoint).toHaveBeenCalledOnce();
      expect(setDefaultRenderBridgeEndpoint).toHaveBeenCalledWith('ds4');

      nowSpy.mockReturnValue(1_001_251);
      await poll(service);
      expect(setDefaultRenderBridgeEndpoint).toHaveBeenCalledOnce();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('masks transient bridge loss during host persona re-enumeration', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({
      controllerConnected: false,
      hostPersonaMode: 'dualsense',
      supportedHostPersonaModesMask: 0x07
    });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const switchingSnapshot = await service.setHostPersonaMode('xbox');

    expect(switchingSnapshot.state).toBe('transitioning');
    expect(switchingSnapshot.message).toBe('Switching to Xbox Controller mode');
    expect(switchingSnapshot.personaTransition).toMatchObject({
      from: 'dualsense',
      to: 'xbox'
    });
    expect(switchingSnapshot.diagnostics.lastError).toBeNull();

    device.statusReadError = new Error('No WinUSB bridge transport');
    await poll(service);

    const maskedSnapshot = service.getSnapshot();
    expect(maskedSnapshot.state).toBe('transitioning');
    expect(maskedSnapshot.message).toBe('Switching to Xbox Controller mode');
    expect(maskedSnapshot.diagnostics.lastError).toBeNull();
    expect(maskedSnapshot.personaTransition?.to).toBe('xbox');
  });

  it('keeps transition status when the WinUSB helper closes during host persona re-enumeration', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({
      controllerConnected: false,
      hostPersonaMode: 'dualsense',
      supportedHostPersonaModesMask: 0x07
    });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    await service.setHostPersonaMode('xbox');
    device.emit('close');
    await flushImmediate();

    const maskedSnapshot = service.getSnapshot();
    expect(maskedSnapshot.state).toBe('transitioning');
    expect(maskedSnapshot.message).toBe('Switching to Xbox Controller mode');
    expect(maskedSnapshot.diagnostics.lastError).toBeNull();
    expect(maskedSnapshot.personaTransition?.to).toBe('xbox');
  });

  it('uses a short rediscovery retry while a host persona transition is active', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({
      controllerConnected: false,
      hostPersonaMode: 'dualsense',
      supportedHostPersonaModesMask: 0x07
    });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('xbox-path', device);

    await poll(service);
    await service.setHostPersonaMode('xbox');
    device.statusReadError = new Error('WinUSB path vanished');
    await poll(service);

    device.statusReadError = null;
    hidMock.state.devicesList = [companionDeviceInfo('xbox-path')];
    await poll(service);

    expect(winUsbTransportMock.open).toHaveBeenLastCalledWith({ retryTimeoutMs: 250 });
    expect(service.getSnapshot().state).toBe('transitioning');
  });

  it('keeps a reconnecting grace state before reporting no bridge after a host persona switch', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      const service = serviceFixture();
      const device = new MockHidDevice();
      device.status = statusReport({
        controllerConnected: false,
        hostPersonaMode: 'dualsense',
        supportedHostPersonaModesMask: 0x07
      });
      hidMock.state.devicesList = [companionDeviceInfo()];
      hidMock.state.openDevices.set('companion-path', device);

      await poll(service);
      const switchingSnapshot = await service.setHostPersonaMode('xbox');
      const deadlineAt = switchingSnapshot.personaTransition?.deadlineAt ?? 1_008_000;

      device.statusReadError = new Error('WinUSB path vanished');
      nowSpy.mockReturnValue(deadlineAt + 1);
      await poll(service);

      const reconnectingSnapshot = service.getSnapshot();
      expect(reconnectingSnapshot.state).toBe('transitioning');
      expect(reconnectingSnapshot.message).toBe('Please wait, reconnecting to Xbox Controller mode');
      expect(reconnectingSnapshot.diagnostics.lastError).toBeNull();
      expect(reconnectingSnapshot.personaTransition?.to).toBe('xbox');

      nowSpy.mockReturnValue(deadlineAt + 5001);
      await poll(service);

      expect(service.getSnapshot().state).toBe('no-bridge');
      expect(service.getSnapshot().message).toBe('No bridge detected');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('keeps reconnecting grace if the bridge drops after the target persona was seen', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      const service = serviceFixture();
      const device = new MockHidDevice();
      device.status = statusReport({
        controllerConnected: false,
        hostPersonaMode: 'dualsense',
        supportedHostPersonaModesMask: 0x07
      });
      hidMock.state.devicesList = [companionDeviceInfo()];
      hidMock.state.openDevices.set('companion-path', device);

      await poll(service);
      await flushReapply();
      await service.setHostPersonaMode('xbox');

      device.status = statusReport({
        controllerConnected: false,
        hostPersonaMode: 'xbox',
        supportedHostPersonaModesMask: 0x07
      });
      nowSpy.mockReturnValue(1_000_500);
      await poll(service);

      expect(service.getSnapshot().state).toBe('connected');
      expect(service.getSnapshot().message).toBe('Companion firmware connected');

      nowSpy.mockReturnValue(1_001_701);
      await poll(service);

      expect(service.getSnapshot().state).toBe('connected');
      expect(service.getSnapshot().personaTransition).toBeNull();

      device.statusReadError = new Error('WinUSB path vanished after target persona was seen');
      nowSpy.mockReturnValue(1_001_800);
      await poll(service);

      const reconnectingSnapshot = service.getSnapshot();
      expect(reconnectingSnapshot.state).toBe('transitioning');
      expect(reconnectingSnapshot.message).toBe('Please wait, reconnecting to Xbox Controller mode');
      expect(reconnectingSnapshot.diagnostics.lastError).toBeNull();
      expect(reconnectingSnapshot.personaTransition?.to).toBe('xbox');

      nowSpy.mockReturnValue(1_006_702);
      await poll(service);

      expect(service.getSnapshot().state).toBe('no-bridge');
      expect(service.getSnapshot().message).toBe('No bridge detected');
    } finally {
      nowSpy.mockRestore();
    }
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

  it('sends Pico bootloader command and tolerates the expected transport drop', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    device.ackReadErrorOnce = new Error('WinUSB bridge GET_REPORT failed: A device attached to the system is not functioning.');
    await service.mountPicoBootloader();

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.ENTER_BOOTLOADER);
    expect(command?.[9]).toBe(0);
    expect(device.closeCount).toBe(1);
    expect(service.getSnapshot().diagnostics.lastAck?.resultCode).toBe(ACK_RESULT.OK);
  });

  it('sends Pico bootloader command using an older incompatible firmware protocol minor', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    const oldMinor = PROTOCOL_MINOR - 1;
    device.status = statusReport({ protocolMinor: oldMinor });
    device.ackReports.push(ackReport({
      commandId: COMMAND_ID.ENTER_BOOTLOADER,
      sequence: 1,
      result: ACK_RESULT.OK,
      settingsRevision: 0,
      protocolMinor: oldMinor
    }));
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    expect(service.getSnapshot().state).toBe('incompatible');

    await service.mountPicoBootloader();

    const command = device.sentReports.find((report) => report[7] === COMMAND_ID.ENTER_BOOTLOADER);
    expect(command?.[5]).toBe(PROTOCOL_MAJOR);
    expect(command?.[6]).toBe(oldMinor);
    expect(command?.[7]).toBe(COMMAND_ID.ENTER_BOOTLOADER);
    expect(command?.[9]).toBe(0);
    expect(service.getSnapshot().diagnostics.lastAck?.protocolVersion).toBe(`${PROTOCOL_MAJOR}.${oldMinor}`);
  });

  it('tolerates Pico bootloader transport loss while sending the command', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);

    device.featureReportWriteErrorOnce = new Error('WinUSB bridge helper request timed out.');
    await service.mountPicoBootloader();

    const command = device.sentReports.at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.ENTER_BOOTLOADER);
    expect(command?.[9]).toBe(0);
    expect(device.closeCount).toBe(1);
    expect(service.getSnapshot().diagnostics.lastAck?.resultCode).toBe(ACK_RESULT.OK);
  });

  it('stores notification preferences without sending firmware commands', async () => {
    const service = serviceFixture();

    let snapshot = await service.setNotifyControllerConnection(true);
    expect(snapshot.settings.notifyControllerConnection).toBe(true);

    snapshot = await service.setNotifyLowBattery(true);
    expect(snapshot.settings.notifyLowBattery).toBe(true);
  });

  it('emits controller connect and disconnect toasts on status transitions', async () => {
    const service = serviceFixture();
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
    const service = serviceFixture();
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: true });
    const toasts: Array<{ title: string; body: string }> = [];
    service.on('toast', (toast) => toasts.push(toast));
    await service.setNotifyControllerConnection(true);
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    expect(toasts).toEqual([]);

    device.emit('close');
    await flushImmediate();
    expect(toasts.at(-1)?.body).toBe('Controller disconnected');

    device.status = statusReport({ controllerConnected: true, uptimeSeconds: 1 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    await poll(service);
    expect(toasts.at(-1)?.body).toBe('Controller connected');
    expect(toasts).toHaveLength(2);
  });

  it('emits low battery toasts once until battery recovers', async () => {
    const service = serviceFixture();
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

    expect(device.sentReports.slice(-6).map((report) => [report[7], report[9]])).toEqual([
      [COMMAND_ID.SET_HAPTICS_GAIN, 0],
      [COMMAND_ID.SET_AUDIO_REACTIVE_HAPTICS, 0],
      [COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN, 0],
      [COMMAND_ID.SET_SPEAKER_VOLUME, 0],
      [COMMAND_ID.SET_TRIGGER_EFFECT_INTENSITY, 0],
      [COMMAND_ID.RESET_ADAPTIVE_TRIGGERS, 0]
    ]);
    expect(snapshot.settings.hapticsEnabled).toBe(false);
    expect(snapshot.settings.classicRumbleEnabled).toBe(false);
    expect(snapshot.settings.speakerEnabled).toBe(false);
    expect(snapshot.settings.adaptiveTriggersEnabled).toBe(false);
  });

  it('re-enables haptics when a positive gain is applied from an off state', async () => {
    const service = serviceFixture({
      hapticsEnabled: false,
      hapticsGainPercent: 0
    });
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, firmwareFlags: 0x85 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setHapticsGain(100);

    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.SET_HAPTICS_GAIN);
    expect(device.sentReports.at(-1)?.[9]).toBe(100);
    expect(snapshot.settings.hapticsEnabled).toBe(true);
    expect(snapshot.settings.hapticsGainPercent).toBe(100);
  });

  it('sends a positive haptics gain when moving up from an enabled zero state', async () => {
    const service = serviceFixture({
      hapticsEnabled: true,
      hapticsGainPercent: 0
    });
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, firmwareFlags: 0x85 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setHapticsGain(100);

    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.SET_HAPTICS_GAIN);
    expect(device.sentReports.at(-1)?.[9]).toBe(100);
    expect(snapshot.settings.hapticsEnabled).toBe(true);
    expect(snapshot.settings.hapticsGainPercent).toBe(100);
  });

  it('preserves an explicit zero haptics gain when toggling the feature on', async () => {
    const service = serviceFixture({
      hapticsEnabled: false,
      hapticsGainPercent: 0
    });
    const device = new MockHidDevice();
    device.status = statusReport({ controllerConnected: false, firmwareFlags: 0x85 });
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    const snapshot = await service.setHapticsEnabled(true);

    expect(device.sentReports.at(-2)?.[7]).toBe(COMMAND_ID.SET_HAPTICS_GAIN);
    expect(device.sentReports.at(-2)?.[9]).toBe(0);
    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.SET_AUDIO_REACTIVE_HAPTICS);
    expect(device.sentReports.at(-1)?.[9]).toBe(0);
    expect(snapshot.settings.hapticsEnabled).toBe(true);
    expect(snapshot.settings.hapticsGainPercent).toBe(0);
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
    await service.setButtonRemap('cross', 'circle');
    const snapshot = await service.setButtonRemap('rfn', 'ps');

    const command = device.sentReports.filter((report) => report[7] === COMMAND_ID.SET_BUTTON_REMAP).at(-1);
    expect(command?.[7]).toBe(COMMAND_ID.SET_BUTTON_REMAP);
    expect(command?.[9]).toBe(0);
    expect(command?.[11 + 13]).toBe(12);
    expect(command?.[11 + 16]).toBe(14);
    expect(command?.[11 + 19]).toBe(20);
    expect(snapshot.settings.buttonRemappingDraft.cross).toBe('circle');
    expect(snapshot.settings.buttonRemappingDraft.lb).toBe('square');
    expect(snapshot.settings.buttonRemappingDraft.rfn).toBe('ps');
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

  it('packs adaptive trigger lab preview parameters', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await service.previewAdaptiveTriggerEffect({
      mode: 'weapon',
      target: 'both',
      startPercent: 18,
      wallPercent: 62,
      forcePercent: 85
    });

    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.PREVIEW_ADAPTIVE_TRIGGER_EFFECT);
    expect(device.sentReports.at(-1)?.[9]).toBe(0x01);
    expect(device.sentReports.at(-1)?.[10]).toBe(0x00);
    expect(device.sentReports.at(-1)?.[11]).toBe(18);
    expect(device.sentReports.at(-1)?.[12]).toBe(62);
    expect(device.sentReports.at(-1)?.[13]).toBe(85);
  });

  it('normalizes adaptive trigger preview input before packing the command', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await service.previewAdaptiveTriggerEffect({
      mode: 'invalid-mode',
      target: 'invalid-target',
      startPercent: -12,
      wallPercent: 160.4,
      forcePercent: Number.NaN
    } as never);

    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.PREVIEW_ADAPTIVE_TRIGGER_EFFECT);
    expect(device.sentReports.at(-1)?.[9]).toBe(0x00);
    expect(device.sentReports.at(-1)?.[10]).toBe(0x00);
    expect(device.sentReports.at(-1)?.[11]).toBe(0);
    expect(device.sentReports.at(-1)?.[12]).toBe(100);
    expect(device.sentReports.at(-1)?.[13]).toBe(0);
  });

  it('packs persistent adaptive trigger lab parameters', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await service.applyAdaptiveTriggerEffect({
      mode: 'vibration',
      target: 'r2',
      startPercent: 25,
      wallPercent: 50,
      forcePercent: 75
    });

    expect(device.sentReports.at(-1)?.[7]).toBe(COMMAND_ID.APPLY_ADAPTIVE_TRIGGER_EFFECT);
    expect(device.sentReports.at(-1)?.[9]).toBe(0x02);
    expect(device.sentReports.at(-1)?.[10]).toBe(0x02);
    expect(device.sentReports.at(-1)?.[11]).toBe(25);
    expect(device.sentReports.at(-1)?.[12]).toBe(50);
    expect(device.sentReports.at(-1)?.[13]).toBe(75);
  });

  it('publishes local audio status reads into the snapshot immediately', async () => {
    const service = serviceFixture();
    const device = new MockHidDevice();
    hidMock.state.devicesList = [companionDeviceInfo()];
    hidMock.state.openDevices.set('companion-path', device);

    await poll(service);
    expect(service.getSnapshot().diagnostics.audioStatus).toMatchObject({
      duplexRequested: false,
      headsetPlugged: false
    });

    device.audioStatusReports = [
      audioStatusReport({
        controllerStateReady: true,
        duplexRequested: true,
        duplexActive: true,
        headsetPlugged: true,
        headsetAudioRoute: true
      })
    ];

    await (service as unknown as { readAudioStatus(): Promise<void> }).readAudioStatus();

    expect(service.getSnapshot().diagnostics.audioStatus).toMatchObject({
      controllerStateReady: true,
      duplexRequested: true,
      duplexActive: true,
      headsetPlugged: true,
      headsetAudioRoute: true
    });
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
