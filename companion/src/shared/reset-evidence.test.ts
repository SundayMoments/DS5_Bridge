import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAGIC,
  PROTOCOL_MAJOR,
  PROTOCOL_MINOR,
  REPORT_ID,
  RESET_EVIDENCE_PHASES,
  RESET_EVIDENCE_REASONS,
  parseResetEvidenceReport
} from './protocol';

function resetEvidenceReport(fields: {
  flags: number;
  phase?: number;
  reason?: number;
  count?: number;
  uptimeBefore?: number;
  detail?: number;
  uptime?: number;
}): number[] {
  const report = new Array<number>(64).fill(0);
  report[0] = REPORT_ID.RESET_EVIDENCE;
  for (let index = 0; index < 4; index++) report[1 + index] = MAGIC.charCodeAt(index);
  report[5] = PROTOCOL_MAJOR;
  report[6] = PROTOCOL_MINOR;
  report[7] = 1;
  report[8] = fields.flags;
  report[9] = fields.phase ?? 0;
  report[10] = fields.reason ?? 0;
  report[11] = fields.count ?? 0;
  const u32 = (offset: number, value: number) => {
    for (let index = 0; index < 4; index++) report[offset + index] = (value >>> (index * 8)) & 0xff;
  };
  u32(12, fields.uptimeBefore ?? 0);
  u32(16, fields.detail ?? 0);
  u32(20, fields.uptime ?? 0);
  return report;
}

describe('reset evidence report', () => {
  it('names phases and reasons exactly as the firmware does, in enum order', () => {
    const header = readFileSync(new URL('../../../src/watchdog_telemetry.h', import.meta.url), 'utf8');
    const source = readFileSync(new URL('../../../src/watchdog_telemetry.cpp', import.meta.url), 'utf8');
    const enumValues = (name: string) => {
      const body = new RegExp(`enum class ${name} : uint8_t \\{([^}]*)\\}`).exec(header)?.[1] ?? '';
      return [...body.matchAll(/(\w+) = (\d+),/g)].map((match) => [match[1], Number(match[2])] as const);
    };
    const names = (type: string) => new Map([...source.matchAll(
      new RegExp(`case ${type}::(\\w+):\\s*return "([a-z0-9-]+)";`, 'g')
    )].map((match) => [match[1], match[2]]));
    const phaseNames = names('WatchdogMainLoopPhase');
    for (const [member, value] of enumValues('WatchdogMainLoopPhase')) {
      expect(RESET_EVIDENCE_PHASES[value]).toBe(phaseNames.get(member));
    }
    expect(RESET_EVIDENCE_PHASES).toHaveLength(enumValues('WatchdogMainLoopPhase').length);
    const reasonNames = names('WatchdogResetReason');
    for (const [member, value] of enumValues('WatchdogResetReason')) {
      expect(RESET_EVIDENCE_REASONS[value]).toBe(reasonNames.get(member));
    }
  });

  it('reports a watchdog reset with its phase, reason, count and uptime', () => {
    expect(parseResetEvidenceReport(resetEvidenceReport({
      flags: 0x03, phase: 5, reason: 0, count: 2, uptimeBefore: 7_200_000, detail: 0, uptime: 3_000
    }))).toEqual({
      watchdogReset: true,
      evidenceValid: true,
      phase: 'audio',
      reason: 'watchdog-timeout',
      consecutiveAbnormalResets: 2,
      uptimeBeforeResetMs: 7_200_000,
      detail: 0,
      uptimeMs: 3_000
    });
  });

  it('reports a clean boot and hides fields from a breadcrumb that did not survive', () => {
    expect(parseResetEvidenceReport(resetEvidenceReport({ flags: 0, uptime: 10 }))).toMatchObject({
      watchdogReset: false, evidenceValid: false, phase: 'unknown', reason: 'unknown'
    });
    expect(parseResetEvidenceReport(resetEvidenceReport({
      flags: 0x01, phase: 5, uptimeBefore: 99, count: 1
    }))).toMatchObject({
      watchdogReset: true, evidenceValid: false, phase: 'unknown', uptimeBeforeResetMs: 0, consecutiveAbnormalResets: 1
    });
    expect(parseResetEvidenceReport(resetEvidenceReport({ flags: 0x03, phase: 31, reason: 40 })))
      .toMatchObject({ phase: 'unknown', reason: 'unknown' });
  });

  it('rejects other reports and unknown schemas', () => {
    const report = resetEvidenceReport({ flags: 0 });
    report[7] = 2;
    expect(() => parseResetEvidenceReport(report)).toThrow(/schema/);
    report[7] = 1;
    report[0] = REPORT_ID.STATUS;
    expect(() => parseResetEvidenceReport(report)).toThrow();
  });
});
