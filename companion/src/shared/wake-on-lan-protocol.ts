import { assertCompanionReport, ProtocolError, readWireU32, REPORT_ID } from './protocol';
import type { WakeOnLanConfigurationInput } from './wake-on-lan-types';

// Ported from Kitsune Input's Wake-on-LAN wire format. The firmware side is
// src/wake_on_lan_engine.cpp; tests/firmware/fixtures holds the shared layouts.

export const WAKE_ON_LAN_PROTOCOL_MINOR = 24;
export const WAKE_ON_LAN_REPORT_ID = REPORT_ID.WAKE_ON_LAN;
export const WAKE_ON_LAN_RECORD_SIZE = 112;
export const WAKE_ON_LAN_CHUNK_SIZE = 46;
export const WOL_WORLDWIDE_COUNTRY = 'XX';
// Named profiles in pico-sdk 2.3.0's cyw43-driver/src/cyw43_country.h that the
// pinned radio's regulatory data (CLM) also contains. 50 named countries plus XX.
export const WOL_COUNTRIES = [
  'XX', 'AU', 'AT', 'BE', 'BR', 'CA', 'CL', 'CN', 'CO', 'CZ', 'DK', 'EE',
  'FR', 'DE', 'GR', 'HK', 'HU', 'IS', 'IN', 'IL', 'IT', 'JP', 'KE', 'LV', 'LI',
  'LT', 'LU', 'MY', 'MT', 'MX', 'NL', 'NZ', 'NG', 'NO', 'PE', 'PH', 'PL', 'PT',
  'SG', 'SK', 'SI', 'ZA', 'KR', 'ES', 'SE', 'CH', 'TW', 'TH', 'TR', 'GB', 'US'
] as const;
/**
 * The radio's CLM has no Finland or Ireland locale, so every join would fail
 * its region check. The firmware still reads them in a saved record, so the
 * parser accepts them, but they are never offered.
 */
export const WOL_RETIRED_COUNTRIES = ['FI', 'IE'] as const;

export function wakeOnLanSupported(version: string | null): boolean {
  const match = /^(\d+)\.(\d+)$/.exec(version ?? '');
  return Boolean(match && Number(match[1]) === 1 && Number(match[2]) >= WAKE_ON_LAN_PROTOCOL_MINOR);
}

export function wakeOnLanCountriesForProtocol(version: string | null): readonly string[] {
  return wakeOnLanSupported(version) ? WOL_COUNTRIES : [];
}

export function isRetiredWakeOnLanCountry(country: string): boolean {
  return (WOL_RETIRED_COUNTRIES as readonly string[]).includes(country);
}

export function isConfigurableWakeOnLanCountry(country: unknown): country is string {
  return typeof country === 'string' && (WOL_COUNTRIES as readonly string[]).includes(country);
}

/** Opcodes carried in the WAKE_ON_LAN command's value. */
export const WAKE_ON_LAN_OPERATION = {
  BEGIN: 1, WRITE: 2, TEST: 3, COMMIT: 4, ABORT: 5, SET_ENABLED: 6, FORGET: 7
} as const;

export interface WakeOnLanWireStatus {
  configured: boolean;
  enabled: boolean;
  credentialPresent: boolean;
  radioActive: boolean;
  stagingPresent: boolean;
  validationReady: boolean;
  stage: number;
  error: number;
  packetCount: number;
  generation: number;
  transactionId: number;
  targetMac: string;
  ssid: string;
  country: string;
}

export function normalizeWakeOnLanMac(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(value)) {
    throw new Error('Enter a valid Ethernet adapter MAC address.');
  }
  const bytes = value.split(/[:-]/).map((part) => Number.parseInt(part, 16));
  if ((bytes[0] & 1) !== 0 || bytes.every((byte) => byte === 0)) {
    throw new Error('The target must be a nonzero unicast Ethernet MAC address.');
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join(':').toUpperCase();
}

export function wakeOnLanMacBytes(value: string): number[] {
  return normalizeWakeOnLanMac(value).split(':').map((part) => Number.parseInt(part, 16));
}

function putU32(bytes: Uint8Array, offset: number, value: number): void {
  for (let index = 0; index < 4; index++) bytes[offset + index] = value >>> (index * 8);
}

export function wakeOnLanIdentifierPayload(identifier: number): Uint8Array {
  if (!Number.isSafeInteger(identifier) || identifier < 1 || identifier > 0xffff_ffff) {
    throw new Error('Invalid Wake-on-LAN operation identifier.');
  }
  const result = new Uint8Array(4);
  putU32(result, 0, identifier);
  return result;
}

