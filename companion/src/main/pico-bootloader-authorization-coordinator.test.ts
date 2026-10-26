import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ACK_RESULT,
  COMMAND_ID,
  MAGIC,
  PROTOCOL_MAJOR,
  PROTOCOL_MINOR,
  REPORT_ID,
  REPORT_LENGTH
} from '../shared/protocol';
import type { BridgeAckPayload } from '../shared/protocol';
import type { BootloaderConfirmationPresentation } from '../shared/types';
import type { BootloaderAuthorizationKeyRecord, BootloaderAuthorizationStorePort } from './bootloader-authorization-store';
import { PicoBootloaderAuthorizationCoordinator } from './pico-bootloader-authorization-coordinator';

const BOARD_ID = '1011121314151617';
// The message the firmware MACs (src/bootloader_maintenance.cpp), for key id
// deadbeef, nonce 00..0f, challenge id 0x01020304 and REVOKE (0x53):
// domain | board id | nonce | challenge id LE | command | key id.
// tests/firmware/bootloader_maintenance_test.cpp asserts the same bytes.
const KNOWN_MESSAGE_HEX = '4453354252494447452d424f4f543100'
  + '1011121314151617'
  + '000102030405060708090a0b0c0d0e0f'
  + '04030201'
  + '53'
  + 'deadbeef';

function header(reportId: number, minor = PROTOCOL_MINOR): number[] {
  const report = new Array<number>(REPORT_LENGTH).fill(0);
  report[0] = reportId;
  for (let index = 0; index < 4; index += 1) report[1 + index] = MAGIC.charCodeAt(index);
  report[5] = PROTOCOL_MAJOR;
  report[6] = minor;
  return report;
}

function writeU32(report: number[], offset: number, value: number): void {
  for (let index = 0; index < 4; index += 1) report[offset + index] = (value >>> (8 * index)) & 0xff;
}

// Emulates the bridge firmware's bootloader authorization, including the
// controller sequence, which "the user" enters while the coordinator waits.
class FakeBridge {
  controllerConnected = true;
  minor = PROTOCOL_MINOR;
  key: BootloaderAuthorizationKeyRecord | null = null;
  pendingKey: BootloaderAuthorizationKeyRecord | null = null;
  purpose: 'none' | 'enrollment' | 'entry' = 'none';
  confirmed = false;
  challengeId = 0;
  challengeActive = false;
  nonce = Array.from({ length: 16 }, (_, index) => index);
  commands: number[] = [];
  enteredBootloader = false;
  userEntersSequence = true;

  readFeatureReport = async (reportId: number): Promise<number[]> => {
    if (reportId === REPORT_ID.ACK) return header(REPORT_ID.ACK, this.minor);
    if (reportId === REPORT_ID.DEVICE_IDENTITY) {
      const report = header(REPORT_ID.DEVICE_IDENTITY);
      report[7] = 2;
      Buffer.from(BOARD_ID, 'hex').forEach((value, index) => { report[56 + index] = value; });
      return report;
    }
    const report = header(REPORT_ID.BOOTLOADER_AUTHORIZATION);
    report[7] = 3;
    const confirming = this.purpose !== 'none';
    report[8] = (this.key ? 0x01 : 0)
      | (this.purpose === 'enrollment' ? 0x02 : 0)
      | (this.purpose === 'enrollment' && this.confirmed ? 0x04 : 0)
      | (this.challengeActive ? 0x08 : 0)
      | (this.purpose === 'entry' && !this.confirmed ? 0x20 : 0)
      | (this.purpose === 'entry' && this.confirmed ? 0x40 : 0);
    this.key?.keyId.forEach((value, index) => { report[9 + index] = value; });
    if (this.challengeActive) {
      writeU32(report, 13, this.challengeId);
      this.nonce.forEach((value, index) => { report[17 + index] = value; });
      writeU32(report, 33, 10_000);
    }
    if (confirming) {
      [0, 1, 2, 3, 0, 1, 2, 3].forEach((value, index) => { report[37 + index] = value; });
      writeU32(report, 49, 30_000);
    }
    return report;
  };

