// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { WakeOnLanMetadata, WakeOnLanTarget } from '@shared/wake-on-lan-types';
import { WOL_COUNTRIES } from '@shared/wake-on-lan-protocol';
import { LocalizationContext, type LocalizationContextValue } from '../../common/localization/context';
import { WakePcSettings } from './WakePcSettings';
import type { SettingsPageActions, SettingsPageModel } from './types';

const TARGETS: WakeOnLanTarget[] = [
  { id: 'usb', name: 'USB Ethernet', mac: '00:11:22:33:44:55', connected: false },
  { id: 'onboard', name: 'Realtek PCIe GbE', mac: 'A8:A1:59:00:11:22', connected: true }
];

function metadata(overrides: Partial<WakeOnLanMetadata> = {}): WakeOnLanMetadata {
  return {
    bridgeId: 'e6614c311b7d3a2f',
    supported: true,
    availableCountries: WOL_COUNTRIES,
    configured: false,
    enabled: false,
    credentialPresent: false,
    ssid: '',
    country: '',
    targetMac: '',
    targetOwnedByThisPc: false,
    generation: 1,
    stage: 'not-configured',
    busy: false,
    controllerConnected: false,
    error: null,
    lastOperationError: null,
    packetCount: 0,
    elapsedMs: 0,
    ...overrides
  };
}

const SAVED = metadata({
  configured: true, enabled: true, credentialPresent: true, ssid: 'Home Network', country: 'ES',
  targetMac: 'A8:A1:59:00:11:22', targetOwnedByThisPc: true, stage: 'waiting-for-sleep'
});

function apiMock(initial: WakeOnLanMetadata) {
  let current = initial;
  return {
    set: (value: WakeOnLanMetadata) => { current = value; },
    getWakeOnLan: vi.fn(async () => current),
    getWakeOnLanTargets: vi.fn(async (_refresh?: boolean) => TARGETS),
    configureWakeOnLan: vi.fn(),
    setWakeOnLanEnabled: vi.fn(async (enabled: boolean) => (current = { ...current, enabled })),
    forgetWakeOnLan: vi.fn(async () => (current = metadata())),
    cancelWakeOnLan: vi.fn(async () => undefined)
  };
}

function model(overrides: Partial<SettingsPageModel['wakeOnLan']> = {}): SettingsPageModel {
  return {
    settings: { wakeOnConnectEnabled: true } as SettingsPageModel['settings'],
    connected: true,
    busy: false,
    pendingAction: null,
    support: { usbSuspendDisconnect: true, wakeOnConnect: true, sleepController: true },
    focusTarget: null,
    picoFirmware: { message: null, error: null },
    wakeOnLan: { connectionKey: 'connected', controllerConnected: false, ...overrides }
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
  vi.useRealTimers();
});

async function render(api: ReturnType<typeof apiMock>, pageModel = model(), locale = 'es-ES') {
  const localization = { locale, direction: 'ltr', preference: locale, options: [], translate: (text: string) => text, setPreference: () => undefined } as LocalizationContextValue;
  const actions = { toggleWakeOnConnect: vi.fn(), wakeOnLan: api } as unknown as SettingsPageActions;
  const element = (
    <LocalizationContext.Provider value={localization}>
      <div className="settings-page">
        <WakePcSettings model={pageModel} actions={actions} active matchingSettingIds={null} />
      </div>
    </LocalizationContext.Provider>
  );
  if (!root) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root!.render(element));
  await act(async () => { await Promise.resolve(); });
}

function panel() {
  return host.querySelector<HTMLElement>('.wake-pc-panel')!;
}

function input(label: string): HTMLInputElement {
  const labelElement = [...host.querySelectorAll('label')].find((candidate) => candidate.textContent === label)!;
  return document.getElementById(labelElement.htmlFor) as HTMLInputElement;
}

async function type(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function button(text: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent?.trim() === text);
}

async function click(element: Element | null | undefined) {
  await act(async () => (element as HTMLElement).click());
}

