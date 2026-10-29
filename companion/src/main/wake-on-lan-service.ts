import { randomBytes } from 'node:crypto';
import { ACK_RESULT } from '../shared/protocol';
import type {
  WakeOnLanConfigurationInput,
  WakeOnLanMetadata,
  WakeOnLanStage,
  WakeOnLanTarget
} from '../shared/wake-on-lan-types';
import {
  WAKE_ON_LAN_CHUNK_SIZE,
  WAKE_ON_LAN_OPERATION as OP,
  buildWakeOnLanBegin,
  buildWakeOnLanGeneration,
  buildWakeOnLanWrite,
  encodeWakeOnLanConfiguration,
  isRetiredWakeOnLanCountry,
  normalizeWakeOnLanMac,
  parseWakeOnLanStatus,
  wakeOnLanCountriesForProtocol,
  wakeOnLanIdentifierPayload,
  wakeOnLanSupported,
  type WakeOnLanWireStatus
} from '../shared/wake-on-lan-protocol';
import {
  WAKE_ON_LAN_CONNECTION_LOST_MESSAGE,
  WAKE_ON_LAN_DISCOVERY_FAILED_MESSAGE,
  WAKE_ON_LAN_RADIO_RESTART_MESSAGE,
  WAKE_ON_LAN_RETIRED_REGION_MESSAGE
} from '../shared/wake-on-lan-result';
import type { WakeOnLanTargetsPort } from './wake-on-lan-targets';

// Ported from Kitsune Input's Wake-on-LAN service, for the one bridge the app
// is connected to. An enabled DS5 Bridge arms itself when the PC leaves the
// USB bus, so nothing here runs at sleep or shutdown.

export interface WakeOnLanBridgeSession {
  /** The bridge's hardware ID; operations stop if it changes. */
  bridgeId: string;
  protocolVersion: string | null;
  controllerConnected: boolean;
}

export interface WakeOnLanServicePorts {
  session(): WakeOnLanBridgeSession | null;
  /** The 64-byte Wake-on-LAN status report. */
  read(): Promise<number[]>;
  /** Sends one Wake-on-LAN opcode; rejects unless the bridge ACKs it OK. */
  send(operation: number, payload: Uint8Array): Promise<void>;
  targets: WakeOnLanTargetsPort;
  now(): number;
  delay(milliseconds: number): Promise<void>;
  identifier?(): number;
}

/** Only fixed application messages, never transport text or user input. */
export class WakeOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WakeOperationError';
  }
}

/** A non-OK companion ACK for a Wake-on-LAN opcode, as a fixed message. */
export function wakeOnLanAckError(resultCode: number): WakeOperationError {
  switch (resultCode) {
    case ACK_RESULT.ERR_BUSY:
      // The bridge needs no controller link, no pairing window and a few quiet seconds.
      return new WakeOperationError('The bridge is busy. Turn off the controller, wait a few seconds, then try again.');
    case ACK_RESULT.ERR_INVALID_VALUE:
      return new WakeOperationError('The bridge rejected the network settings.');
    case ACK_RESULT.ERR_PERSISTENCE_FAILED:
      return new WakeOperationError('The bridge could not save or erase its network configuration.');
    case ACK_RESULT.ERR_BAD_VERSION:
    case ACK_RESULT.ERR_UNKNOWN_COMMAND:
      return new WakeOperationError('Update this bridge’s firmware to use Wake-on-LAN.');
    default:
      return new WakeOperationError('The bridge did not accept the wake operation.');
  }
}

export {
  WAKE_ON_LAN_CONNECTION_LOST_MESSAGE,
  WAKE_ON_LAN_DISCOVERY_FAILED_MESSAGE,
  WAKE_ON_LAN_RADIO_RESTART_MESSAGE,
  WAKE_ON_LAN_RETIRED_REGION_MESSAGE
};

type Operation = { transaction: number; started: number; stage: WakeOnLanStage; cancelled: boolean };

const TEST_TIMEOUT_MS = 15_000;
const COMMAND_TIMEOUT_MS = 3_000;
// Indexed by the firmware's Error enum (src/wake_on_lan_domain.h).
const ERROR_MESSAGES = [
  null, 'Configure a network first.', 'The bridge is busy.', 'The network configuration is invalid.',
  'The configuration transaction expired or changed.', 'The wake operation timed out.',
  'The Wi-Fi network is unavailable.', 'The Wi-Fi network rejected the password.',
  'The wake packet could not be sent.', 'Wi-Fi could not be stopped. Reconnect the bridge before playing.',
  'The bridge could not save or erase its network configuration.', 'The target PC or configuration changed.',
  'The wake operation was canceled.', 'The controller is unavailable.'
] as const;

