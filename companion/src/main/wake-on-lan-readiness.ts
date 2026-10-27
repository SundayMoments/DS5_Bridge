import { uptime } from 'node:os';
import type {
  WakeOnLanAdapterBus, WakeOnLanBootType, WakeOnLanDriverSetting, WakeOnLanReadiness, WakeOnLanWakeSource
} from '../shared/wake-on-lan-types';
import { normalizeWakeOnLanMac } from '../shared/wake-on-lan-protocol';
import { runAudioHelperOneShot } from './audio-helper-one-shot';

// Ported from Kitsune Input's Wake-on-LAN readiness reader. The Windows reads
// run in DS5 Bridge's audio helper.

// The helper caps its own reads at 2.8 s; this adds process start and exit.
export const WAKE_ON_LAN_READINESS_TIMEOUT_MS = 4_500;
const READINESS_CACHE_MS = 60_000;
const READINESS_CACHE_LIMIT = 8;
const READINESS_MAX_BUFFER = 16 * 1024;

const BUSES: readonly WakeOnLanAdapterBus[] = ['pci', 'usb', 'other', 'unknown'];
const SETTINGS: readonly WakeOnLanDriverSetting[] = ['on', 'off', 'not-exposed', 'unknown'];
const SOURCES: readonly WakeOnLanWakeSource[] = ['network-adapter', 'usb', 'power-button', 'other', 'none', 'unknown'];
const BOOT_TYPES: readonly WakeOnLanBootType[] = ['full', 'fast-startup', 'hibernate-resume', 'unknown'];

export function unknownWakeOnLanReadiness(targetMac = '', checkedAt = 0): WakeOnLanReadiness {
  return {
    available: false, targetMac, checkedAt, modernStandby: null, sleepS3: null, hibernate: null, fastStartup: 'unknown',
    adapterPresent: null, adapterConnected: null, adapterBus: 'unknown', adapterInternal: null, adapterDefaultRoute: null,
    magicPacket: 'unknown', shutdownWake: 'unknown', modernStandbyMagicPacket: 'unknown', energyEfficientEthernet: 'unknown',
    windowsWakeArmed: null, driverProvider: null, driverVersion: null,
    lastWakeSource: 'unknown', lastWakeBootType: 'unknown', lastWakeAt: null, lastBootAt: null
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function flag(value: unknown): boolean | null { return typeof value === 'boolean' ? value : null; }
function choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}
/** Driver text is display-only reference detail: printable, trimmed and bounded. */
function displayText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 64);
  return text || null;
}
function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/**
 * Parses the helper's `--wake-on-lan-readiness` result. Every value is validated
 * independently; anything unexpected becomes unknown rather than failing the row.
 * The wake source comes from the newest Power-Troubleshooter event, which can
 * predate the current boot (S5 boots record none). A wake counts only when it is
 * newer than `lastWake.bootAt` (the newest Kernel-Boot 27 event); `uptimeBootAt`
 * is the fallback when the helper did not record a boot. Otherwise the source is
 * 'none' and its time is dropped, whatever the source was.
 */