export function encodeWakeOnLanConfiguration(input: WakeOnLanConfigurationInput): Uint8Array {
  if (!input || typeof input !== 'object') throw new Error('Invalid Wake-on-LAN configuration.');
  if (typeof input.ssid !== 'string' || input.ssid.includes('\0')) {
    throw new Error('The network name must not contain a NUL character.');
  }
  const ssid = new TextEncoder().encode(input.ssid);
  // A lone UTF-16 surrogate would otherwise silently become the replacement character.
  if (new TextDecoder('utf-8', { fatal: true }).decode(ssid) !== input.ssid || ssid.length < 1 || ssid.length > 32) {
    throw new Error('The network name must contain 1 to 32 valid UTF-8 bytes.');
  }
  if (typeof input.password !== 'string' || !/^[\x20-\x7e]{8,63}$/.test(input.password)) {
    throw new Error('Use a WPA2 password containing 8 to 63 printable ASCII characters.');
  }
  if (!isConfigurableWakeOnLanCountry(input.country)) throw new Error('Select a supported Wi-Fi country.');
  if (typeof input.enabled !== 'boolean') throw new Error('The enabled setting must be a boolean.');
  const result = new Uint8Array(WAKE_ON_LAN_RECORD_SIZE);
  result.set([1, 1, ssid.length, input.password.length]);
  result.set(new TextEncoder().encode(input.country), 4);
  result[6] = input.enabled ? 1 : 0;
  result.set(wakeOnLanMacBytes(input.targetMac), 8);
  result.set(ssid, 14);
  result.set(new TextEncoder().encode(input.password), 46);
  return result;
}

/** Reflected CRC-32 (0xEDB88320), as src/wake_on_lan_crc32.h. */
export function wakeOnLanCrc32(bytes: ArrayLike<number>): number {
  let crc = 0xffff_ffff;
  for (let index = 0; index < bytes.length; index++) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

export function buildWakeOnLanBegin(identifier: number, record: Uint8Array): Uint8Array {
  if (record.length !== WAKE_ON_LAN_RECORD_SIZE) throw new Error('Invalid network configuration size.');
  const result = new Uint8Array(10);
  result.set(wakeOnLanIdentifierPayload(identifier));
  result[4] = record.length;
  result[5] = record.length >>> 8;
  putU32(result, 6, wakeOnLanCrc32(record));
  return result;
}

export function buildWakeOnLanWrite(identifier: number, offset: number, chunk: Uint8Array): Uint8Array {
  if (!Number.isInteger(offset) || offset < 0 || chunk.length < 1 || chunk.length > WAKE_ON_LAN_CHUNK_SIZE
    || offset + chunk.length > WAKE_ON_LAN_RECORD_SIZE) throw new Error('Invalid network configuration chunk.');
  const result = new Uint8Array(7 + chunk.length);
  result.set(wakeOnLanIdentifierPayload(identifier));
  result[4] = offset;
  result[5] = offset >>> 8;
  result[6] = chunk.length;
  result.set(chunk, 7);
  return result;
}

export function buildWakeOnLanGeneration(generation: number, enabled?: boolean): Uint8Array {
  if (!Number.isSafeInteger(generation) || generation < 0 || generation > 0xffff_ffff) {
    throw new Error('Invalid network configuration generation.');
  }
  const result = new Uint8Array(enabled === undefined ? 4 : 5);
  putU32(result, 0, generation);
  if (enabled !== undefined) result[4] = enabled ? 1 : 0;
  return result;
}

export function parseWakeOnLanStatus(report: ArrayLike<number>): WakeOnLanWireStatus {
  assertCompanionReport(report, WAKE_ON_LAN_REPORT_ID);
  const bad = (): never => { throw new ProtocolError('Invalid Wake-on-LAN status report.', 'bad-wake-status'); };
  if (report[5] !== 1 || report[6] < WAKE_ON_LAN_PROTOCOL_MINOR || report[7] !== 1
    || (report[8] & 0xc0) || report[9] > 10 || report[10] > 13 || report[26] > 32
    || report[62] || report[63]) return bad();
  const configured = Boolean(report[8] & 1);
  const ssidBytes = Uint8Array.from(Array.from({ length: report[26] }, (_, index) => report[27 + index]));
  let ssid: string;
  try { ssid = new TextDecoder('utf-8', { fatal: true }).decode(ssidBytes); } catch { return bad(); }
  if (ssid.includes('\0')) return bad();
  for (let index = report[26]; index < 32; index++) if (report[27 + index] !== 0) return bad();
  let targetMac = '';
  const country = configured ? String.fromCharCode(report[59], report[60]) : '';
  if (configured) {
    try {
      targetMac = normalizeWakeOnLanMac(Array.from({ length: 6 }, (_, index) =>
        report[20 + index].toString(16).padStart(2, '0')).join(':'));
    } catch { return bad(); }
    if (report[26] === 0 || report[61] !== 1
      || !(isConfigurableWakeOnLanCountry(country) || isRetiredWakeOnLanCountry(country))
      || readWireU32(report, 12) === 0) return bad();
  } else if (report[26] || report[59] || report[60] || report[61]
    || Array.from({ length: 6 }, (_, index) => report[20 + index]).some(Boolean)) return bad();
  return {
    configured,
    enabled: Boolean(report[8] & 2),
    credentialPresent: Boolean(report[8] & 4),
    radioActive: Boolean(report[8] & 8),
    stagingPresent: Boolean(report[8] & 16),
    validationReady: Boolean(report[8] & 32),
    stage: report[9],
    error: report[10],
    packetCount: report[11],
    generation: readWireU32(report, 12),
    transactionId: readWireU32(report, 16),
    targetMac,
    ssid,
    country
  };
}