function stageFor(status: WakeOnLanWireStatus): WakeOnLanStage {
  // Returning to Windows cancels an armed wake. This is normal, not a bad password.
  if (status.stage === 8 && status.error === 12 && !status.radioActive && !status.stagingPresent) return 'canceled';
  const stages: Partial<Record<number, WakeOnLanStage>> = {
    1: 'preparing', 2: 'armed', 3: 'usb-wake', 4: 'joining', 5: 'sending',
    6: 'stopping-wifi', 8: 'failed', 9: 'radio-recovery-required', 10: 'validating'
  };
  return stages[status.stage] ?? (!status.configured ? 'not-configured'
    : status.enabled ? 'waiting-for-sleep' : 'disabled');
}

// The bridge's resting states say nothing about a running operation's progress.
const RESTING_STAGES: ReadonlySet<WakeOnLanStage> = new Set(['not-configured', 'disabled', 'waiting-for-sleep', 'canceled']);

/**
 * What Settings shows while an operation runs: the bridge's radio steps during
 * a test, otherwise the operation's own step. A test that has left the radio
 * at rest is still "Testing network settings", not "Waiting for PC sleep".
 */
export function operationStage(operation: WakeOnLanStage | null, bridge: WakeOnLanStage): WakeOnLanStage {
  if (!operation) return bridge;
  return operation === 'validating' && !RESTING_STAGES.has(bridge) ? bridge : operation;
}

/** USB-only control plane. Firmware owns the saved network and all radio activity. */
export class WakeOnLanService {
  private operation: Operation | null = null;
  private stopped = false;

  constructor(private readonly ports: WakeOnLanServicePorts) {}

  stop(): void {
    this.stopped = true;
    if (this.operation) this.operation.cancelled = true;
  }

  /** Cached unless refresh is true. */
  listTargets(refresh = false): Promise<WakeOnLanTarget[]> { return this.ports.targets.list(refresh); }

  async get(): Promise<WakeOnLanMetadata> {
    const session = this.ports.session();
    if (!session) return this.metadata(null, null);
    if (!wakeOnLanSupported(session.protocolVersion)) return this.metadata(session, null);
    try {
      // Load the adapter list first so a cold start reports ownership.
      await this.ports.targets.list(false).catch(() => undefined);
      const status = await this.read(session.bridgeId);
      return this.metadata(this.ports.session(), status);
    } catch (error) {
      throw this.sanitized(error, 'Could not read the wake settings. Reopen Settings to try again.');
    }
  }

  async configure(input: WakeOnLanConfigurationInput): Promise<WakeOnLanMetadata> {
    // Validate before allocating an operation or reporting any supplied text.
    const record = encodeWakeOnLanConfiguration(input);
    const expected = {
      ssid: input.ssid,
      country: input.country,
      targetMac: normalizeWakeOnLanMac(input.targetMac),
      enabled: input.enabled
    };
    const transaction = this.identifier();
    let began = false;
    let committed = false;
    let bridgeId = '';
    try {
      const session = this.capture(null);
      bridgeId = session.bridgeId;
      this.assertIdle(session);
      this.beginOperation({ transaction, started: this.ports.now(), stage: 'uploading', cancelled: false });
      await this.refreshOwnership();
      if (!this.ports.targets.owns(expected.targetMac)) {
        throw new WakeOperationError('Select a physical Ethernet adapter on this PC.');
      }
      const prior = await this.read(bridgeId);
      await this.command(bridgeId, OP.BEGIN, buildWakeOnLanBegin(transaction, record));
      began = true;
      for (let offset = 0; offset < record.length; offset += WAKE_ON_LAN_CHUNK_SIZE) {
        this.assertIdle(this.capture(bridgeId));
        await this.command(bridgeId, OP.WRITE,
          buildWakeOnLanWrite(transaction, offset, record.subarray(offset, offset + WAKE_ON_LAN_CHUNK_SIZE)));
      }
      this.assertIdle(this.capture(bridgeId));
      this.operation!.stage = 'validating';
      await this.command(bridgeId, OP.TEST, wakeOnLanIdentifierPayload(transaction));
      await this.waitValidated(bridgeId, transaction);
      this.operation!.stage = 'saving';
      try {
        await this.command(bridgeId, OP.COMMIT, wakeOnLanIdentifierPayload(transaction));
      } catch (error) {
        // An ACK can be lost after a durable commit. Reconcile nonsecret metadata only.
        const result = await this.read(bridgeId);
        if (result.transactionId !== transaction || result.generation !== ((prior.generation + 1) >>> 0)
          || !this.matches(result, expected)) throw error;
      }
      const result = await this.read(bridgeId);
      if (!this.matches(result, expected) || result.transactionId !== transaction) {
        throw new WakeOperationError('The bridge did not verify the saved network configuration.');
      }
      committed = true;
      this.operation = null;
      return this.metadata(this.ports.session(), result);
    } catch (error) {
      throw this.sanitized(error, 'Could not set up Wake-on-LAN. Reconnect the bridge and try again.');
    } finally {
      record.fill(0);
      if (began && !committed) await this.abortAndWait(bridgeId, transaction);
      if (this.operation?.transaction === transaction) this.operation = null;
    }
  }

