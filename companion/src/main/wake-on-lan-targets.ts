import { execFile } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import type { WakeOnLanTarget } from '../shared/wake-on-lan-types';
import { normalizeWakeOnLanMac } from '../shared/wake-on-lan-protocol';

// Ported from Kitsune Input's adapter discovery (its PowerShell path).

export interface WakeOnLanTargetsPort {
  /** Rejects when discovery fails; the last good list is kept for ownership. */
  list(refresh?: boolean): Promise<WakeOnLanTarget[]>;
  /** Fast cached physical classification. Link state is not ownership. */
  owns(mac: string): boolean;
  /** False before the first successful discovery and while the latest one failed. */
  ownershipKnown(): boolean;
}

/** Discovery reruns at least this often, so a removed link-down adapter is noticed. */
export const WAKE_ON_LAN_OWNERSHIP_TTL_MS = 60_000;

export function parseWakeOnLanTargets(json: string): WakeOnLanTarget[] {
  const value: unknown = JSON.parse(json || '[]');
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  const targets: WakeOnLanTarget[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    if (typeof item.InterfaceGuid !== 'string' || typeof item.Name !== 'string') continue;
    try {
      const mac = normalizeWakeOnLanMac(item.MacAddress);
      if (!targets.some((target) => target.mac === mac)) {
        targets.push({ id: item.InterfaceGuid, name: item.Name, mac, connected: item.Status === 'Up' });
      }
    } catch { /* Adapters without a usable hardware address are not wake targets. */ }
  }
  return targets.sort((a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name));
}

export type WakeOnLanAdapterReader = () => Promise<string>;

/**
 * Read-only adapter discovery. No Wi-Fi credentials or adapter settings are
 * read. A failed discovery keeps the last good list, so ownership becomes
 * unknown rather than false.
 */
export class WindowsWakeOnLanTargets implements WakeOnLanTargetsPort {
  private physical: WakeOnLanTarget[] = [];
  private pending: Promise<WakeOnLanTarget[]> | null = null;
  private lastInterfaceKey: string | null = null;
  private discoveredAt: number | null = null;
  private known = false;
  private failed = false;

  constructor(private readonly options: {
    now?: () => number;
    ttlMs?: number;
    read?: WakeOnLanAdapterReader;
    interfaces?: typeof networkInterfaces;
  } = {}) {}

  async list(refresh = false): Promise<WakeOnLanTarget[]> {
    // Node's interface list is cheap and changes when an adapter comes or goes
    // with its link up; the TTL covers adapters whose link is down.
    const interfaces = (this.options.interfaces ?? networkInterfaces)();
    const interfaceKey = [...new Set(Object.entries(interfaces).flatMap(([name, addresses]) =>
      addresses?.filter((address) => !address.internal).map((address) => `${name}:${address.mac}`) ?? []))]
      .sort().join(';');
    const now = this.options.now?.() ?? Date.now();
    const ttl = this.options.ttlMs ?? WAKE_ON_LAN_OWNERSHIP_TTL_MS;
    const expired = this.discoveredAt === null || now - this.discoveredAt >= ttl;
    if (refresh || this.pending || expired || interfaceKey !== this.lastInterfaceKey || this.failed) {
      if (!this.pending) {
        this.lastInterfaceKey = interfaceKey;
        this.pending = this.discover().then((targets) => {
          this.physical = targets;
          this.known = true;
          this.failed = false;
          this.discoveredAt = this.options.now?.() ?? Date.now();
          return targets;
        }, (error: unknown) => {
          this.lastInterfaceKey = null;
          this.failed = true;
          throw error;
        }).finally(() => { this.pending = null; });
      }
      await this.pending;
    }
    return this.physical.map((target) => ({ ...target }));
  }

  owns(mac: string): boolean {
    let normalized: string;
    try { normalized = normalizeWakeOnLanMac(mac); } catch { return false; }
    return this.physical.some((adapter) => adapter.mac === normalized);
  }

  ownershipKnown(): boolean { return this.known && !this.failed; }

  private async discover(): Promise<WakeOnLanTarget[]> {
    if (!this.options.read && process.platform !== 'win32') return [];
    let stdout: string;
    try {
      stdout = await (this.options.read ?? readPhysicalEthernetAdapters)();
    } catch {
      throw new Error('Could not read this PC’s physical Ethernet adapters.');
    }
    try {
      return parseWakeOnLanTargets(stdout);
    } catch {
      throw new Error('Windows returned an invalid Ethernet adapter list.');
    }
  }
}

const DISCOVERY_TIMEOUT_MS = 5000;
const DISCOVERY_MAX_BUFFER = 64 * 1024;

function readPhysicalEthernetAdapters(): Promise<string> {
  // IANA interface type 6 is Ethernet; -Physical excludes virtual/VPN adapters.
  const script = "$ErrorActionPreference='Stop'; @(Get-NetAdapter -Physical | Where-Object { $_.InterfaceType -eq 6 } | Select-Object InterfaceGuid,Name,MacAddress,Status) | ConvertTo-Json -Compress";
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: DISCOVERY_TIMEOUT_MS, maxBuffer: DISCOVERY_MAX_BUFFER, encoding: 'utf8' }, (error, stdout) => {
        if (error) reject(error); else resolve(stdout);
      });
  });
}
