// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ResetEvidencePayload } from '@shared/protocol';
import { RESET_EVIDENCE_PHASES, RESET_EVIDENCE_REASONS } from '@shared/protocol';
import { LocalizationContext, type LocalizationContextValue } from '../../common/localization/context';
import { LastRestartRow } from './LastRestartRow';
import { RESET_PHASE_LABELS, RESET_REASON_LABELS, formatUptime, lastRestartText } from './reset-evidence';

function evidence(overrides: Partial<ResetEvidencePayload> = {}): ResetEvidencePayload {
  return {
    watchdogReset: true,
    evidenceValid: true,
    phase: 'audio',
    reason: 'panic',
    consecutiveAbnormalResets: 1,
    uptimeBeforeResetMs: 3_900_000,
    detail: 0x2a,
    uptimeMs: 120_000,
    ...overrides
  };
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  vi.useRealTimers();
});

function render(value: ResetEvidencePayload, translate: (text: string) => string = (text) => text) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const localization = { locale: 'en', direction: 'ltr', preference: 'en', options: [], translate, setPreference: () => undefined } as LocalizationContextValue;
  act(() => root!.render(
    <LocalizationContext.Provider value={localization}>
      <LastRestartRow evidence={value} firmwareVersion="2.0.0" />
    </LocalizationContext.Provider>
  ));
}

const text = () => host.querySelector('.last-restart-text')?.textContent;

describe('Last restart', () => {
  it('says the bridge started normally after a clean boot', () => {
    render(evidence({ watchdogReset: false, evidenceValid: false, consecutiveAbnormalResets: 0 }));
    expect(host.querySelector('strong')?.textContent).toBe('Last Restart');
    expect(text()).toBe('Normal start');
    expect(host.querySelector('.last-restart-text')?.classList.contains('abnormal')).toBe(false);
  });

  it('names the reason, phase, and uptime of a recovered reset, with the count only when it repeats', () => {
    render(evidence());
    expect(text()).toBe('Recovered from a firmware crash in audio processing after 1h 5m');
    expect(host.querySelector('.last-restart-text')?.classList.contains('abnormal')).toBe(true);
    act(() => root!.unmount());
    root = null;
    render(evidence({ reason: 'cyw43-rx-overflow', phase: 'wake-on-lan', consecutiveAbnormalResets: 3, uptimeBeforeResetMs: 45_000 }));
    expect(text()).toBe('Recovered from a radio receive overflow in Wake-on-LAN after 45s (3 in a row)');
  });

  it('says only that it recovered when the breadcrumb did not survive', () => {
    render(evidence({ evidenceValid: false, phase: 'unknown', reason: 'unknown' }));
    expect(text()).toBe('Recovered from an unexpected reset');
  });

  it('localizes the reason and phase names inside the sentence', () => {
    const names: Record<string, string> = { 'firmware crash': 'fallo del firmware', 'audio processing': 'el audio' };
    render(evidence(), (source) => names[source] ?? source);
    expect(text()).toBe('Recovered from a fallo del firmware in el audio after 1h 5m');
  });

  it('copies the sentence with the raw fields for a bug report', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(evidence({ consecutiveAbnormalResets: 2 }));
    await act(async () => host.querySelector<HTMLButtonElement>('.last-restart-copy')!.click());
    expect(writeText).toHaveBeenCalledWith(
      'Last restart: Recovered from a firmware crash in audio processing after 1h 5m (2 in a row)\n'
      + 'firmware=2.0.0 watchdogReset=true evidenceValid=true phase=audio reason=panic '
      + 'consecutiveAbnormalResets=2 uptimeBeforeResetMs=3900000 detail=0x0000002a uptimeMs=120000'
    );
    expect(host.querySelector('.last-restart-copy')?.textContent).toBe('Copied');
  });

  it('has a friendly name for every phase and reason the firmware reports', () => {
    for (const phase of RESET_EVIDENCE_PHASES) expect(RESET_PHASE_LABELS[phase], phase).toBeTruthy();
    for (const reason of RESET_EVIDENCE_REASONS) expect(RESET_REASON_LABELS[reason], reason).toBeTruthy();
    expect(lastRestartText(evidence({ phase: 'future-phase', reason: 'future-reason' })))
      .toBe('Recovered from a firmware fault in an unknown step after 1h 5m');
    expect([formatUptime(0), formatUptime(59_999), formatUptime(60_000), formatUptime(7_260_000)])
      .toEqual(['0s', '59s', '1m', '2h 1m']);
  });
});