  setEnabled(enabled: boolean): Promise<WakeOnLanMetadata> {
    if (typeof enabled !== 'boolean') return Promise.reject(new Error('The enabled setting must be a boolean.'));
    return this.mutateSaved(enabled);
  }

  forget(): Promise<WakeOnLanMetadata> { return this.mutateSaved(); }

  async cancel(): Promise<void> {
    const operation = this.operation;
    if (!operation) return;
    operation.cancelled = true;
    operation.stage = 'canceling';
    const session = this.ports.session();
    if (session) await this.abortAndWait(session.bridgeId, operation.transaction);
  }

  private async mutateSaved(enabled?: boolean): Promise<WakeOnLanMetadata> {
    let operation: Operation | null = null;
    try {
      const session = this.capture(null);
      const bridgeId = session.bridgeId;
      this.assertIdle(session);
      operation = { transaction: 0, started: this.ports.now(), stage: 'saving', cancelled: false };
      this.beginOperation(operation);
      const status = await this.read(bridgeId);
      // Firmware refuses to enable, and never arms, a record with a retired region.
      if (enabled && isRetiredWakeOnLanCountry(status.country)) {
        throw new WakeOperationError(WAKE_ON_LAN_RETIRED_REGION_MESSAGE);
      }
      // Enabling checks a fresh adapter list: a cached one can still hold a removed adapter.
      if (enabled) await this.refreshOwnership();
      if (enabled && !this.ports.targets.owns(status.targetMac)) {
        throw new WakeOperationError('The saved target belongs to another PC or an unavailable Ethernet adapter.');
      }
      this.assertIdle(this.capture(bridgeId));
      await this.command(bridgeId, enabled === undefined ? OP.FORGET : OP.SET_ENABLED,
        buildWakeOnLanGeneration(status.generation, enabled));
      const result = await this.read(bridgeId);
      if (enabled === undefined ? result.configured || result.credentialPresent : result.enabled !== enabled) {
        throw new WakeOperationError('The bridge could not verify the change.');
      }
      this.operation = null;
      return this.metadata(this.ports.session(), result);
    } catch (error) {
      throw this.sanitized(error, 'Could not change the saved wake settings.');
    } finally {
      if (operation && this.operation === operation) this.operation = null;
    }
  }

  private async waitValidated(bridgeId: string, transaction: number): Promise<void> {
    const deadline = this.ports.now() + TEST_TIMEOUT_MS;
    while (this.ports.now() < deadline) {
      this.checkOperation(bridgeId);
      const status = await this.bounded(this.read(bridgeId), Math.max(1, deadline - this.ports.now()),
        'The network test timed out.');
      if (status.transactionId !== transaction) throw new WakeOperationError('The network test was replaced.');
      if (status.error === 5) throw new WakeOperationError('The network test timed out.');
      if (status.error || status.stage === 9) {
        throw new WakeOperationError(ERROR_MESSAGES[status.error] ?? 'The network test failed.');
      }
      if (status.validationReady && !status.radioActive) return;
      await this.ports.delay(100);
    }
    throw new WakeOperationError('The network test timed out.');
  }

  private async abortAndWait(bridgeId: string, transaction: number): Promise<void> {
    if (!bridgeId) return;
    const deadline = this.ports.now() + COMMAND_TIMEOUT_MS;
    try {
      await this.bounded(this.ports.send(OP.ABORT, wakeOnLanIdentifierPayload(transaction)),
        COMMAND_TIMEOUT_MS, 'Network test cancellation timed out.');
      while (this.ports.now() < deadline) {
        if (this.ports.session()?.bridgeId !== bridgeId) return;
        const status = parseWakeOnLanStatus(await this.bounded(this.ports.read(),
          Math.max(1, deadline - this.ports.now()), 'Network test cancellation timed out.'));
        if (!status.radioActive) return;
        await this.ports.delay(100);
      }
    } catch { /* Firmware owns bounded teardown and keeps gameplay gated on failure. */ }
  }

  private async command(bridgeId: string, operation: number, payload: Uint8Array): Promise<void> {
    try {
      this.checkOperation(bridgeId);
      await this.bounded(this.ports.send(operation, payload), COMMAND_TIMEOUT_MS,
        'The bridge did not acknowledge the wake operation.');
    } finally {
      payload.fill(0);
    }
  }

