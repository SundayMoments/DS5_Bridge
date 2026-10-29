// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { WakeOnLanApi, WakeOnLanMetadata, WakeOnLanReadiness } from '@shared/wake-on-lan-types';
import { WOL_COUNTRIES, WOL_WORLDWIDE_COUNTRY } from '@shared/wake-on-lan-protocol';
import {
  WAKE_ON_LAN_CONNECTION_LOST_MESSAGE, unwrapWakeOnLanResult, wakeOnLanResult
} from '@shared/wake-on-lan-result';
import { WakeOnLanService } from '../../../main/wake-on-lan-service';
import { WakeOnLanSettings } from './WakeOnLanSettings';
import type { WakeOnLanTimers } from './use-wake-on-lan-settings';

// Ported from Kitsune Input's Wake-on-LAN settings tests, for one bridge.

const BRIDGE_ID = '1111111111111111';
const TARGET_MAC = '10:20:30:40:50:60';
const PASSWORD = 'Secret-canary-752';
const CONNECTION_LOST = 'The bridge connection was lost. Reconnect it, then refresh wake settings.';
const OWNERSHIP = 'This bridge’s saved adapter isn’t on this PC. Select this PC’s Ethernet adapter and test again.';
const ADAPTER_SELECT = '[aria-label="This PC’s Ethernet adapter"]';
const NO_WORLDWIDE = WOL_COUNTRIES.filter((country) => country !== WOL_WORLDWIDE_COUNTRY);

function metadata(overrides: Partial<WakeOnLanMetadata> = {}): WakeOnLanMetadata {
  return { bridgeId: BRIDGE_ID, supported: true, configured: false, enabled: false,
    availableCountries: WOL_COUNTRIES,
    credentialPresent: false, ssid: '', country: '', targetMac: '', targetOwnedByThisPc: true, generation: 0,
    stage: 'not-configured', busy: false, controllerConnected: false, error: null, lastOperationError: null,
    packetCount: 0, elapsedMs: 0, ...overrides };
}