  private verify(commandId: number, payload: ArrayLike<number> | undefined): boolean {
    const wasActive = this.challengeActive;
    this.challengeActive = false;
    if (!this.key || !wasActive || !payload) return false;
    const message = Buffer.alloc(49);
    Buffer.from('DS5BRIDGE-BOOT1\0', 'ascii').copy(message);
    Buffer.from(BOARD_ID, 'hex').copy(message, 16);
    Buffer.from(this.nonce).copy(message, 24);
    message.writeUInt32LE(this.challengeId, 40);
    message[44] = commandId;
    Buffer.from(this.key.keyId).copy(message, 45);
    const expected = createHmac('sha256', this.key.secret).update(message).digest();
    const bytes = Buffer.from(Array.from(payload));
    return bytes.subarray(0, 4).equals(Buffer.from(this.key.keyId))
      && bytes.readUInt32LE(4) === this.challengeId
      && bytes.subarray(8, 40).equals(expected);
  }

  sendCommand = async (commandId: number, _value: number, options: { extraPayload?: ArrayLike<number> } = {}): Promise<BridgeAckPayload> => {
    this.commands.push(commandId);
    const ack = (resultCode: number): BridgeAckPayload => ({
      commandId,
      commandSequence: 0,
      resultCode: resultCode as BridgeAckPayload['resultCode'],
      detailCode: 0,
      settingsRevision: 0,
      uptimeSeconds: 0,
      protocolVersion: `${PROTOCOL_MAJOR}.${this.minor}`
    });
    const payload = options.extraPayload;
    switch (commandId) {
      case COMMAND_ID.BOOTLOADER_AUTH_ENROLL_BEGIN:
        if (!this.controllerConnected) return ack(ACK_RESULT.ERR_NOT_CONNECTED);
        this.pendingKey = { keyId: Array.from(payload!).slice(0, 4), secret: Buffer.from(Array.from(payload!).slice(4, 36)) };
        this.purpose = 'enrollment';
        this.confirmed = false;
        return ack(ACK_RESULT.OK);
      case COMMAND_ID.BOOTLOADER_AUTH_ENROLL_COMMIT:
        if (this.purpose !== 'enrollment' || !this.confirmed) return ack(ACK_RESULT.ERR_UNAUTHORIZED);
        this.key = this.pendingKey;
        this.purpose = 'entry';
        return ack(ACK_RESULT.OK);
      case COMMAND_ID.BOOTLOADER_AUTH_CHALLENGE:
        if (!this.key) return ack(ACK_RESULT.ERR_UNAUTHORIZED);
        this.challengeId += 1;
        this.challengeActive = true;
        return ack(ACK_RESULT.OK);
      case COMMAND_ID.BOOTLOADER_AUTH_PHYSICAL_BEGIN:
        if (!this.verify(commandId, payload)) return ack(ACK_RESULT.ERR_UNAUTHORIZED);
        this.purpose = 'entry';
        this.confirmed = false;
        return ack(ACK_RESULT.OK);
      case COMMAND_ID.BOOTLOADER_AUTH_CONFIRMATION_CANCEL:
        this.purpose = 'none';
        this.confirmed = false;
        return ack(ACK_RESULT.OK);
      case COMMAND_ID.ENTER_BOOTLOADER: {
        if (this.minor < 24) {
          this.enteredBootloader = true;
          return ack(ACK_RESULT.OK);
        }
        const valid = this.verify(commandId, payload) && this.purpose === 'entry' && this.confirmed;
        this.purpose = 'none';
        this.confirmed = false;
        this.enteredBootloader = valid;
        return ack(valid ? ACK_RESULT.OK : ACK_RESULT.ERR_UNAUTHORIZED);
      }
      default:
        return ack(ACK_RESULT.ERR_UNKNOWN_COMMAND);
    }
  };
}

class MemoryStore implements BootloaderAuthorizationStorePort {
  records = new Map<string, BootloaderAuthorizationKeyRecord>();
  get(id: string) { return this.records.get(id) ?? null; }
  set(id: string, record: BootloaderAuthorizationKeyRecord) { this.records.set(id, record); }
  delete(id: string) { this.records.delete(id); }
}

function coordinatorFor(bridge: FakeBridge, store: BootloaderAuthorizationStorePort | undefined, cancelled = () => false) {
  const shown: BootloaderConfirmationPresentation[] = [];
  let hidden = 0;
  let now = 0;
  const coordinator = new PicoBootloaderAuthorizationCoordinator({
    store,
    firmwareProtocolVersion: async () => ({ major: PROTOCOL_MAJOR, minor: bridge.minor }),
    readFeatureReport: bridge.readFeatureReport,
    sendCommand: bridge.sendCommand,
    showConfirmation: (presentation) => { shown.push(presentation); },
    hideConfirmation: () => { hidden += 1; },
    confirmationCancelled: cancelled,
    delay: async (milliseconds) => {
      now += milliseconds;
      if (bridge.userEntersSequence && bridge.purpose !== 'none') bridge.confirmed = true;
    },
    now: () => now
  });
  return { coordinator, shown, hidden: () => hidden };
}