describe('Wake PC settings', () => {
  it('explains how the PC wakes and keeps the USB wake toggle', async () => {
    await render(apiMock(metadata()));
    expect(host.querySelector('.settings-menu-section-label')?.textContent).toBe('Wake PC');
    expect(host.querySelector('.wake-pc-intro')?.textContent).toContain(
      'The bridge tries USB wake first, then sends a Wake-on-LAN packet over your Wi-Fi.'
    );
    expect(host.querySelector('.wake-pc-intro')?.textContent).toContain('Wake on Magic Packet');
    expect([...host.querySelectorAll('.settings-menu-row strong')].map((label) => label.textContent))
      .toEqual(['Wake PC on Controller', 'Wake-on-LAN']);
  });

  it('asks for a firmware update and shows nothing else on older firmware', async () => {
    await render(apiMock(metadata({ supported: false, availableCountries: [], stage: 'unsupported' })));
    expect(panel().querySelector('.wake-pc-note')?.textContent).toBe('Update the bridge firmware to use Wake-on-LAN.');
    expect(panel().querySelector('form')).toBeNull();
    expect(panel().querySelector('.wake-pc-summary')).toBeNull();
  });

  it('starts a new setup in the UI region with the connected adapter and an empty password', async () => {
    const api = apiMock(metadata());
    await render(api);
    expect(input('Network name').value).toBe('');
    expect(input('Password').type).toBe('password');
    expect(input('Password').value).toBe('');
    expect(panel().querySelector('button.custom-select-button[aria-label="Country / region"]')?.textContent).toContain('España');
    expect(panel().querySelector('button.custom-select-button[aria-label="Ethernet adapter"]')?.textContent)
      .toContain('Realtek PCIe GbE · A8:A1:59:00:11:22');
    expect(panel().querySelector<HTMLInputElement>('.wake-pc-checkbox input')?.checked).toBe(true);
  });

  it('falls back to Worldwide when the UI region is not offered', async () => {
    await render(apiMock(metadata()), model(), 'es-419');
    expect(panel().querySelector('button.custom-select-button[aria-label="Country / region"]')?.textContent).toContain('Worldwide');
  });

  it('checks the draft before sending anything', async () => {
    const api = apiMock(metadata());
    await render(api);
    await type(input('Network name'), 'Home Network');
    await type(input('Password'), 'short');
    await click(button('Test and Save'));
    expect(api.configureWakeOnLan).not.toHaveBeenCalled();
    expect(panel().querySelector('[role="alert"]')?.textContent)
      .toBe('Use a WPA2 password with 8 to 63 printable ASCII characters.');
  });

  it('tests and saves with progress, then clears the password and shows the saved network', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const api = apiMock(metadata());
    let finish!: (value: WakeOnLanMetadata) => void;
    api.configureWakeOnLan.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await render(api);
    await type(input('Network name'), 'Home Network');
    await type(input('Password'), 'correct horse');
    await click(button('Test and Save'));

    expect(api.configureWakeOnLan).toHaveBeenCalledWith({
      ssid: 'Home Network', password: 'correct horse', country: 'ES', targetMac: 'A8:A1:59:00:11:22', enabled: true
    });
    expect(input('Password').value).toBe('');
    const steps = () => [...panel().querySelectorAll('.wake-pc-progress li')].map((step) => `${step.textContent}:${step.className}`);
    expect(steps()).toEqual(['1Uploading:current', '2Testing Wi-Fi:pending', '3Saving:pending']);

    api.set(metadata({ busy: true, stage: 'validating' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(api.getWakeOnLan).toHaveBeenCalledTimes(2);
    expect(steps()).toEqual(['Uploading:done', '2Testing Wi-Fi:current', '3Saving:pending']);

    api.set(SAVED);
    await act(async () => finish(SAVED));
    expect(panel().querySelector('.wake-pc-progress')).toBeNull();
    expect(panel().querySelector('.wake-pc-result.good')?.textContent).toContain('Network saved.');
    const summary = [...panel().querySelectorAll('.wake-pc-summary div')].map((row) => row.textContent);
    expect(summary).toEqual([
      'NetworkHome Network',
      'AdapterRealtek PCIe GbE · A8:A1:59:00:11:22',
      'RegionEspaña',
      'StatusWaiting for this PC to sleep or shut down'
    ]);
    expect(panel().querySelector('[data-l10n="off"]')?.textContent).toBe('Home Network');
  });

  it('shows why a test failed and still clears the password', async () => {
    const api = apiMock(metadata());
    api.configureWakeOnLan.mockRejectedValue(new Error('The Wi-Fi network rejected the password.'));
    await render(api);
    await type(input('Network name'), 'Home Network');
    await type(input('Password'), 'wrong password');
    await click(button('Test and Save'));
    expect(panel().querySelector('.wake-pc-result.bad')?.textContent).toBe('The Wi-Fi network rejected the password.');
    expect(input('Password').value).toBe('');
    expect(input('Network name').value).toBe('Home Network');
  });

  it('cancels a running test', async () => {
    const api = apiMock(metadata());
    let fail!: (error: Error) => void;
    api.configureWakeOnLan.mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
    await render(api);
    await type(input('Network name'), 'Home Network');
    await type(input('Password'), 'correct horse');
    await click(button('Test and Save'));
    await click(button('Cancel'));
    expect(api.cancelWakeOnLan).toHaveBeenCalledOnce();
    expect(button('Canceling…')?.disabled).toBe(true);
    await act(async () => fail(new Error('The wake operation was canceled.')));
    expect(panel().querySelector('.wake-pc-result.good')?.textContent).toBe('Setup canceled.');
    expect(panel().querySelector('.wake-pc-result.bad')).toBeNull();
  });

  it('locks setup while a controller is connected', async () => {
    await render(apiMock(metadata({ controllerConnected: true })), model({ controllerConnected: true }));
    expect(panel().textContent).toContain('Turn off your controller to set up or change Wake-on-LAN.');
    expect(panel().querySelector<HTMLFieldSetElement>('fieldset')?.disabled).toBe(true);
  });

  it('turns a saved network on and off, changes it with a fresh password, and forgets it after asking', async () => {
    const api = apiMock(SAVED);
    await render(api);
    await click(panel().querySelector('[role="switch"][aria-label="Enabled"]'));
    expect(api.setWakeOnLanEnabled).toHaveBeenCalledWith(false);

    await click(button('Change'));
    expect(input('Network name').value).toBe('Home Network');
    expect(input('Password').value).toBe('');
    await click(button('Cancel'));
    expect(panel().querySelector('form')).toBeNull();

    await click(button('Forget'));
    expect(api.forgetWakeOnLan).not.toHaveBeenCalled();
    expect(panel().querySelector('[role="alertdialog"]')?.textContent).toContain('Forget the saved network?');
    await click(button('Forget Network'));
    expect(api.forgetWakeOnLan).toHaveBeenCalledOnce();
    expect(panel().querySelector('.wake-pc-result.good')?.textContent).toBe('Saved network removed.');
    expect(panel().querySelector('form')).not.toBeNull();
  });

  it('warns when the saved adapter is not on this PC', async () => {
    await render(apiMock({ ...SAVED, targetOwnedByThisPc: false }));
    expect(panel().textContent).toContain('Saved for an adapter that isn’t on this PC.');
  });

  it('reads the adapters again from Refresh', async () => {
    const api = apiMock(metadata());
    await render(api);
    await click(panel().querySelector('button[aria-label="Refresh adapters"]'));
    expect(api.getWakeOnLanTargets).toHaveBeenLastCalledWith(true);
  });

  it('reads the bridge again when the connection changes', async () => {
    const api = apiMock(metadata());
    await render(api);
    expect(api.getWakeOnLan).toHaveBeenCalledTimes(1);
    await render(api, model({ connectionKey: 'reconnected' }));
    expect(api.getWakeOnLan).toHaveBeenCalledTimes(2);
  });
});
