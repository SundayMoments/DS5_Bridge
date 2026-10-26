import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMMAND_ID, REPORT_ID } from './protocol';
import {
  WAKE_ON_LAN_RECORD_SIZE,
  WOL_COUNTRIES,
  WOL_RETIRED_COUNTRIES,
  buildWakeOnLanBegin,
  buildWakeOnLanGeneration,
  buildWakeOnLanWrite,
  encodeWakeOnLanConfiguration,
  normalizeWakeOnLanMac,
  parseWakeOnLanStatus,
  wakeOnLanCountriesForProtocol,
  wakeOnLanCrc32
} from './wake-on-lan-protocol';

const config = {
  ssid: 'Home', password: 'canary-secret', country: 'US', targetMac: '02:11:22:33:44:55', enabled: false
};
const fixtureUrl = (name: string) => new URL(`../../../tests/firmware/fixtures/${name}`, import.meta.url);
const fixture = (name: string, length: number) => {
  const hex = readFileSync(fixtureUrl(name), 'utf8');
  expect(hex).toMatch(new RegExp(`^[0-9a-f]{${length * 2}}\\r?\\n$`));
  return Uint8Array.from(Buffer.from(hex.trim(), 'hex'));
};
// The firmware fixture predates DS5 Bridge's 1.24; its layout is unchanged.
const statusFixture = () => {
  const report = Buffer.from(fixture('wake-on-lan-status-v1.hex', 64));
  report[6] = 24;
  return report;
};