describe('PicoBootloaderAuthorizationCoordinator', () => {
  it('enrolls on first use, then enters UF2 mode with the same controller sequence', async () => {
    const bridge = new FakeBridge();
    const store = new MemoryStore();
    const { coordinator, shown, hidden } = coordinatorFor(bridge, store);

    await coordinator.enter();

    expect(bridge.enteredBootloader).toBe(true);
    expect(store.get(BOARD_ID)?.secret).toHaveLength(32);
    expect(shown[0]).toMatchObject({ purpose: 'enrollment', sequence: ['triangle', 'circle', 'cross', 'square', 'triangle', 'circle', 'cross', 'square'] });
    expect(shown.some((presentation) => presentation.purpose === 'bootloader-entry')).toBe(false);
    expect(hidden()).toBeGreaterThan(0);
  });

  it('asks for a fresh controller sequence on every later entry', async () => {
    const bridge = new FakeBridge();
    const store = new MemoryStore();
    await coordinatorFor(bridge, store).coordinator.enter();
    bridge.enteredBootloader = false;
    bridge.commands = [];

    const { coordinator, shown } = coordinatorFor(bridge, store);
    await coordinator.enter();

    expect(bridge.enteredBootloader).toBe(true);
    expect(shown[0]?.purpose).toBe('bootloader-entry');
    expect(bridge.commands).toEqual([
      COMMAND_ID.BOOTLOADER_AUTH_CHALLENGE,
      COMMAND_ID.BOOTLOADER_AUTH_PHYSICAL_BEGIN,
      COMMAND_ID.BOOTLOADER_AUTH_CHALLENGE,
      COMMAND_ID.ENTER_BOOTLOADER
    ]);
  });

  it('keeps the plain command for firmware older than the authenticated protocol', async () => {
    const bridge = new FakeBridge();
    bridge.minor = 23;
    const { coordinator, shown } = coordinatorFor(bridge, new MemoryStore());

    await coordinator.enter();

    expect(bridge.commands).toEqual([COMMAND_ID.ENTER_BOOTLOADER]);
    expect(bridge.enteredBootloader).toBe(true);
    expect(shown).toHaveLength(0);
  });

  it('cancels the bridge confirmation when the user cancels', async () => {
    const bridge = new FakeBridge();
    bridge.userEntersSequence = false;
    const { coordinator } = coordinatorFor(bridge, new MemoryStore(), () => true);

    await expect(coordinator.enter()).rejects.toThrow('cancelled');

    expect(bridge.commands.at(-1)).toBe(COMMAND_ID.BOOTLOADER_AUTH_CONFIRMATION_CANCEL);
    expect(bridge.enteredBootloader).toBe(false);
  });

  it('explains BOOTSEL when no controller can confirm', async () => {
    const bridge = new FakeBridge();
    bridge.controllerConnected = false;
    const { coordinator } = coordinatorFor(bridge, new MemoryStore());

    await expect(coordinator.enter()).rejects.toThrow('hold BOOTSEL');
    expect(bridge.enteredBootloader).toBe(false);
  });

  it('times out when the sequence is never entered', async () => {
    const bridge = new FakeBridge();
    bridge.userEntersSequence = false;
    const { coordinator } = coordinatorFor(bridge, new MemoryStore());

    await expect(coordinator.enter()).rejects.toThrow('timed out');
    expect(bridge.commands.at(-1)).toBe(COMMAND_ID.BOOTLOADER_AUTH_CONFIRMATION_CANCEL);
  });

  it('MACs the same message layout as the firmware', () => {
    const secret = Buffer.alloc(32, 0x42);
    const message = Buffer.alloc(49);
    Buffer.from('DS5BRIDGE-BOOT1\0', 'ascii').copy(message);
    Buffer.from(BOARD_ID, 'hex').copy(message, 16);
    Buffer.from(Array.from({ length: 16 }, (_, index) => index)).copy(message, 24);
    message.writeUInt32LE(0x01020304, 40);
    message[44] = COMMAND_ID.BOOTLOADER_AUTH_REVOKE;
    Buffer.from([0xde, 0xad, 0xbe, 0xef]).copy(message, 45);
    expect(message.toString('hex')).toBe(KNOWN_MESSAGE_HEX);
    expect(createHmac('sha256', secret).update(message).digest()).toHaveLength(32);
  });
});
