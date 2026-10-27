// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { WakeOnLanMetadata } from '@shared/wake-on-lan-types';
import { WOL_COUNTRIES } from '@shared/wake-on-lan-protocol';
import { WakePcSettings } from './WakePcSettings';
import type { SettingsSearchEntryId } from './settings-navigation';
import type { SettingsPageActions, SettingsPageModel } from './types';

function metadata(overrides: Partial<WakeOnLanMetadata> = {}): WakeOnLanMetadata {
  return {
    bridgeId: 'e6614c311b7d3a2f', supported: true, availableCountries: WOL_COUNTRIES, configured: false, enabled: false,
    credentialPresent: false, ssid: '', country: '', targetMac: '', targetOwnedByThisPc: false, generation: 1,
    stage: 'not-configured', busy: false, controllerConnected: false, error: null, lastOperationError: null,
    packetCount: 0, elapsedMs: 0, ...overrides
  };
}

function apiMock() {
  return {
    getWakeOnLan: vi.fn(async () => metadata()),
    getWakeOnLanTargets: vi.fn(async () => [{ id: 'onboard', name: 'Realtek PCIe GbE', mac: 'A8:A1:59:00:11:22', connected: true }]),
    getWakeOnLanReadiness: vi.fn(),
    configureWakeOnLan: vi.fn(),
    setWakeOnLanEnabled: vi.fn(),
    forgetWakeOnLan: vi.fn(),
    cancelWakeOnLan: vi.fn(async () => undefined)
  };
}

function model(connected = true): SettingsPageModel {
  return {
    settings: { wakeOnConnectEnabled: true } as SettingsPageModel['settings'],
    connected,
    busy: false,
    pendingAction: null,
    support: { usbSuspendDisconnect: true, wakeOnConnect: true, sleepController: true },
    focusTarget: null,
    picoFirmware: { message: null, error: null },
    wakeOnLan: { connectionKey: 'connected', controllerConnected: false, firmwareUpdateRequired: false },
    bridgeHealth: { firmwareVersion: '2.0.0', resetEvidence: null }
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
  document.body.innerHTML = '';
});

async function render(api: ReturnType<typeof apiMock>, matching: readonly SettingsSearchEntryId[] | null = null, pageModel = model()) {
  const actions = { toggleWakeOnConnect: vi.fn(), wakeOnLan: api } as unknown as SettingsPageActions;
  if (!root) {
    host = document.createElement('div');
    host.className = 'settings-page';
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root!.render(
    <WakePcSettings model={pageModel} actions={actions} active matchingSettingIds={matching ? new Set(matching) : null} />
  ));
}

describe('Wake PC settings', () => {
  it('explains how the PC wakes and keeps the USB wake toggle above Wake-on-LAN', async () => {
    await render(apiMock());
    expect(host.querySelector('.settings-menu-section-label')?.textContent).toBe('Wake PC');
    expect(host.querySelector('.wake-pc-intro')?.textContent).toContain(
      'The bridge tries USB wake first, then sends a Wake-on-LAN packet over your Wi-Fi.'
    );
    expect([...host.querySelectorAll('.settings-menu-row strong')].map((label) => label.textContent))
      .toEqual(['Wake PC on Controller', 'Wake-on-LAN']);
    expect(host.querySelector('.wake-on-lan-state')?.textContent).toBe('Setup required');
  });

  it('shows Not connected in the Wake-on-LAN header without a bridge', async () => {
    const api = apiMock();
    await render(api, null, model(false));
    expect(host.querySelector('.settings-bridge-notice')?.textContent).toBe('Connect a bridge to change the settings stored on it.');
    expect(host.querySelector('.wake-on-lan-state')?.textContent).toBe('Not connected');
    expect(api.getWakeOnLan).not.toHaveBeenCalled();
  });

  it('opens Wake-on-LAN for a matching search and keeps it mounted but hidden for another', async () => {
    const api = apiMock();
    await render(api, ['wake-on-lan']);
    const panel = host.querySelector<HTMLElement>('.wake-on-lan-settings')!;
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('button[aria-label="Wake-on-LAN"][aria-expanded]')?.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.wake-pc-intro')).not.toBeNull();
    await render(api, ['remote-wake']);
    expect(host.querySelector<HTMLElement>('.wake-on-lan-settings')).toBe(panel);
    expect(panel.hidden).toBe(true);
    expect(host.querySelector('.wake-pc-intro')).toBeNull();
    expect(api.getWakeOnLan).toHaveBeenCalledTimes(1);
  });
});