export function parseWakeOnLanReadiness(stdout: string, targetMac: string, checkedAt: number,
  uptimeBootAt = Number.NEGATIVE_INFINITY): WakeOnLanReadiness {
  const root = record(JSON.parse(stdout));
  if (!root || root.version !== 1) throw new Error('Unsupported Wake-on-LAN readiness result.');
  const result = { ...unknownWakeOnLanReadiness(targetMac, checkedAt), available: true };
  const power = record(root.power);
  if (power) {
    result.modernStandby = flag(power.modernStandby);
    result.sleepS3 = flag(power.sleepS3);
    result.hibernate = flag(power.hibernate);
    result.fastStartup = choice(power.fastStartup, ['on', 'off'] as const, 'unknown');
  }
  const adapter = record(root.adapter);
  // adapterStatus distinguishes "not on this PC" from "could not look"; without it, adapter implies it.
  result.adapterPresent = root.adapterStatus === 'present' ? true : root.adapterStatus === 'absent' ? false
    : root.adapterStatus === 'unknown' ? null : root.adapter === null ? false : adapter ? true : null;
  if (adapter) {
    result.adapterConnected = flag(adapter.connected);
    result.adapterBus = choice(adapter.bus, BUSES, 'unknown');
    result.adapterInternal = flag(adapter.internal);
    result.adapterDefaultRoute = flag(adapter.defaultRoute);
    result.magicPacket = choice(adapter.magicPacket, SETTINGS, 'unknown');
    result.shutdownWake = choice(adapter.shutdownWake, SETTINGS, 'unknown');
    result.modernStandbyMagicPacket = choice(adapter.modernStandbyMagicPacket, SETTINGS, 'unknown');
    result.energyEfficientEthernet = choice(adapter.energyEfficientEthernet, SETTINGS, 'unknown');
    result.windowsWakeArmed = flag(adapter.windowsWakeArmed);
    result.driverProvider = displayText(adapter.driverProvider);
    result.driverVersion = displayText(adapter.driverVersion);
  }
  const lastWake = record(root.lastWake);
  if (lastWake) {
    result.lastWakeSource = choice(lastWake.source, SOURCES, 'unknown');
    result.lastWakeBootType = choice(lastWake.bootType, BOOT_TYPES, 'unknown');
    result.lastWakeAt = timestamp(lastWake.at);
    result.lastBootAt = timestamp(lastWake.bootAt);
    const boot = result.lastBootAt !== null ? Date.parse(result.lastBootAt) : uptimeBootAt;
    const current = result.lastWakeAt !== null && Date.parse(result.lastWakeAt) > boot;
    if (!current) {
      result.lastWakeAt = null;
      if (result.lastWakeSource !== 'unknown') result.lastWakeSource = 'none';
    }
  }
  return result;
}

export interface WakeOnLanReadinessPorts {
  run(args: string[], options: { timeoutMs: number; maxBuffer: number }): Promise<string>;
  now(): number;
  /** Epoch milliseconds of the current boot from uptime; used only when the helper recorded no boot. */
  uptimeBootAt(): number;
}

const defaultPorts: WakeOnLanReadinessPorts = {
  run: (args, options) => runAudioHelperOneShot(args, options), now: Date.now,
  uptimeBootAt: () => Date.now() - uptime() * 1000
};

/**
 * Read-only PC readiness for Settings. One bounded helper query per adapter,
 * cached briefly and shared by concurrent callers. It never changes a NIC, BIOS
 * or Windows power setting. A missing or older helper, a timeout or invalid
 * output yields every field unknown, with no PowerShell fallback.
 */
export class WakeOnLanReadinessService {
  private readonly cache = new Map<string, WakeOnLanReadiness>();
  private readonly pending = new Map<string, Promise<WakeOnLanReadiness>>();

  constructor(private readonly ports: WakeOnLanReadinessPorts = defaultPorts) {}

  async get(targetMac: unknown, refresh = false): Promise<WakeOnLanReadiness> {
    let mac: string;
    try { mac = normalizeWakeOnLanMac(targetMac); } catch { return unknownWakeOnLanReadiness(); }
    const cached = this.cache.get(mac);
    if (!refresh && cached && this.ports.now() - cached.checkedAt < READINESS_CACHE_MS) return { ...cached };
    let pending = this.pending.get(mac);
    if (!pending) {
      pending = this.read(mac).finally(() => this.pending.delete(mac));
      this.pending.set(mac, pending);
    }
    return { ...await pending };
  }

  private async read(mac: string): Promise<WakeOnLanReadiness> {
    const checkedAt = this.ports.now();
    let result: WakeOnLanReadiness;
    try {
      const stdout = await this.ports.run(['--wake-on-lan-readiness', '--target-mac', mac.replace(/:/g, '-')],
        { timeoutMs: WAKE_ON_LAN_READINESS_TIMEOUT_MS, maxBuffer: READINESS_MAX_BUFFER });
      result = parseWakeOnLanReadiness(stdout, mac, checkedAt, this.ports.uptimeBootAt());
    } catch {
      // Includes exit 2 (missing, older or rejected arguments), timeouts and invalid output.
      result = unknownWakeOnLanReadiness(mac, checkedAt);
    }
    this.cache.delete(mac);
    this.cache.set(mac, result);
    while (this.cache.size > READINESS_CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    return result;
  }
}
