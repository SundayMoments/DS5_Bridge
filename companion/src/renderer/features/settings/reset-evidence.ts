import type { ResetEvidencePayload } from '@shared/protocol';

// Friendly names for the firmware's watchdog reasons and main-loop phases
// (RESET_EVIDENCE_REASONS / RESET_EVIDENCE_PHASES in shared/protocol.ts). Each
// reads after "Recovered from a" and "in" in English; catalogs translate them.
export const RESET_REASON_LABELS: Record<string, string> = {
  'watchdog-timeout': 'system freeze',
  panic: 'firmware crash',
  'out-of-memory': 'memory shortage',
  'codec-fatal': 'codec failure',
  'audio-stack-overflow': 'stack overflow',
  'container-contract': 'safety check failure',
  'cyw43-rx-overflow': 'radio receive overflow',
  unknown: 'firmware fault'
};

export const RESET_PHASE_LABELS: Record<string, string> = {
  boot: 'bridge startup',
  cyw43: 'the radio driver',
  tinyusb: 'USB handling',
  'interrupt-before-audio': 'interrupt handling',
  'usb-power': 'USB power handling',
  audio: 'audio processing',
  button: 'button handling',
  lightbar: 'light bar updates',
  rssi: 'signal checks',
  inquiry: 'controller scanning',
  'connection-recovery': 'connection recovery',
  'feature-prefetch': 'controller setup',
  'output-retry': 'controller output',
  companion: 'app commands',
  'interrupt-after-companion': 'interrupt handling',
  'firmware-log-flush': 'log writing',
  'cyw43-second': 'the radio driver',
  'interrupt-after-cyw43': 'interrupt handling',
  'wake-on-lan': 'Wake-on-LAN',
  unknown: 'an unknown step'
};

/** "1h 5m", "12m", or "45s"; seconds only under a minute. */
export function formatUptime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

/**
 * The "Last restart" sentence. `translate` localizes the reason and phase
 * names before they go into the sentence, whose own template the catalogs
 * translate around them.
 */
export function lastRestartText(evidence: ResetEvidencePayload, translate: (text: string) => string = (text) => text): string {
  if (!evidence.watchdogReset) return 'Normal start';
  if (!evidence.evidenceValid) return 'Recovered from an unexpected reset';
  const reason = translate(RESET_REASON_LABELS[evidence.reason] ?? RESET_REASON_LABELS.unknown);
  const phase = translate(RESET_PHASE_LABELS[evidence.phase] ?? RESET_PHASE_LABELS.unknown);
  const uptime = translate(formatUptime(evidence.uptimeBeforeResetMs));
  return evidence.consecutiveAbnormalResets > 1
    ? `Recovered from a ${reason} in ${phase} after ${uptime} (${evidence.consecutiveAbnormalResets} in a row)`
    : `Recovered from a ${reason} in ${phase} after ${uptime}`;
}

/** What Copy puts on the clipboard: the sentence plus the raw fields for a bug report. */
export function lastRestartReport(evidence: ResetEvidencePayload, firmwareVersion: string | null, sentence: string): string {
  const fields = [
    `firmware=${firmwareVersion ?? 'unknown'}`,
    `watchdogReset=${evidence.watchdogReset}`,
    `evidenceValid=${evidence.evidenceValid}`,
    `phase=${evidence.phase}`,
    `reason=${evidence.reason}`,
    `consecutiveAbnormalResets=${evidence.consecutiveAbnormalResets}`,
    `uptimeBeforeResetMs=${evidence.uptimeBeforeResetMs}`,
    `detail=0x${evidence.detail.toString(16).padStart(8, '0')}`,
    `uptimeMs=${evidence.uptimeMs}`
  ];
  return `Last restart: ${sentence}\n${fields.join(' ')}`;
}