function readinessFixture(overrides: Partial<WakeOnLanReadiness> = {}): WakeOnLanReadiness {
  return { available: false, targetMac: TARGET_MAC, checkedAt: 1, modernStandby: null, sleepS3: null, hibernate: null,
    fastStartup: 'unknown', adapterPresent: null, adapterConnected: null, adapterBus: 'unknown', adapterInternal: null,
    adapterDefaultRoute: null, magicPacket: 'unknown', shutdownWake: 'unknown', modernStandbyMagicPacket: 'unknown',
    energyEfficientEthernet: 'unknown', windowsWakeArmed: null, driverProvider: null, driverVersion: null,
    lastWakeSource: 'unknown', lastWakeBootType: 'unknown', lastWakeAt: null, lastBootAt: null, ...overrides };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function fakeApi(): WakeOnLanApi {
  return {
    getWakeOnLan: vi.fn(async () => metadata()),
    getWakeOnLanTargets: vi.fn(async () => [{ id: 'ethernet', name: 'Realtek Ethernet', mac: TARGET_MAC, connected: true }]),
    getWakeOnLanReadiness: vi.fn(async (targetMac: string) => readinessFixture({ targetMac })),
    configureWakeOnLan: vi.fn(async (input) => metadata({
      configured: true, credentialPresent: true,
      ssid: input.ssid, country: input.country, targetMac: input.targetMac,
      stage: 'disabled', packetCount: 1, generation: 1
    })),
    setWakeOnLanEnabled: vi.fn(async (enabled) => metadata({
      enabled, configured: true, stage: enabled ? 'waiting-for-sleep' : 'disabled'
    })),
    forgetWakeOnLan: vi.fn(async () => metadata()),
    cancelWakeOnLan: vi.fn(async () => undefined)
  };
}

describe('Wake-on-LAN Settings rendered behavior', () => {
  let root: Root;
  let container: HTMLDivElement;
  let api: WakeOnLanApi;
  let timers: WakeOnLanTimers;
  let poll: (() => void) | null;

  beforeAll(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
  afterAll(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = false; });
  afterEach(() => { act(() => root?.unmount()); container?.remove(); });

  async function render(props: { connected?: boolean; connectionKey?: string; active?: boolean; controllerConnected?: boolean;
    firmwareUpdateRequired?: boolean; searchMatch?: boolean; hidden?: boolean } = {}, expand = true) {
    if (!container?.isConnected) {
      container = document.createElement('div');
      container.className = 'settings-page';
      document.body.append(container);
      root = createRoot(container);
      api ??= fakeApi();
      poll = null;
      const pending = new Map<number, () => void>();
      let nextTimer = 0;
      const updatePoll = () => {
        const next = pending.entries().next().value;
        poll = next ? () => { pending.delete(next[0]); updatePoll(); next[1](); } : null;
      };
      timers = {
        setTimeout: (callback) => { const id = ++nextTimer; pending.set(id, callback); updatePoll(); return id; },
        clearTimeout: (id) => { pending.delete(id); updatePoll(); }
      };
    }
    await act(async () => root.render(
      <WakeOnLanSettings
        active={props.active ?? true} connected={props.connected ?? true}
        connectionKey={props.connectionKey ?? 'connected'}
        controllerConnected={props.controllerConnected ?? false}
        firmwareUpdateRequired={props.firmwareUpdateRequired ?? false}
        api={api} timers={timers}
        searchMatch={props.searchMatch ?? false} hidden={props.hidden ?? false} />));
    // Opening reads PC readiness; let that read settle like the rest of the initial load.
    if (expand && disclosure().getAttribute('aria-expanded') === 'false') await act(async () => disclosure().click());
  }

  function disclosure(): HTMLButtonElement {
    return container.querySelector('button[aria-label="Wake-on-LAN"][aria-expanded]') as HTMLButtonElement;
  }

  function wakeSwitch(): HTMLButtonElement {
    return container.querySelector('button[role="switch"][aria-label="Wake-on-LAN"]') as HTMLButtonElement;
  }

  function actions(): HTMLButtonElement | null {
    return container.querySelector('button[aria-label="Wake-on-LAN actions"]');
  }

  function button(label: string): HTMLButtonElement {
    const result = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
    if (!result) throw new Error(`Missing button ${label}`);
    return result;
  }

  function input(label: string): HTMLInputElement {
    const element = [...container.querySelectorAll('label')].find((item) => item.textContent === label);
    return container.querySelector(`[id="${element?.htmlFor}"]`) as HTMLInputElement;
  }

  function change(label: string, value: string) {
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input(label), value);
      input(label).dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function chooseRegion(name: string) {
    act(() => (container.querySelector('[aria-label="Country / region"]') as HTMLButtonElement).click());
    act(() => (document.querySelector(`button[role="option"][aria-label="${name}"]`) as HTMLButtonElement).click());
  }

  function fillNetwork() {
    change('Wi-Fi name (SSID)', 'Home network');
    change('Wi-Fi password', PASSWORD);
    chooseRegion('United States');
  }

  it('defaults new networks to Worldwide and sorts driver countries after it', async () => {
    api = fakeApi();
    await render();
    const region = container.querySelector('[aria-label="Country / region"]') as HTMLButtonElement;
    expect(region.textContent).toContain('Worldwide');
    act(() => region.click());
    const labels = [...document.querySelectorAll('button[role="option"]')].map((item) => item.getAttribute('aria-label') ?? '');
    expect(labels[0]).toBe('Worldwide');
    expect(labels).toHaveLength(WOL_COUNTRIES.length);
    expect(labels).toContain('South Africa');
    expect(labels.slice(1)).toEqual([...labels.slice(1)].sort(new Intl.Collator('en').compare));
    act(() => (document.querySelector('button[role="option"][aria-label="Worldwide"]') as HTMLButtonElement).click());
    change('Wi-Fi name (SSID)', 'Home network');
    change('Wi-Fi password', PASSWORD);
    await act(async () => button('Test and save').click());
    expect(api.configureWakeOnLan).toHaveBeenCalledWith(expect.objectContaining({ country: 'XX' }));
  });

  it('keeps region names literal and app placeholders translatable', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, country: 'DE', targetMac: TARGET_MAC }));
    await render();
    const region = container.querySelector('[aria-label="Country / region"]') as HTMLButtonElement;
    expect(region.querySelector('[data-l10n="off"]')?.textContent).toBe('Germany');
    expect(container.querySelector(`${ADAPTER_SELECT} [data-l10n="off"]`)?.textContent).toBe(`Realtek Ethernet · ${TARGET_MAC}`);
  });

  it.each([['FI', 'Finland'], ['IE', 'Ireland']])('asks for a new region before testing a retired saved %s record', async (country, name) => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, enabled: true, credentialPresent: true,
      ssid: 'Home network', country, targetMac: TARGET_MAC, stage: 'waiting-for-sleep' }));
    await render();
    const region = container.querySelector('[aria-label="Country / region"]') as HTMLButtonElement;
    expect(region.textContent).toContain('Select country');
    // The header explains it once, beside the switch; the form does not repeat it.
    const notice = `${name} isn’t available on this bridge’s radio. Choose Worldwide or another country, then test again.`;
    expect(disclosure().querySelector('.settings-menu-copy span')?.textContent).toBe(notice);
    expect(container.querySelector('.wake-on-lan-field-warning')).toBeNull();
    act(() => region.click());
    expect(document.querySelector(`button[role="option"][aria-label="${name}"]`)).toBeNull();
    // Reselecting is required: the saved retired region is never resubmitted.
    act(() => (document.querySelector('button[role="option"][aria-label="Worldwide"]') as HTMLButtonElement).click());
    change('Wi-Fi password', PASSWORD);
    await act(async () => button('Test and save').click());
    expect(api.configureWakeOnLan).toHaveBeenCalledWith(expect.objectContaining({ country: 'XX' }));
  });

  it('validates a retired region and offers only other countries on firmware without Worldwide', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, credentialPresent: true, ssid: 'Home network',
      country: 'FI', targetMac: TARGET_MAC, availableCountries: NO_WORLDWIDE, stage: 'disabled' }));
    await render();
    expect(disclosure().querySelector('.settings-menu-copy span')?.textContent).toBe(
      'Finland isn’t available on this bridge’s radio. Choose another country, then test again.');
    expect(container.querySelector('.wake-on-lan-field-label .help-tooltip-trigger')).toBeNull();
    change('Wi-Fi password', PASSWORD);
    await act(async () => button('Test and save').click());
    expect(container.querySelector('.wake-on-lan-form [role="alert"]')?.textContent).toBe('Select the country where the bridge is used.');
    expect(api.configureWakeOnLan).not.toHaveBeenCalled();
  });

  it('lets a retired-region record be turned off but never on', async () => {
    api = fakeApi();
    const saved = metadata({ configured: true, enabled: false, credentialPresent: true, ssid: 'Home network',
      country: 'IE', targetMac: TARGET_MAC, stage: 'disabled' });
    vi.mocked(api.getWakeOnLan).mockResolvedValue(saved);
    await render({}, false);
    expect(wakeSwitch().disabled).toBe(true);
    expect(disclosure().textContent).toContain('Ireland isn’t available on this bridge’s radio.');
    act(() => wakeSwitch().click());
    expect(api.setWakeOnLanEnabled).not.toHaveBeenCalled();
    // An older configuration left it enabled: turning it off stays available.
    vi.mocked(api.getWakeOnLan).mockResolvedValue({ ...saved, enabled: true, stage: 'waiting-for-sleep' });
    await render({ connectionKey: 'reconnected' }, false);
    expect(wakeSwitch().disabled).toBe(false);
    await act(async () => wakeSwitch().click());
    expect(api.setWakeOnLanEnabled).toHaveBeenCalledExactlyOnceWith(false);
    // Forget also stays available.
    act(() => disclosure().click());
    expect(actions()?.disabled).toBe(false);
  });

  it.each([
    ['FI', 'The network configuration is invalid.', 'Finland isn’t available on this bridge’s radio. Choose Worldwide or another country, then test again.'],
    ['FI', 'Configure a network first.', 'Finland isn’t available on this bridge’s radio. Choose Worldwide or another country, then test again.'],
    ['US', 'The network configuration is invalid.', 'Wake operation failed. Check the network and bridge, then try again.']
  ])('explains a refusal retained by the bridge for a %s record (%s)', async (country, retained, expected) => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, enabled: false, credentialPresent: true,
      ssid: 'Home network', country, targetMac: TARGET_MAC, stage: 'disabled', error: retained }));
    await render();
    expect(container.querySelector('.wake-on-lan-result.bad[role="alert"]')?.textContent).toBe(expected);
  });

  it('never reads a failed new configuration as a region problem, even while the saved record is retired', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, enabled: false, credentialPresent: true,
      ssid: 'Home network', country: 'FI', targetMac: TARGET_MAC, stage: 'disabled' }));
    vi.mocked(api.configureWakeOnLan).mockRejectedValue(new Error('The network configuration is invalid.'));
    await render();
    chooseRegion('Worldwide');
    change('Wi-Fi password', PASSWORD);
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, enabled: false, credentialPresent: true,
      ssid: 'Home network', country: 'FI', targetMac: TARGET_MAC, stage: 'failed', error: 'The network configuration is invalid.' }));
    await act(async () => button('Test and save').click());
    expect(api.configureWakeOnLan).toHaveBeenCalledWith(expect.objectContaining({ country: 'XX' }));
    expect([...container.querySelectorAll('.wake-on-lan-result.bad')].map((alert) => alert.textContent))
      .toEqual(['Wake operation failed. Check the network and bridge, then try again.']);
  });

  it('maps a refused enable from the service guard to the region notice', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, enabled: true, credentialPresent: true,
      ssid: 'Home network', country: 'FI', targetMac: TARGET_MAC, stage: 'waiting-for-sleep' }));
    vi.mocked(api.setWakeOnLanEnabled).mockRejectedValue(new Error(
      'The saved Wi-Fi region isn’t available on this bridge’s radio. Choose another country, then test again.'));
    await render();
    await act(async () => wakeSwitch().click());
    expect(container.querySelector('.wake-on-lan-result.bad[role="alert"]')?.textContent)
      .toBe('Finland isn’t available on this bridge’s radio. Choose Worldwide or another country, then test again.');
  });

  it('keeps the region notice beside the field when the header shows the controller restriction', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, credentialPresent: true, ssid: 'Home network',
      country: 'FI', targetMac: TARGET_MAC, stage: 'disabled' }));
    await render({ controllerConnected: true });
    expect(disclosure().textContent).toContain('Wake-on-LAN settings can only be changed while the controller is disconnected.');
    expect(container.querySelector('.wake-on-lan-field-warning')?.textContent)
      .toBe('Finland isn’t available on this bridge’s radio. Choose Worldwide or another country, then test again.');
  });

  it('explains Worldwide channel limits beside the region', async () => {
    api = fakeApi();
    await render();
    const trigger = container.querySelector('.wake-on-lan-field-label .help-tooltip-trigger') as HTMLElement;
    expect(trigger.textContent).toBe('Country / region');
    expect(document.getElementById(trigger.getAttribute('aria-describedby')!)?.textContent).toBe(
      'If your router uses channel 12 or 13, or hides its network name, choose your country instead of Worldwide.');
  });

  it('starts collapsed with its status visible and retains the setup draft when reopened', async () => {
    api = fakeApi();
    await render({}, false);
    expect(disclosure().getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.wake-on-lan-state')?.textContent).toBe('Setup required');
    expect(container.querySelector('form')).toBeNull();
    act(() => disclosure().click());
    expect(disclosure().getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('The bridge arms itself whenever this PC sleeps or shuts down, even with DS5 Bridge closed.');
    expect(container.querySelector('.wake-on-lan-readiness-title')?.textContent).toBe('Before you rely on it');
    expect(wakeSwitch().disabled).toBe(true);
    expect(actions()).toBeNull();
    expect(input('Ethernet MAC address')).toBeNull();
    act(() => button('Enter MAC address manually').click());
    expect(input('Ethernet MAC address').value).toBe(TARGET_MAC);
    expect(input('Wi-Fi password').type).toBe('password');
    expect(input('Wi-Fi password').value).toBe('');
    fillNetwork();
    act(() => disclosure().click());
    expect(container.querySelector('form')).toBeNull();
    act(() => disclosure().click());
    expect(input('Wi-Fi name (SSID)').value).toBe('Home network');
    expect(input('Wi-Fi password').value).toBe(PASSWORD);
    expect(api.getWakeOnLan).toHaveBeenCalledTimes(1);
    expect(api.configureWakeOnLan).not.toHaveBeenCalled();
  });

  it('hides enrollment for unsupported firmware and explains a missing or outdated bridge', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ supported: false, stage: 'unsupported' }));
    await render();
    expect(container.querySelector('.wake-on-lan-state')?.textContent).toBe('Firmware update required');
    expect(container.textContent).toContain('Update this bridge’s firmware to configure Wake-on-LAN.');
    expect(container.querySelector('form')).toBeNull();
    await render({ connected: false, firmwareUpdateRequired: true });
    expect(container.querySelector('.wake-on-lan-state')?.textContent).toBe('Firmware update required');
    expect(container.textContent).toContain('Update this bridge’s firmware to configure Wake-on-LAN.');
    await render({ connected: false, firmwareUpdateRequired: false });
    expect(container.querySelector('.wake-on-lan-state')?.textContent).toBe('Not connected');
    expect(container.textContent).toContain('Connect a bridge to set up Wake-on-LAN.');
    expect(wakeSwitch()).toBeNull();
    expect(api.getWakeOnLan).toHaveBeenCalledTimes(1);
    expect(api.configureWakeOnLan).not.toHaveBeenCalled();
  });

  it('reveals the network fields for a search match without saving or toggling wake', async () => {
    api = fakeApi();
    await render({ searchMatch: true }, false);
    expect(disclosure().getAttribute('aria-expanded')).toBe('true');
    expect(input('Wi-Fi password')).not.toBeNull();
    expect(api.configureWakeOnLan).not.toHaveBeenCalled();
    expect(api.setWakeOnLanEnabled).not.toHaveBeenCalled();
  });

  it('rejects a test while a controller is connected even if the form is submitted directly', async () => {
    api = fakeApi();
    await render({ controllerConnected: true });
    expect(button('Test and save').disabled).toBe(true);
    await act(async () => container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(api.configureWakeOnLan).not.toHaveBeenCalled();
    expect(disclosure().textContent).toContain('Wake-on-LAN settings can only be changed while the controller is disconnected.');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await render({ controllerConnected: false });
    expect(button('Test and save').disabled).toBe(false);
  });

  it.each([true, false])('keeps the saved enabled=%s state and blocks changes while connected', async (enabled) => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, enabled,
      stage: enabled ? 'waiting-for-sleep' : 'disabled' }));
    await render({ controllerConnected: true }, false);
    expect(wakeSwitch().disabled).toBe(true);
    expect(wakeSwitch().getAttribute('aria-checked')).toBe(String(enabled));
    expect(container.querySelector('.wake-on-lan-state')?.textContent).toBe('Controller connected');
    expect(container.querySelector('.wake-on-lan-enable')?.getAttribute('title')).toBe(
      'Wake-on-LAN settings can only be changed while the controller is disconnected.'
    );
    act(() => wakeSwitch().click());
    expect(api.setWakeOnLanEnabled).not.toHaveBeenCalled();
    act(() => disclosure().click());
    expect(button('Test and save').disabled).toBe(true);
    expect(actions()?.disabled).toBe(true);
    await render({ controllerConnected: false });
    expect(wakeSwitch().disabled).toBe(false);
    expect(actions()?.disabled).toBe(false);
    expect(button('Test and save').disabled).toBe(false);
    expect(wakeSwitch().getAttribute('aria-checked')).toBe(String(enabled));
    expect(container.querySelector('.wake-on-lan-state')).toBeNull();
    // The controller coming and going never rereads the bridge or resets the draft.
    expect(api.getWakeOnLan).toHaveBeenCalledTimes(1);
  });

  it.each(['toggle', 'forget'] as const)('keeps a pending %s in place without test progress or Cancel', async (action) => {
    api = fakeApi();
    const saved = metadata({ configured: true, enabled: true, stage: 'waiting-for-sleep' });
    vi.mocked(api.getWakeOnLan).mockResolvedValue(saved);
    const pending = deferred<WakeOnLanMetadata>();
    vi.mocked(action === 'toggle' ? api.setWakeOnLanEnabled : api.forgetWakeOnLan).mockReturnValue(pending.promise);
    await render();
    if (action === 'toggle') {
      act(() => disclosure().click());
      await act(async () => wakeSwitch().click());
    } else {
      act(() => actions()?.click());
      await act(async () => button('Forget saved network').click());
    }
    expect(wakeSwitch().disabled).toBe(true);
    expect(wakeSwitch().getAttribute('aria-checked')).toBe('true');
    expect(wakeSwitch().getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('.wake-on-lan-operation')).toBeNull();
    vi.mocked(api.getWakeOnLan).mockResolvedValue({ ...saved, stage: 'saving', busy: true });
    await act(async () => poll?.());
    expect(container.querySelector('.wake-on-lan-operation')).toBeNull();
    await act(async () => pending.resolve(metadata({ configured: action === 'toggle' })));
    expect(wakeSwitch().getAttribute('aria-checked')).toBe('false');
    expect(wakeSwitch().getAttribute('aria-busy')).toBe('false');
    expect(api.cancelWakeOnLan).not.toHaveBeenCalled();
  });

  it('shows the current idle restriction instead of an older network failure after a toggle is rejected', async () => {
    api = fakeApi();
    const saved = metadata({ configured: true, enabled: true, stage: 'waiting-for-sleep' });
    vi.mocked(api.getWakeOnLan).mockResolvedValue(saved);
    await render({}, false);
    vi.mocked(api.setWakeOnLanEnabled).mockRejectedValue(new Error('Turn off the controller before changing or testing Wake-on-LAN.'));
    vi.mocked(api.getWakeOnLan).mockResolvedValue({ ...saved, stage: 'failed', error: 'The Wi-Fi network rejected the password.' });
    await act(async () => wakeSwitch().click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Turn off the controller before changing or testing Wake-on-LAN.'
    );
    expect(wakeSwitch().getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).not.toContain('Wi-Fi authentication failed');
  });

  it('still shows radio cleanup if a saved-setting failure leaves the bridge busy', async () => {
    api = fakeApi();
    const saved = metadata({ configured: true, enabled: true });
    vi.mocked(api.getWakeOnLan).mockResolvedValue(saved);
    await render({}, false);
    vi.mocked(api.setWakeOnLanEnabled).mockRejectedValue(new Error('Cleanup not confirmed'));
    vi.mocked(api.getWakeOnLan).mockResolvedValue({ ...saved, busy: true, stage: 'stopping-wifi' });
    await act(async () => wakeSwitch().click());
    expect(container.querySelector('.wake-on-lan-operation')?.textContent).toContain('Stopping Wi-Fi');
    expect(wakeSwitch().disabled).toBe(true);
    vi.mocked(api.getWakeOnLan).mockResolvedValue(saved);
    await act(async () => poll?.());
    expect(container.querySelector('.wake-on-lan-operation')).toBeNull();
    expect(wakeSwitch().disabled).toBe(false);
  });

  it('tests and saves, clears the secret, and distinguishes packet submission from wake', async () => {
    api = fakeApi();
    await render();
    expect(input('Wi-Fi password').placeholder).toBe('');
    fillNetwork();
    await act(async () => button('Test and save').click());
    expect(api.configureWakeOnLan).toHaveBeenCalledWith({
      ssid: 'Home network', password: PASSWORD, country: 'US', targetMac: TARGET_MAC, enabled: false
    });
    expect(input('Wi-Fi password').value).toBe('');
    expect(input('Wi-Fi password').placeholder).toBe('Re-enter password to test or save');
    expect(container.textContent).toContain('Password saved on bridge');
    change('Wi-Fi name (SSID)', 'Different network');
    expect(input('Wi-Fi password').placeholder).toBe('');
    change('Wi-Fi name (SSID)', 'Home network');
    // The test result covers the test's own sends; the wake-attempt hint stays out of it.
    expect(container.textContent).not.toContain('This does not confirm that the PC woke');
    expect(container.textContent).not.toContain(PASSWORD);
    // The result follows the action that produced it, above the readiness checklist.
    const result = container.querySelector('.wake-on-lan-result.good')!;
    const actionsRow = container.querySelector('.wake-on-lan-actions')!;
    const checklist = container.querySelector('.wake-on-lan-readiness')!;
    expect(actionsRow.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(result.compareDocumentPosition(checklist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Saving never enables wake; the result says the switch is still off, and that
    // the test cannot prove the router delivers the packet to this PC.
    expect(result.textContent).toBe('Network saved. The test can’t confirm that your router '
      + 'delivers the wake packet to this PC. Turn on Wake-on-LAN, then test sleep and shutdown separately.');
    expect(wakeSwitch().getAttribute('aria-checked')).toBe('false');
    await act(async () => wakeSwitch().click());
    expect(api.setWakeOnLanEnabled).toHaveBeenCalledWith(true);
    await act(async () => wakeSwitch().click());
    expect(api.setWakeOnLanEnabled).toHaveBeenLastCalledWith(false);
    act(() => actions()?.click());
    await act(async () => button('Forget saved network').click());
    expect(api.forgetWakeOnLan).toHaveBeenCalledOnce();
    expect(input('Wi-Fi name (SSID)').value).toBe('');
    expect(input('Wi-Fi password').placeholder).toBe('');
    expect(actions()).toBeNull();
    expect(wakeSwitch().disabled).toBe(true);
  });

  it('shows the wake-attempt packet hint for a retained attempt', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({
      configured: true, enabled: true, credentialPresent: true, ssid: 'Home network', country: 'US',
      targetMac: TARGET_MAC, generation: 1, stage: 'waiting-for-sleep', packetCount: 3
    }));
    await render();
    expect(container.textContent).toContain('A wake packet was submitted. This does not confirm that the PC woke or finished starting.');
    expect(container.querySelector('.wake-on-lan-result.good')).toBeNull();
  });

  it('switches wake without opening setup and omits repeated idle status', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, enabled: true, stage: 'waiting-for-sleep' }));
    await render({}, false);
    expect(wakeSwitch().getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('.wake-on-lan-state')).toBeNull();
    await act(async () => wakeSwitch().click());
    expect(api.setWakeOnLanEnabled).toHaveBeenCalledWith(false);
    expect(wakeSwitch().getAttribute('aria-checked')).toBe('false');
    expect(disclosure().getAttribute('aria-expanded')).toBe('false');
    expect(disclosure().hasAttribute('aria-describedby')).toBe(false);
    act(() => disclosure().click());
    await act(async () => wakeSwitch().click());
    expect(wakeSwitch().getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).not.toContain('Waiting for PC sleep or shutdown');
    expect(container.querySelector('.wake-on-lan-progress')).toBeNull();
    expect(container.querySelector('.wake-on-lan-result')).toBeNull();
  });

  it('prompts for password re-entry without treating a healthy saved network as a wake failure', async () => {
    api = fakeApi();
    const saved = metadata({ configured: true, credentialPresent: true, enabled: true,
      ssid: 'Home network', country: 'US', targetMac: TARGET_MAC, stage: 'waiting-for-sleep' });
    vi.mocked(api.getWakeOnLan).mockResolvedValue(saved);
    vi.mocked(api.configureWakeOnLan).mockResolvedValue({ ...saved, generation: 2 });
    await render();
    expect(input('Wi-Fi password').placeholder).toBe('Re-enter password to test or save');
    await act(async () => button('Test and save').click());
    expect(document.activeElement).toBe(input('Wi-Fi password'));
    expect(container.querySelector('.wake-on-lan-form [role="status"]')?.textContent).toBe(
      'Re-enter the saved Wi-Fi password to test or save changes.'
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(api.configureWakeOnLan).not.toHaveBeenCalled();

    change('Wi-Fi password', 'short');
    await act(async () => button('Test and save').click());
    expect(input('Wi-Fi password').getAttribute('aria-invalid')).toBe('true');
    expect(container.querySelector('.wake-on-lan-form [role="alert"]')?.textContent).toContain('8–63');
    expect(api.configureWakeOnLan).not.toHaveBeenCalled();

    change('Wi-Fi password', PASSWORD);
    await act(async () => button('Test and save').click());
    expect(api.configureWakeOnLan).toHaveBeenCalledExactlyOnceWith({
      ssid: 'Home network', password: PASSWORD, country: 'US', targetMac: TARGET_MAC, enabled: true
    });
    expect(input('Wi-Fi password').value).toBe('');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('locks the switch and network menu while a test is pending', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true }));
    const pending = deferred<WakeOnLanMetadata>();
    vi.mocked(api.configureWakeOnLan).mockReturnValue(pending.promise);
    await render();
    fillNetwork();
    await act(async () => button('Test and save').click());
    expect(actions()?.disabled).toBe(true);
    expect(wakeSwitch().disabled).toBe(true);
    expect(button('Cancel').disabled).toBe(false);
    await act(async () => { actions()?.click(); wakeSwitch().click(); });
    expect(api.forgetWakeOnLan).not.toHaveBeenCalled();
    expect(api.setWakeOnLanEnabled).not.toHaveBeenCalled();
    await act(async () => pending.resolve(metadata({ configured: true })));
    expect(actions()?.disabled).toBe(false);
    expect(wakeSwitch().disabled).toBe(false);
  });

  it('sanitizes unknown failures and clears the password after failure', async () => {
    api = fakeApi();
    vi.mocked(api.configureWakeOnLan).mockRejectedValue(new Error(`Driver rejected ${PASSWORD}`));
    await render();
    fillNetwork();
    await act(async () => button('Test and save').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Wake operation failed');
    expect(container.querySelector('.wake-on-lan-state')?.textContent).toBe('Needs attention');
    expect(container.textContent).not.toContain(PASSWORD);
    expect(input('Wi-Fi password').value).toBe('');
  });

  it('preserves a specific authentication failure when abort cleanup reports cancellation', async () => {
    api = fakeApi();
    await render();
    fillNetwork();
    vi.mocked(api.configureWakeOnLan).mockRejectedValue(new Error('The Wi-Fi network rejected the password.'));
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ error: 'The wake operation was canceled.', stage: 'failed' }));
    await act(async () => button('Test and save').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Wi-Fi authentication failed. Check the password and use WPA2-Personal.'
    );
    expect(input('Wi-Fi password').value).toBe('');
    expect(button('Test and save').disabled).toBe(false);
  });

  it('cancels the running test when the bridge reconnects and ignores its late completion', async () => {
    api = fakeApi();
    const pending = deferred<WakeOnLanMetadata>();
    vi.mocked(api.configureWakeOnLan).mockReturnValue(pending.promise);
    await render();
    fillNetwork();
    await act(async () => button('Test and save').click());
    await render({ connectionKey: 'reconnected' });
    expect(api.cancelWakeOnLan).toHaveBeenCalledOnce();
    expect(input('Wi-Fi password').value).toBe('');
    await act(async () => pending.resolve(metadata({ configured: true, ssid: 'Wrong session', enabled: true })));
    expect(input('Wi-Fi name (SSID)').value).toBe('');
    expect(container.textContent).not.toContain('Network saved.');
    expect(api.getWakeOnLan).toHaveBeenCalledTimes(2);
  });

  it('keeps polling after a rejected test until radio cleanup finishes', async () => {
    api = fakeApi();
    await render();
    fillNetwork();
    vi.mocked(api.configureWakeOnLan).mockRejectedValue(new Error('Cleanup not confirmed'));
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ busy: true, stage: 'stopping-wifi' }));
    await act(async () => button('Test and save').click());
    expect(button('Test and save').disabled).toBe(true);
    expect(input('Wi-Fi password').value).toBe('');
    expect(poll).not.toBeNull();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata());
    await act(async () => poll?.());
    expect(button('Test and save').disabled).toBe(false);
    expect(poll).toBeNull();
  });

  it('bounds cleanup polling and offers recovery when transport stays unavailable', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ busy: true, stage: 'stopping-wifi' }));
    await render();
    vi.mocked(api.getWakeOnLan).mockRejectedValue(new Error('Bridge unavailable'));
    for (let attempt = 0; attempt < 60; attempt++) await act(async () => poll?.());
    for (let attempt = 0; attempt < 5; attempt++) await act(async () => poll?.());
    expect(poll).toBeNull();
    expect(api.getWakeOnLan).toHaveBeenCalledTimes(66);
    expect(container.querySelector('.wake-on-lan-state')?.textContent).toBe('Status unavailable');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Refresh to try again');
    expect(button('Refresh').disabled).toBe(false);
  });

  it('only retries reads after a disconnected toggle and reconciles before unlocking', async () => {
    api = fakeApi();
    const saved = metadata({ configured: true, enabled: true, generation: 4, targetMac: TARGET_MAC });
    vi.mocked(api.getWakeOnLan).mockResolvedValue(saved);
    await render();
    vi.mocked(api.setWakeOnLanEnabled).mockRejectedValue(new Error(WAKE_ON_LAN_CONNECTION_LOST_MESSAGE));
    vi.mocked(api.getWakeOnLan).mockClear().mockRejectedValue(new Error(WAKE_ON_LAN_CONNECTION_LOST_MESSAGE));
    change('Wi-Fi password', PASSWORD);
    await act(async () => wakeSwitch().click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(CONNECTION_LOST);
    expect(poll).not.toBeNull();
    expect(api.getWakeOnLan).not.toHaveBeenCalled();
    expect(wakeSwitch().getAttribute('aria-checked')).toBe('true');
    expect(wakeSwitch().disabled).toBe(true);
    expect(input('Wi-Fi password').value).toBe('');
    await act(async () => wakeSwitch().click());
    expect(api.setWakeOnLanEnabled).toHaveBeenCalledTimes(1);
    await act(async () => poll?.());
    expect(wakeSwitch().disabled).toBe(true);
    expect(poll).not.toBeNull();

    vi.mocked(api.getWakeOnLan).mockResolvedValue({ ...saved, enabled: false, generation: 5 });
    await act(async () => poll?.());
    expect(wakeSwitch().getAttribute('aria-checked')).toBe('false');
    expect(wakeSwitch().disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(api.setWakeOnLanEnabled).toHaveBeenCalledTimes(1);
    expect(poll).toBeNull();
  });

  it('stops cleanup polling when the bridge disappears and ignores the operation’s late result', async () => {
    api = fakeApi();
    const pending = deferred<WakeOnLanMetadata>();
    vi.mocked(api.configureWakeOnLan).mockReturnValue(pending.promise);
    await render();
    fillNetwork();
    await act(async () => button('Test and save').click());
    vi.mocked(api.getWakeOnLan).mockRejectedValue(new Error(WAKE_ON_LAN_CONNECTION_LOST_MESSAGE));
    await act(async () => poll?.());
    expect(poll).not.toBeNull();
    expect(input('Wi-Fi password').value).toBe('');
    expect(button('Test and save').disabled).toBe(true);
    expect(container.querySelector('.wake-on-lan-operation')).toBeNull();
    await act(async () => pending.resolve(metadata({ configured: true, enabled: true })));
    expect(container.textContent).not.toContain('Network saved.');
    expect(button('Test and save').disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(CONNECTION_LOST);
  });

  it('recovers an initial disconnected read and retains Ethernet discovery', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockRejectedValue(new Error(WAKE_ON_LAN_CONNECTION_LOST_MESSAGE));
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(CONNECTION_LOST);
    expect(container.querySelector('.wake-on-lan-state')?.textContent).toBe('Reconnecting');
    expect(poll).not.toBeNull();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, targetMac: TARGET_MAC }));
    await act(async () => poll?.());
    expect(wakeSwitch().disabled).toBe(false);
    expect(container.textContent).toContain('Realtek Ethernet');
    expect(container.textContent).not.toContain('This PC has no Ethernet adapter.');
  });

  it('shows the actual network failure without treating a saved password as missing', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, credentialPresent: true,
      ssid: 'Home', stage: 'failed', error: 'The Wi-Fi network rejected the password.' }));
    await render();
    expect(container.textContent).toContain('Password saved on bridge');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Wi-Fi authentication failed. Check the password and use WPA2-Personal.');
    expect(container.textContent).toContain('Needs attention');
    expect(poll).toBeNull();
  });

  it('keeps a retained timeout in history without a startup warning or configuration write', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, enabled: true,
      credentialPresent: true, ssid: 'Home', stage: 'waiting-for-sleep',
      lastOperationError: 'The wake operation timed out.' }));
    await render();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain('Needs attention');
    expect(container.textContent).toContain('Previous operation timed out.');
    expect(wakeSwitch().getAttribute('aria-checked')).toBe('true');
    expect(api.configureWakeOnLan).not.toHaveBeenCalled();
    expect(poll).toBeNull();
  });

  it('keeps a bridge restart after a Wi-Fi fault as quiet history', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, enabled: true, credentialPresent: true,
      ssid: 'Home', stage: 'waiting-for-sleep', lastOperationError: 'The bridge restarted because Wi-Fi could not stop safely.' }));
    await render();
    expect(container.textContent).toContain('The bridge restarted because Wi-Fi could not stop safely.');
    expect(container.textContent).not.toContain('Previous operation timed out.');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain('Needs attention');
  });

  it('still reports a live test timeout when a saved network and previous result exist', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, enabled: true,
      credentialPresent: true, ssid: 'Home', targetMac: TARGET_MAC, country: 'US',
      stage: 'waiting-for-sleep', lastOperationError: 'The wake operation timed out.' }));
    vi.mocked(api.configureWakeOnLan).mockRejectedValue(new Error('The network test timed out.'));
    await render();
    change('Wi-Fi password', PASSWORD);
    await act(async () => button('Test and save').click());
    expect(container.textContent).toContain('Needs attention');
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toBe('Wi-Fi didn’t connect. Check the password, then move the bridge closer to the router.');
    expect(container.textContent).not.toContain('Previous operation timed out.');
    expect(input('Wi-Fi password').value).toBe('');
  });

  it('shows radio stages, then keeps cancellation pending until cleanup settles', async () => {
    api = fakeApi();
    const pending = deferred<WakeOnLanMetadata>();
    vi.mocked(api.configureWakeOnLan).mockReturnValue(pending.promise);
    await render();
    fillNetwork();
    await act(async () => button('Test and save').click());
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ busy: true, stage: 'joining' }));
    await act(async () => poll?.());
    act(() => disclosure().click());
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).toContain('Joining Wi-Fi');
    await act(async () => button('Cancel').click());
    expect(button('Cancel').disabled).toBe(true);
    expect(container.textContent).toContain('Canceling and stopping Wi-Fi');
    act(() => disclosure().click());
    expect(input('Wi-Fi password').value).toBe('');
    await act(async () => pending.resolve(metadata()));
    expect(container.textContent).toContain('Operation canceled.');
    expect(button('Test and save').disabled).toBe(false);
  });

  it('never shows a resting bridge state as progress beside Cancel', async () => {
    api = fakeApi();
    const pending = deferred<WakeOnLanMetadata>();
    vi.mocked(api.configureWakeOnLan).mockReturnValue(pending.promise);
    await render();
    fillNetwork();
    await act(async () => button('Test and save').click());
    // During a test a resting state still reads as the test, which Cancel stops.
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, enabled: true, busy: true,
      stage: 'waiting-for-sleep' }));
    await act(async () => poll?.());
    expect(container.textContent).not.toContain('Waiting for PC sleep or shutdown');
    expect(container.textContent).toContain('Testing network settings');
    expect(button('Cancel').disabled).toBe(false);
    // The cleanup after the operation has nothing to cancel while the bridge rests.
    await act(async () => pending.resolve(metadata({ configured: true, credentialPresent: true, enabled: true,
      busy: true, stage: 'waiting-for-sleep' })));
    expect(container.querySelector('.wake-on-lan-progress')).toBeNull();
    expect([...container.querySelectorAll('button')].some((element) => element.textContent === 'Cancel')).toBe(false);
  });

  it('shows a passive note and blocks enabling when the saved adapter is not on this PC', async () => {
    api = fakeApi();
    const foreign = metadata({ configured: true, credentialPresent: true, ssid: 'Home', country: 'US',
      targetMac: '02:99:88:77:66:55', targetOwnedByThisPc: false, stage: 'disabled' });
    vi.mocked(api.getWakeOnLan).mockResolvedValue(foreign);
    await render({}, false);
    expect(disclosure().textContent).toContain(OWNERSHIP);
    expect(wakeSwitch().disabled).toBe(true);
    expect(wakeSwitch().getAttribute('aria-describedby')).toBe(disclosure().querySelector('.settings-menu-copy span')?.id);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    // A record enabled for another PC can still be turned off here.
    vi.mocked(api.getWakeOnLan).mockResolvedValue({ ...foreign, enabled: true, stage: 'waiting-for-sleep' });
    await render({ connectionKey: 'reconnected' }, false);
    expect(wakeSwitch().disabled).toBe(false);
    await act(async () => wakeSwitch().click());
    expect(api.setWakeOnLanEnabled).toHaveBeenCalledWith(false);
  });

  it('treats unknown ownership as unknown: no note and no blocked switch', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, targetMac: TARGET_MAC,
      targetOwnedByThisPc: null, stage: 'disabled' }));
    await render({}, false);
    expect(disclosure().textContent).not.toContain(OWNERSHIP);
    expect(wakeSwitch().disabled).toBe(false);
  });

  describe('through the real service when adapter discovery fails', () => {
    const SAVED_MAC = '02:11:22:33:44:55';
    function wireStatus(): number[] {
      const report = new Uint8Array(64);
      report.set([0x1d, 68, 83, 53, 66, 1, 24, 1]);
      return Array.from(report);
    }
    // The IPC result envelope: only the service's fixed messages reach the renderer.
    async function viaIpc<T>(action: () => Promise<T>): Promise<T> {
      return unwrapWakeOnLanResult(await wakeOnLanResult(action));
    }
    function realApi(discovery: { fail: boolean }) {
      const known = { value: false };
      const targets = {
        list: vi.fn(async () => {
          if (discovery.fail) throw new Error('Could not read this PC’s physical Ethernet adapters.');
          known.value = true;
          return [{ id: 'nic', name: 'Realtek Ethernet', mac: SAVED_MAC, connected: true }];
        }),
        owns: (mac: string) => known.value && mac === SAVED_MAC,
        ownershipKnown: () => known.value && !discovery.fail
      };
      const send = vi.fn(async () => undefined);
      const service = new WakeOnLanService({
        session: () => ({ bridgeId: BRIDGE_ID, protocolVersion: '1.24', controllerConnected: false }),
        read: async () => wireStatus(), send, targets, now: () => Date.now(), delay: () => new Promise<void>(() => undefined)
      });
      const real: WakeOnLanApi = {
        getWakeOnLan: () => viaIpc(() => service.get()),
        getWakeOnLanTargets: (refresh) => viaIpc(() => service.listTargets(refresh)),
        getWakeOnLanReadiness: async (targetMac) => readinessFixture({ targetMac }),
        configureWakeOnLan: (input) => viaIpc(() => service.configure(input)),
        setWakeOnLanEnabled: (enabled) => viaIpc(() => service.setEnabled(enabled)),
        forgetWakeOnLan: () => viaIpc(() => service.forget()),
        cancelWakeOnLan: () => viaIpc(() => service.cancel())
      };
      return { real, send, targets };
    }

    it('asks for Refresh, keeps Test and save off until adapters are read, then recovers', async () => {
      const discovery = { fail: true };
      const { real, send, targets } = realApi(discovery);
      api = real;
      await render();
      expect(container.querySelector('.wake-on-lan-form')?.textContent).toContain('Couldn’t read this PC’s Ethernet adapters. Refresh to try again.');
      expect(button('Test and save').disabled).toBe(true);
      expect(disclosure().textContent).not.toContain(OWNERSHIP);
      // Opening Settings reads the cached list; only Refresh forces discovery.
      expect(targets.list).not.toHaveBeenCalledWith(true);
      discovery.fail = false;
      await act(async () => button('Refresh').click());
      await act(async () => undefined);
      expect(targets.list).toHaveBeenCalledWith(true);
      expect(container.textContent).not.toContain('Couldn’t read this PC’s Ethernet adapters.');
      expect(button('Test and save').disabled).toBe(false);
      expect(container.textContent).toContain('Realtek Ethernet');
      expect(send).not.toHaveBeenCalled();
    });

    it('reports a discovery failure during Test and save with its own copy and writes nothing', async () => {
      const discovery = { fail: false };
      const { real, send } = realApi(discovery);
      api = real;
      await render();
      fillNetwork();
      // The service forces a fresh adapter list before trusting ownership; it fails now.
      discovery.fail = true;
      await act(async () => button('Test and save').click());
      expect(container.querySelector('.wake-on-lan-result.bad[role="alert"]')?.textContent)
        .toBe('Couldn’t read this PC’s Ethernet adapters. Refresh to try again.');
      expect(send).not.toHaveBeenCalled();
    });
  });

  it.each([
    ['Select a physical Ethernet adapter on this PC.', 'That adapter isn’t on this PC. Select this PC’s Ethernet adapter, then test again.'],
    ['The saved target belongs to another PC or an unavailable Ethernet adapter.', OWNERSHIP],
    ['The controller is unavailable.', 'The controller disconnected during the wake attempt.'],
    ['The bridge could not save or erase its network configuration.', 'The bridge couldn’t save its network settings. Reconnect the bridge and try again.'],
    ['The bridge did not acknowledge the wake operation.', 'The bridge didn’t respond. Reconnect the bridge and try again.']
  ])('renders fixed copy for %s', async (failure, expected) => {
    api = fakeApi();
    vi.mocked(api.configureWakeOnLan).mockRejectedValue(new Error(failure));
    await render();
    fillNetwork();
    await act(async () => button('Test and save').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(expected);
  });

  it('explains that Wake-on-LAN needs Ethernet and keeps Test and save disabled on a Wi-Fi-only PC', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLanTargets).mockResolvedValue([]);
    await render();
    expect(container.querySelector('.wake-on-lan-field-warning')?.textContent)
      .toBe('This PC has no Ethernet adapter. Wake-on-LAN needs a wired connection.');
    expect(button('Test and save').disabled).toBe(true);
    expect((container.querySelector(ADAPTER_SELECT) as HTMLButtonElement).disabled).toBe(true);
    fillNetwork();
    change('Ethernet MAC address', '02:11:22:33:44:55');
    await act(async () => container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(api.configureWakeOnLan).not.toHaveBeenCalled();
  });

  it('preselects a built-in PCI adapter on the default route when nothing is saved', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLanTargets).mockResolvedValue([
      { id: 'dock', name: 'A dock Ethernet', mac: '02:00:00:00:00:01', connected: true, bus: 'usb', internal: false, defaultRoute: false },
      { id: 'onboard-2', name: 'B onboard', mac: '02:00:00:00:00:02', connected: true, bus: 'pci', internal: true, defaultRoute: false },
      { id: 'onboard', name: 'C onboard', mac: '02:00:00:00:00:03', connected: true, bus: 'pci', internal: true, defaultRoute: true }
    ]);
    await render();
    expect(container.querySelector(ADAPTER_SELECT)?.textContent).toContain('C onboard');
    expect(api.getWakeOnLanReadiness).toHaveBeenLastCalledWith('02:00:00:00:00:03', expect.any(Boolean));
  });

  function checklistTrigger(): HTMLButtonElement {
    return container.querySelector('.wake-on-lan-readiness-trigger') as HTMLButtonElement;
  }

  async function openChecklist() {
    if (checklistTrigger().getAttribute('aria-expanded') === 'false') await act(async () => checklistTrigger().click());
  }

  function readinessSummary() {
    return container.querySelector('.wake-on-lan-readiness-summary');
  }

  function readinessRows() {
    return [...container.querySelectorAll('.wake-on-lan-readiness-row')].map((row) => ({
      row: row.getAttribute('data-row'), tone: row.getAttribute('data-tone'),
      status: row.querySelector('.wake-on-lan-readiness-status')?.textContent ?? null
    }));
  }

  it('checks readiness only while open, refreshing on open and Check again and reusing the cache for adapter changes', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLanTargets).mockResolvedValue([
      { id: 'a', name: 'Realtek Ethernet', mac: TARGET_MAC, connected: true },
      { id: 'b', name: 'Second Ethernet', mac: '02:00:00:00:00:09', connected: true }
    ]);
    await render({}, false);
    expect(api.getWakeOnLanReadiness).not.toHaveBeenCalled();
    act(() => disclosure().click());
    await act(async () => undefined);
    expect(api.getWakeOnLanReadiness).toHaveBeenCalledExactlyOnceWith(TARGET_MAC, true);
    // Opening the checklist only reveals the rows; it does not read again.
    await openChecklist();
    expect(api.getWakeOnLanReadiness).toHaveBeenCalledTimes(1);
    await act(async () => button('Check again').click());
    expect(api.getWakeOnLanReadiness).toHaveBeenLastCalledWith(TARGET_MAC, true);
    act(() => (container.querySelector(ADAPTER_SELECT) as HTMLButtonElement).click());
    await act(async () => (document.querySelector('button[role="option"][aria-label*="Second Ethernet"]') as HTMLButtonElement).click());
    expect(api.getWakeOnLanReadiness).toHaveBeenLastCalledWith('02:00:00:00:00:09', false);
    expect(api.configureWakeOnLan).not.toHaveBeenCalled();
    expect(api.setWakeOnLanEnabled).not.toHaveBeenCalled();
  });

  it('waits for typing to pause before reading readiness for a typed MAC', async () => {
    api = fakeApi();
    await render();
    expect(api.getWakeOnLanReadiness).toHaveBeenCalledExactlyOnceWith(TARGET_MAC, true);
    vi.mocked(api.getWakeOnLanReadiness).mockClear();
    act(() => button('Enter MAC address manually').click());
    for (const value of ['02:00:00:00:00:0', '02:00:00:00:00:01', '02:00:00:00:00:02']) change('Ethernet MAC address', value);
    expect(api.getWakeOnLanReadiness).not.toHaveBeenCalled();
    expect(readinessSummary()?.textContent).toBe('Checking…');
    await act(async () => poll?.());
    expect(api.getWakeOnLanReadiness).toHaveBeenCalledExactlyOnceWith('02:00:00:00:00:02', false);
    expect(poll).toBeNull();
    // A listed adapter is read at once.
    change('Ethernet MAC address', TARGET_MAC);
    await act(async () => undefined);
    expect(api.getWakeOnLanReadiness).toHaveBeenLastCalledWith(TARGET_MAC, false);
  });

  it('shows live readiness in place without adding or removing rows', async () => {
    api = fakeApi();
    const pending = deferred<WakeOnLanReadiness>();
    vi.mocked(api.getWakeOnLanReadiness).mockReturnValue(pending.promise);
    await render();
    await openChecklist();
    const before = readinessRows();
    expect(before.map(({ row }) => row)).toEqual(['ethernet', 'wifi', 'device-manager', 'shutdown-wake', 'bios', 'usb-power', 'test']);
    // The adapter list already knows the cable state; driver rows wait for the helper read.
    expect(before.find(({ row }) => row === 'ethernet')).toMatchObject({ tone: 'ok', status: 'Connected' });
    expect(before.find(({ row }) => row === 'device-manager')).toMatchObject({ tone: 'unknown', status: 'Checking…' });
    expect(container.querySelector('.wake-on-lan-readiness')?.getAttribute('aria-busy')).toBe('true');
    await act(async () => pending.resolve(readinessFixture({ available: true, adapterPresent: true, adapterConnected: false,
      adapterBus: 'pci', adapterInternal: true, magicPacket: 'off', windowsWakeArmed: true, shutdownWake: 'not-exposed',
      fastStartup: 'on', modernStandby: false, lastWakeSource: 'network-adapter', lastWakeBootType: 'hibernate-resume',
      lastWakeAt: '2026-10-10T20:00:00.000Z', lastBootAt: '2026-10-10T19:30:00.000Z',
      driverProvider: 'Realtek', driverVersion: '1125.29.50.202' })));
    const after = readinessRows();
    expect(after).toEqual([
      { row: 'ethernet', tone: 'warning', status: 'Not connected' },
      { row: 'wifi', tone: 'guide', status: null },
      { row: 'device-manager', tone: 'warning', status: 'Magic packet off' },
      { row: 'shutdown-wake', tone: 'unknown', status: 'Not shown' },
      { row: 'bios', tone: 'guide', status: null },
      { row: 'usb-power', tone: 'guide', status: null },
      { row: 'test', tone: 'warning', status: 'Fast Startup on' }
    ]);
    const fastStartup = container.querySelector('[data-row="test"] .help-tooltip-trigger') as HTMLElement;
    expect(document.getElementById(fastStartup.getAttribute('aria-describedby')!)?.textContent)
      .toBe('Fast Startup is on. Shutdown wake depends on your network driver and motherboard.');
    // One event with its own time; the boot type of a different event is never added.
    const lastWakeTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-10-10T20:00:00.000Z'));
    expect(container.querySelector('.wake-on-lan-readiness-last')?.textContent).toBe(`Last wake: network adapter · ${lastWakeTime}`);
    const help = container.querySelector('.wake-on-lan-readiness-help') as HTMLElement;
    expect(help.textContent).toBe('About these checks');
    expect(checklistTrigger().contains(help)).toBe(false);
    const reference = document.getElementById(help.getAttribute('aria-describedby')!)?.textContent ?? '';
    expect(reference).toContain('DS5 Bridge never changes these settings.');
    expect(reference).toContain('Adapter driver: Realtek 1125.29.50.202');
    expect(reference).toContain('disconnect the controller, turn Wake-on-LAN off, then move the bridge.');
    expect(container.querySelector('.wake-on-lan-readiness')?.getAttribute('aria-busy')).toBe('false');
  });

  it('flags USB adapters, Modern Standby wake and Windows permission, and stays neutral when the helper cannot answer', async () => {
    api = fakeApi();
    vi.mocked(api.getWakeOnLanReadiness).mockResolvedValue(readinessFixture({ available: true, adapterPresent: true,
      adapterConnected: true, adapterBus: 'usb', adapterInternal: false, magicPacket: 'on', windowsWakeArmed: true,
      modernStandby: true, modernStandbyMagicPacket: 'off', shutdownWake: 'off', fastStartup: 'off' }));
    await render();
    await openChecklist();
    expect(readinessRows().filter(({ status }) => status)).toEqual([
      { row: 'ethernet', tone: 'warning', status: 'USB or dock adapter' },
      { row: 'device-manager', tone: 'warning', status: 'Off in Modern Standby' },
      { row: 'shutdown-wake', tone: 'warning', status: 'Off' },
      { row: 'test', tone: 'warning', status: 'Modern Standby' }
    ]);
    vi.mocked(api.getWakeOnLanReadiness).mockResolvedValue(readinessFixture({ available: true, adapterPresent: true,
      adapterConnected: true, adapterBus: 'pci', adapterInternal: true, magicPacket: 'on', windowsWakeArmed: false }));
    await act(async () => button('Check again').click());
    expect(readinessRows().find(({ row }) => row === 'device-manager')).toMatchObject({ tone: 'warning', status: 'Wake permission off' });
    vi.mocked(api.getWakeOnLanReadiness).mockResolvedValue(readinessFixture());
    vi.mocked(api.getWakeOnLanTargets).mockResolvedValue([]);
    await render({ connectionKey: 'old-helper' });
    vi.mocked(api.getWakeOnLan).mockResolvedValue(metadata({ configured: true, targetMac: TARGET_MAC }));
    await render({ connectionKey: 'old-helper-saved' });
    await openChecklist();
    expect(readinessRows().filter(({ status }) => status).every(({ tone, status }) => tone === 'unknown' && status === 'Unknown')).toBe(true);
    expect(container.querySelector('.wake-on-lan-readiness-last')?.textContent).toBe('Last wake: unknown');
  });

  it('keeps the checklist collapsed by default and toggles it in place with its native button', async () => {
    api = fakeApi();
    await render();
    const trigger = checklistTrigger();
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.type).toBe('button');
    expect(trigger.closest('h4')).not.toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    const body = document.getElementById(trigger.getAttribute('aria-controls')!)!;
    expect(body.hidden).toBe(true);
    expect(readinessRows()).toEqual([]);
    expect([...container.querySelectorAll('button')].some((item) => item.textContent === 'Check again')).toBe(false);
    // The reference tooltip stays reachable while collapsed, beside (never inside) the trigger.
    expect(container.querySelector('.wake-on-lan-readiness-help')?.getAttribute('tabindex')).toBe('0');
    trigger.focus();
    await act(async () => trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(body.hidden).toBe(false);
    expect(readinessRows()).toHaveLength(7);
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(readinessRows()).toEqual([]);
    expect(api.getWakeOnLanReadiness).toHaveBeenCalledTimes(1);
  });

  it('summarizes the collapsed checklist without hiding problems', async () => {
    api = fakeApi();
    const first = deferred<WakeOnLanReadiness>();
    vi.mocked(api.getWakeOnLanReadiness).mockReturnValueOnce(first.promise);
    await render();
    expect(readinessSummary()?.textContent).toBe('Checking…');
    expect(readinessSummary()?.getAttribute('data-tone')).toBe('pending');
    await act(async () => first.resolve(readinessFixture({ available: true, adapterPresent: true, adapterConnected: true,
      adapterBus: 'pci', adapterInternal: true, magicPacket: 'on', windowsWakeArmed: true, shutdownWake: 'on', fastStartup: 'off',
      modernStandby: false })));
    // Nothing to report: no neutral claim that unverifiable BIOS or router settings are ready.
    expect(readinessSummary()).toBeNull();
    vi.mocked(api.getWakeOnLanReadiness).mockResolvedValue(readinessFixture({ available: true, adapterPresent: true,
      adapterConnected: true, adapterBus: 'pci', adapterInternal: true, magicPacket: 'off', windowsWakeArmed: true,
      shutdownWake: 'on', fastStartup: 'on', modernStandby: false }));
    await openChecklist();
    await act(async () => button('Check again').click());
    // Expanded rows carry the detail, so the summary steps aside.
    expect(readinessSummary()).toBeNull();
    await act(async () => checklistTrigger().click());
    expect(readinessSummary()?.textContent).toBe('2 to check');
    expect(readinessSummary()?.getAttribute('data-tone')).toBe('warning');
  });

  it('reads cached adapters and readiness unless the section is expanded or refreshed', async () => {
    api = fakeApi();
    // A search match reveals the section without forcing the helper reads.
    await render({ searchMatch: true }, false);
    expect(api.getWakeOnLanTargets).toHaveBeenCalledExactlyOnceWith();
    expect(api.getWakeOnLanReadiness).toHaveBeenCalledExactlyOnceWith(TARGET_MAC, false);
    // A search that excludes the section closes it; matching again reuses the cache.
    await render({ hidden: true }, false);
    await render({ searchMatch: true }, false);
    expect(api.getWakeOnLanReadiness).toHaveBeenLastCalledWith(TARGET_MAC, false);
    // Expanding is explicit, so it reads past the cache.
    await render({}, false);
    vi.mocked(api.getWakeOnLanReadiness).mockClear();
    await act(async () => disclosure().click());
    expect(api.getWakeOnLanReadiness).toHaveBeenCalledExactlyOnceWith(TARGET_MAC, true);
    // Returning to Settings with the section still expanded reuses the cache.
    await render({ active: false }, false);
    await render({ active: true }, false);
    expect(api.getWakeOnLanReadiness).toHaveBeenLastCalledWith(TARGET_MAC, false);
    expect(api.getWakeOnLanTargets).not.toHaveBeenCalledWith(true);
    expect(api.getWakeOnLanTargets).toHaveBeenCalledTimes(2);
  });

  it('rediscovers adapters on Refresh adapters without resetting the network draft', async () => {
    api = fakeApi();
    await render();
    expect(api.getWakeOnLanTargets).toHaveBeenCalledExactlyOnceWith();
    fillNetwork();
    const usb = { id: 'usb', name: 'USB Ethernet', mac: '0A:0B:0C:0D:0E:0F', connected: false };
    vi.mocked(api.getWakeOnLanTargets).mockResolvedValue([
      { id: 'ethernet', name: 'Realtek Ethernet', mac: TARGET_MAC, connected: true }, usb
    ]);
    await act(async () => button('Refresh adapters').click());
    expect(api.getWakeOnLanTargets).toHaveBeenLastCalledWith(true);
    expect(input('Wi-Fi name (SSID)').value).toBe('Home network');
    expect(input('Wi-Fi password').value).toBe(PASSWORD);
    expect((container.querySelector('[aria-label="Country / region"]') as HTMLButtonElement).textContent).toContain('United States');
    act(() => (container.querySelector(ADAPTER_SELECT) as HTMLButtonElement).click());
    expect(document.querySelector(`button[role="option"][aria-label="USB Ethernet · ${usb.mac}"]`)).not.toBeNull();
    expect(api.getWakeOnLan).toHaveBeenCalledOnce();
  });

  it('keeps a running Test and save and its draft while a search hides the section', async () => {
    api = fakeApi();
    const pending = deferred<WakeOnLanMetadata>();
    vi.mocked(api.configureWakeOnLan).mockReturnValue(pending.promise);
    await render();
    fillNetwork();
    await act(async () => button('Test and save').click());
    await render({ hidden: true }, false);
    const row = container.querySelector<HTMLElement>('.wake-on-lan-settings')!;
    expect(row.hidden).toBe(true);
    expect(api.cancelWakeOnLan).not.toHaveBeenCalled();
    await act(async () => pending.resolve(metadata({ configured: true, credentialPresent: true, ssid: 'Home network',
      country: 'US', targetMac: TARGET_MAC, stage: 'disabled', generation: 1 })));
    await render({}, false);
    expect(container.querySelector<HTMLElement>('.wake-on-lan-settings')).toBe(row);
    expect(row.hidden).toBe(false);
    expect(container.querySelector('.wake-on-lan-result.good')?.textContent).toContain('Network saved.');
    expect(input('Wi-Fi name (SSID)').value).toBe('Home network');
    expect(api.getWakeOnLan).toHaveBeenCalledTimes(1);
    expect(api.cancelWakeOnLan).not.toHaveBeenCalled();
  });

  it('clears the draft and cancels pending radio work when Settings is left', async () => {
    api = fakeApi();
    const pending = deferred<WakeOnLanMetadata>();
    vi.mocked(api.configureWakeOnLan).mockReturnValue(pending.promise);
    await render();
    fillNetwork();
    await act(async () => button('Test and save').click());
    await render({ active: false });
    expect(api.cancelWakeOnLan).toHaveBeenCalledOnce();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    await act(async () => pending.resolve(metadata({ configured: true })));
    await render();
    expect(input('Wi-Fi password').value).toBe('');
  });
});