describe('Wake-on-LAN wire contract', () => {
  it('uses the firmware command and report IDs', () => {
    const companion = readFileSync(new URL('../../../src/companion.cpp', import.meta.url), 'utf8');
    const header = readFileSync(new URL('../../../src/companion.h', import.meta.url), 'utf8');
    expect(companion).toContain(`CommandWakeOnLan = 0x${COMMAND_ID.WAKE_ON_LAN.toString(16)}`);
    expect(header).toContain(`#define COMPANION_REPORT_WAKE_ON_LAN 0x${REPORT_ID.WAKE_ON_LAN.toString(16).toUpperCase()}`);
  });

  it('keeps the firmware stored-record country list in parity, including retired regions', () => {
    const source = readFileSync(new URL('../../../src/wake_on_lan_domain.cpp', import.meta.url), 'utf8');
    const packed = /constexpr char codes\[\] = "([A-Z]+)"/.exec(source)?.[1];
    expect(packed).toBeDefined();
    expect(new Set(packed!.match(/../g))).toEqual(new Set([...WOL_COUNTRIES, ...WOL_RETIRED_COUNTRIES]));
    expect(new Set(WOL_COUNTRIES).size).toBe(WOL_COUNTRIES.length);
    for (const country of WOL_COUNTRIES) {
      expect(Buffer.from(encodeWakeOnLanConfiguration({ ...config, country }).slice(4, 6)).toString()).toBe(country);
      const report = statusFixture();
      report.write(country, 59);
      expect(parseWakeOnLanStatus(report).country).toBe(country);
    }
  });

  it('offers 50 named countries plus Worldwide, never Finland or Ireland', () => {
    expect(WOL_COUNTRIES).toHaveLength(51);
    expect(wakeOnLanCountriesForProtocol('1.23')).toEqual([]);
    expect(wakeOnLanCountriesForProtocol('2.24')).toEqual([]);
    expect(wakeOnLanCountriesForProtocol('1.24')).toEqual(WOL_COUNTRIES);
    for (const country of WOL_RETIRED_COUNTRIES) {
      expect(WOL_COUNTRIES).not.toContain(country);
      expect(() => encodeWakeOnLanConfiguration({ ...config, country })).toThrow(/country/);
      // A record saved with one still reads, so Settings can ask for another.
      const report = statusFixture();
      report.write(country, 59);
      expect(parseWakeOnLanStatus(report).country).toBe(country);
    }
  });

  it('matches the configuration and status fixtures the firmware tests use', () => {
    expect(encodeWakeOnLanConfiguration(config)).toEqual(fixture('wake-on-lan-config-v1.hex', 112));
    expect(parseWakeOnLanStatus(statusFixture())).toMatchObject({
      configured: true, enabled: false, credentialPresent: true,
      generation: 0x01020304, transactionId: 0x12345678,
      ssid: config.ssid, country: config.country, targetMac: config.targetMac,
      radioActive: false, stagingPresent: false, validationReady: false, stage: 0, error: 0
    });
  });

  it('uses the fixed layout, IEEE CRC and bounded chunks', () => {
    expect(wakeOnLanCrc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const record = encodeWakeOnLanConfiguration(config);
    expect(record.length).toBe(112);
    expect(Array.from(record.slice(0, 14))).toEqual([1, 1, 4, 13, 85, 83, 0, 0, 2, 17, 34, 51, 68, 85]);
    expect(new TextDecoder().decode(record.slice(14, 18))).toBe('Home');
    expect(new TextDecoder().decode(record.slice(46, 59))).toBe('canary-secret');
    expect(Array.from(buildWakeOnLanBegin(0x12345678, record).slice(0, 6))).toEqual([0x78, 0x56, 0x34, 0x12, 112, 0]);
    // The largest chunk fills the command's 53-byte payload exactly.
    expect(buildWakeOnLanWrite(1, 0, record.slice(0, 46))).toHaveLength(53);
    expect(() => buildWakeOnLanWrite(1, 0, record.slice(0, 47))).toThrow();
    expect(() => buildWakeOnLanWrite(1, 100, record.slice(0, 13))).toThrow();
    expect(() => buildWakeOnLanBegin(1, new Uint8Array(WAKE_ON_LAN_RECORD_SIZE + 1))).toThrow();
    expect(Array.from(buildWakeOnLanGeneration(3, true))).toEqual([3, 0, 0, 0, 1]);
    expect(Array.from(buildWakeOnLanGeneration(3))).toEqual([3, 0, 0, 0]);
  });

  it('enforces UTF-8 byte length without truncation, normalization or replacement', () => {
    expect(encodeWakeOnLanConfiguration({ ...config, ssid: 'é'.repeat(16) })[2]).toBe(32);
    for (const ssid of ['', 'é'.repeat(17), '\ud800', 'Home\0Other']) {
      expect(() => encodeWakeOnLanConfiguration({ ...config, ssid })).toThrow();
    }
    expect(encodeWakeOnLanConfiguration({ ...config, ssid: ' Home ' })[2]).toBe(6);
  });

  it('rejects unsupported passwords, countries and non-unicast targets without echoing secrets', () => {
    for (const password of ['short', 'x'.repeat(64), '1234567é', 'secret\0pass']) {
      expect(() => encodeWakeOnLanConfiguration({ ...config, password })).toThrow(/password/);
      try { encodeWakeOnLanConfiguration({ ...config, password }); } catch (error) {
        expect((error as Error).message).not.toContain(password);
      }
    }
    expect(() => encodeWakeOnLanConfiguration({ ...config, country: 'ZZ' })).toThrow(/country/);
    expect(() => encodeWakeOnLanConfiguration({ ...config, country: 'us' })).toThrow(/country/);
    expect(() => normalizeWakeOnLanMac('00:00:00:00:00:00')).toThrow();
    expect(() => normalizeWakeOnLanMac('01:11:22:33:44:55')).toThrow();
    expect(normalizeWakeOnLanMac('02-11-22-aa-bb-cc')).toBe('02:11:22:AA:BB:CC');
  });

  it('parses only the documented metadata and rejects malformed or older reports', () => {
    const report = new Uint8Array(64);
    report.set([0x1d, 68, 83, 53, 66, 1, 24, 1, 7, 0, 0, 0, 1]);
    report.set([2, 17, 34, 51, 68, 85], 20);
    report[26] = 4;
    report.set(new TextEncoder().encode('Home'), 27);
    report.set([85, 83, 1], 59);
    expect(parseWakeOnLanStatus(report)).toMatchObject({
      configured: true, enabled: true, generation: 1, targetMac: config.targetMac, ssid: 'Home', country: 'US'
    });
    expect(Object.keys(parseWakeOnLanStatus(report))).not.toContain('password');
    report[62] = 1;
    expect(() => parseWakeOnLanStatus(report)).toThrow();
    report[62] = 0;
    report[6] = 23;
    expect(() => parseWakeOnLanStatus(report)).toThrow();
    report[6] = 24;
    report[1] = 75;
    expect(() => parseWakeOnLanStatus(report)).toThrow();
  });
});