  private checkOperation(bridgeId: string): void {
    this.capture(bridgeId);
    if (this.stopped || this.operation?.cancelled) throw new WakeOperationError('The wake operation was canceled.');
  }

  private async read(bridgeId: string): Promise<WakeOnLanWireStatus> {
    this.capture(bridgeId);
    const raw = await this.ports.read();
    this.capture(bridgeId);
    return parseWakeOnLanStatus(raw);
  }

  /** The connected bridge, which must still be `expected` when one is given. */
  private capture(expected: string | null): WakeOnLanBridgeSession {
    const session = this.ports.session();
    if (!session || (expected !== null && session.bridgeId !== expected)) {
      throw new WakeOperationError(WAKE_ON_LAN_CONNECTION_LOST_MESSAGE);
    }
    if (!wakeOnLanSupported(session.protocolVersion)) {
      throw new WakeOperationError('Update this bridge’s firmware to use Wake-on-LAN.');
    }
    return { ...session };
  }

  /** Forced adapter discovery for a decision that must not trust the cache. */
  private async refreshOwnership(): Promise<void> {
    try { await this.ports.targets.list(true); } catch { throw new WakeOperationError(WAKE_ON_LAN_DISCOVERY_FAILED_MESSAGE); }
  }

  private assertIdle(session: WakeOnLanBridgeSession): void {
    // The bridge tests Wi-Fi only with no controller link (firmware setup_idle).
    if (session.controllerConnected) {
      throw new WakeOperationError('Turn off the controller before changing or testing Wake-on-LAN.');
    }
  }

  private beginOperation(operation: Operation): void {
    if (this.operation) throw new WakeOperationError('A Wake-on-LAN change is already running.');
    if (this.stopped) throw new WakeOperationError('The companion is closing.');
    this.operation = operation;
  }

  private metadata(session: WakeOnLanBridgeSession | null, wire: WakeOnLanWireStatus | null): WakeOnLanMetadata {
    const operation = this.operation;
    // A completed timeout or a reboot after a failed Wi-Fi teardown is history:
    // the saved network stays valid and the radio is already off.
    const settled = !operation && wire?.stage === 8 && !wire.radioActive && !wire.stagingPresent;
    const history = !settled || !wire ? null
      : wire.error === 5 && wire.configured && wire.credentialPresent ? ERROR_MESSAGES[5]
        : wire.error === 9 ? WAKE_ON_LAN_RADIO_RESTART_MESSAGE : null;
    const stage: WakeOnLanStage = history && wire
      ? (!wire.configured ? 'not-configured' : wire.enabled ? 'waiting-for-sleep' : 'disabled')
      : wire ? stageFor(wire) : 'unsupported';
    return {
      bridgeId: session?.bridgeId ?? '',
      supported: wire !== null,
      availableCountries: wire ? wakeOnLanCountriesForProtocol(session?.protocolVersion ?? null) : [],
      configured: wire?.configured ?? false,
      enabled: wire?.enabled ?? false,
      credentialPresent: wire?.credentialPresent ?? false,
      ssid: wire?.ssid ?? '',
      country: wire?.country ?? '',
      targetMac: wire?.targetMac ?? '',
      targetOwnedByThisPc: !wire?.configured ? false
        : this.ports.targets.ownershipKnown() ? this.ports.targets.owns(wire.targetMac) : null,
      generation: wire?.generation ?? 0,
      stage: operationStage(operation?.stage ?? null, stage),
      busy: Boolean(operation || wire?.radioActive || wire?.stagingPresent),
      controllerConnected: session?.controllerConnected ?? false,
      error: wire && wire.error !== 0 && stage !== 'canceled' && !history
        ? ERROR_MESSAGES[wire.error] ?? 'The wake operation failed.' : null,
      lastOperationError: history,
      packetCount: wire?.packetCount ?? 0,
      elapsedMs: operation ? Math.max(0, this.ports.now() - operation.started) : 0
    };
  }

  private matches(result: WakeOnLanWireStatus, expected: Pick<WakeOnLanConfigurationInput,
    'ssid' | 'country' | 'targetMac' | 'enabled'>): boolean {
    return result.configured && result.credentialPresent && result.ssid === expected.ssid
      && result.country === expected.country && result.targetMac === expected.targetMac
      && result.enabled === expected.enabled && !result.radioActive;
  }

  private identifier(): number { return this.ports.identifier?.() || randomBytes(4).readUInt32LE() || 1; }

  private sanitized(error: unknown, fallback: string): WakeOperationError {
    // Never pass transport or driver text through: it can contain request data.
    return error instanceof WakeOperationError ? error : new WakeOperationError(fallback);
  }

  private bounded<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
    return Promise.race([promise, this.ports.delay(milliseconds).then(() => { throw new WakeOperationError(message); })]);
  }
}
