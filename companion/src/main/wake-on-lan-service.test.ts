import { describe, expect, it } from 'vitest';
import { ACK_RESULT } from '../shared/protocol';
import { WAKE_ON_LAN_OPERATION as OP, wakeOnLanCrc32 } from '../shared/wake-on-lan-protocol';
import type { WakeOnLanTarget } from '../shared/wake-on-lan-types';
import {
  WAKE_ON_LAN_CONNECTION_LOST_MESSAGE,
  WAKE_ON_LAN_DISCOVERY_FAILED_MESSAGE,
  WakeOnLanService,
  operationStage,
  wakeOnLanAckError,
  type WakeOnLanBridgeSession
} from './wake-on-lan-service';
import type { WakeOnLanTargetsPort } from './wake-on-lan-targets';

const MAC = '02:11:22:33:44:55';
const input = { ssid: 'Home', password: 'canary-secret', country: 'US', targetMac: MAC, enabled: true };

const u32 = (bytes: Uint8Array, offset: number) => (bytes[offset] | (bytes[offset + 1] << 8)
  | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

/** Firmware-shaped Wake-on-LAN engine: staging, test, commit, enable, forget. */
class EmulatedBridge {
  saved: Uint8Array | null = null;
  enabled = false;
  generation = 0;
  transaction = 0;
  staging: { id: number; crc: number; bytes: Uint8Array; written: number } | null = null;
  stage = 0;
  error = 0;
  radioActive = false;
  validated = false;
  testReadsRemaining = 0;
  testOutcome: 'pass' | 'auth-failure' = 'pass';
  commitAckLost = false;
  commands: number[] = [];
  payloads: number[][] = [];

  send(operation: number, payload: Uint8Array): void {
    this.commands.push(operation);
    this.payloads.push(Array.from(payload));
    const id = u32(payload, 0);
    switch (operation) {
      case OP.BEGIN:
        this.staging = { id, crc: u32(payload, 6), bytes: new Uint8Array(112), written: 0 };
        this.validated = false;
        return;
      case OP.WRITE: {
        if (!this.staging || this.staging.id !== id) throw new Error('Bridge rejected the command.');
        const offset = payload[4] | (payload[5] << 8);
        this.staging.bytes.set(payload.slice(7, 7 + payload[6]), offset);
        this.staging.written += payload[6];
        return;
      }
      case OP.TEST:
        if (!this.staging || wakeOnLanCrc32(this.staging.bytes) !== this.staging.crc) throw new Error('Bridge rejected the command.');
        this.stage = 10;
        this.radioActive = true;
        this.testReadsRemaining = 3;
        return;
      case OP.COMMIT:
        if (!this.staging || !this.validated) throw new Error('Bridge rejected the command.');
        this.saved = this.staging.bytes;
        this.enabled = this.saved[6] === 1;
        this.generation += 1;
        this.transaction = id;
        this.staging = null;
        this.validated = false;
        if (this.commitAckLost) {
          this.commitAckLost = false;
          throw new Error('The bridge did not acknowledge.');
        }
        return;
      case OP.ABORT:
        this.staging = null;
        this.radioActive = false;
        this.stage = 0;
        return;
      case OP.SET_ENABLED:
        if (id !== this.generation) throw new Error('Bridge rejected the command.');
        this.enabled = payload[4] === 1;
        this.generation += 1;
        return;
      case OP.FORGET:
        if (id !== this.generation) throw new Error('Bridge rejected the command.');
        this.saved = null;
        this.enabled = false;
        this.generation += 1;
        return;
      default:
        throw new Error('Unknown command.');
    }
  }

  read(): number[] {
    if (this.stage === 10 && --this.testReadsRemaining <= 0) {
      this.radioActive = false;
      if (this.testOutcome === 'pass') {
        this.stage = 0;
        this.validated = true;
      } else {
        this.stage = 8;
        this.error = 7;
      }
    }
    const report = new Uint8Array(64);
    report.set([0x1d, 68, 83, 53, 66, 1, 24, 1]);
    const configured = this.saved !== null;
    report[8] = (configured ? 1 : 0) | (this.enabled ? 2 : 0) | (configured ? 4 : 0)
      | (this.radioActive ? 8 : 0) | (this.staging ? 16 : 0) | (this.validated ? 32 : 0);
    report[9] = this.stage;
    report[10] = this.error;
    new DataView(report.buffer).setUint32(12, this.generation, true);
    new DataView(report.buffer).setUint32(16, this.staging?.id ?? this.transaction, true);
    if (this.saved) {
      report.set(this.saved.slice(8, 14), 20);
      report[26] = this.saved[2];
      report.set(this.saved.slice(14, 14 + this.saved[2]), 27);
      report.set([this.saved[4], this.saved[5], 1], 59);
    }
    return Array.from(report);
  }
}

class FakeTargets implements WakeOnLanTargetsPort {
  adapters: WakeOnLanTarget[] = [{ id: '{a}', name: 'Ethernet', mac: MAC, connected: true }];
  fail = false;
  refreshes = 0;
  async list(refresh = false): Promise<WakeOnLanTarget[]> {
    if (refresh) this.refreshes += 1;
    if (this.fail) throw new Error('discovery failed');
    return this.adapters;
  }
  owns(mac: string): boolean { return this.adapters.some((adapter) => adapter.mac === mac); }
  ownershipKnown(): boolean { return !this.fail; }
}

function harness() {
  const bridge = new EmulatedBridge();
  const targets = new FakeTargets();
  let session: WakeOnLanBridgeSession | null = {
    bridgeId: '0011223344556677', protocolVersion: '1.24', controllerConnected: false
  };
  let clock = 1_000;
  const service = new WakeOnLanService({
    session: () => session,
    read: async () => bridge.read(),
    send: async (operation, payload) => bridge.send(operation, Uint8Array.from(payload)),
    targets,
    now: () => clock,
    // Poll waits advance the clock; the longer timeout bounds never fire here.
    delay: (milliseconds) => {
      if (milliseconds > 100) return new Promise<void>(() => undefined);
      clock += milliseconds;
      return Promise.resolve();
    },
    identifier: () => 0x12345678
  });
  return {
    bridge, targets, service,
    setSession: (next: WakeOnLanBridgeSession | null) => { session = next; }
  };
}

describe('operationStage', () => {
  it('shows a test’s radio steps, never the bridge resting, while an operation runs', () => {
    for (const step of ['joining', 'sending', 'stopping-wifi', 'failed'] as const) {
      expect(operationStage('validating', step)).toBe(step);
    }
    for (const resting of ['waiting-for-sleep', 'disabled', 'not-configured', 'canceled'] as const) {
      expect(operationStage('validating', resting)).toBe('validating');
      expect(operationStage('saving', resting)).toBe('saving');
    }
    expect(operationStage('canceling', 'stopping-wifi')).toBe('canceling');
    expect(operationStage(null, 'waiting-for-sleep')).toBe('waiting-for-sleep');
  });
});

describe('WakeOnLanService', () => {
  it('uploads, tests and saves a network, then reports it without the password', async () => {
    const { bridge, service, targets } = harness();
    const result = await service.configure(input);
    expect(bridge.commands).toEqual([OP.BEGIN, OP.WRITE, OP.WRITE, OP.WRITE, OP.TEST, OP.COMMIT]);
    expect(targets.refreshes).toBe(1);
    expect(result).toMatchObject({
      supported: true, configured: true, enabled: true, ssid: 'Home', country: 'US', targetMac: MAC,
      targetOwnedByThisPc: true, stage: 'waiting-for-sleep', busy: false, error: null, generation: 1
    });
    expect(JSON.stringify(result)).not.toContain('canary-secret');
  });

  it('refuses setup while the controller is connected', async () => {
    const { bridge, service, setSession } = harness();
    setSession({ bridgeId: '0011223344556677', protocolVersion: '1.24', controllerConnected: true });
    await expect(service.configure(input)).rejects.toThrow(/Turn off the controller/);
    expect(bridge.commands).toEqual([]);
  });

  it('refuses a target that is not an Ethernet adapter on this PC', async () => {
    const { bridge, service, targets } = harness();
    targets.adapters = [];
    await expect(service.configure(input)).rejects.toThrow(/physical Ethernet adapter/);
    expect(bridge.commands).toEqual([]);
    targets.fail = true;
    await expect(service.configure(input)).rejects.toThrow(WAKE_ON_LAN_DISCOVERY_FAILED_MESSAGE);
  });

  it('reports a failed test and aborts the staged network', async () => {
    const { bridge, service } = harness();
    bridge.testOutcome = 'auth-failure';
    await expect(service.configure(input)).rejects.toThrow('The Wi-Fi network rejected the password.');
    expect(bridge.commands.at(-1)).toBe(OP.ABORT);
    expect(bridge.saved).toBeNull();
  });

  it('keeps a save whose ACK was lost once the bridge shows the new generation', async () => {
    const { bridge, service } = harness();
    bridge.commitAckLost = true;
    const result = await service.configure(input);
    expect(result.configured).toBe(true);
    expect(bridge.commands).not.toContain(OP.ABORT);
  });

  it('stops when the bridge is replaced mid-operation', async () => {
    const { bridge, service, setSession } = harness();
    const originalSend = bridge.send.bind(bridge);
    bridge.send = (operation, payload) => {
      originalSend(operation, payload);
      if (operation === OP.BEGIN) setSession({ bridgeId: 'ffeeddccbbaa9988', protocolVersion: '1.24', controllerConnected: false });
    };
    await expect(service.configure(input)).rejects.toThrow(WAKE_ON_LAN_CONNECTION_LOST_MESSAGE);
    expect(bridge.saved).toBeNull();
  });

  it('enables, disables and forgets with the current generation', async () => {
    const { bridge, service } = harness();
    await service.configure({ ...input, enabled: false });
    expect((await service.setEnabled(true)).enabled).toBe(true);
    expect(bridge.payloads.at(-1)).toEqual([1, 0, 0, 0, 1]);
    expect((await service.setEnabled(false)).stage).toBe('disabled');
    const forgotten = await service.forget();
    expect(forgotten).toMatchObject({ configured: false, stage: 'not-configured', ssid: '', targetMac: '' });
  });

  it('reports unsupported firmware and a missing bridge without touching the device', async () => {
    const { bridge, service, setSession } = harness();
    setSession({ bridgeId: '0011223344556677', protocolVersion: '1.23', controllerConnected: false });
    expect(await service.get()).toMatchObject({ supported: false, stage: 'unsupported' });
    await expect(service.configure(input)).rejects.toThrow(/Update this bridge/);
    setSession(null);
    expect(await service.get()).toMatchObject({ supported: false, bridgeId: '' });
    await expect(service.setEnabled(true)).rejects.toThrow(WAKE_ON_LAN_CONNECTION_LOST_MESSAGE);
    expect(bridge.commands).toEqual([]);
  });

  it('passes the firmware ACK reason through instead of a generic failure', async () => {
    const { bridge, service } = harness();
    bridge.send = () => { throw wakeOnLanAckError(ACK_RESULT.ERR_BUSY); };
    await expect(service.configure(input)).rejects.toThrow(/busy\. Turn off the controller/);
    expect(wakeOnLanAckError(ACK_RESULT.ERR_PERSISTENCE_FAILED).message).toMatch(/could not save/);
    expect(wakeOnLanAckError(ACK_RESULT.ERR_UNKNOWN_COMMAND).message).toMatch(/Update this bridge/);
    // Anything else from the transport stays generic: it may carry request data.
    bridge.send = () => { throw new Error('WinUSB failure with secret bytes'); };
    await expect(service.forget()).rejects.toThrow('Could not change the saved wake settings.');
  });

  it('treats a returned-host cancellation as normal, not a fault', async () => {
    const { bridge, service } = harness();
    await service.configure(input);
    bridge.stage = 8;
    bridge.error = 12;
    expect(await service.get()).toMatchObject({ stage: 'canceled', error: null });
    bridge.error = 6;
    expect(await service.get()).toMatchObject({ stage: 'failed', error: 'The Wi-Fi network is unavailable.' });
  });
});
