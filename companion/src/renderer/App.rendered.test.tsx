// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  buttonByText,
  click,
  fixtureSnapshot,
  installBridgeMock,
  installDomStubs,
  openPage,
  renderApp,
  unmountApp
} from './test-support/app-harness';

beforeAll(installDomStubs);
afterEach(() => {
  setDocumentVisibility(null);
  unmountApp();
});

/** Overrides document.visibilityState the way a hidden or minimized window reports it; null restores it. */
function setDocumentVisibility(state: 'hidden' | 'visible' | null) {
  if (state === null) {
    delete (document as { visibilityState?: unknown }).visibilityState;
    return;
  }
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('App against a fixture bridge', () => {
  it('stops rendering snapshots while the window is hidden and shows the newest one when it is back', async () => {
    const bridge = installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    const battery = () => host.querySelector('.device-battery-percentage')?.textContent;
    expect(battery()).toBe('75%');

    setDocumentVisibility('hidden');
    bridge.emit(fixtureSnapshot({ status: { batteryPercent: 40 } }));
    bridge.emit(fixtureSnapshot({ status: { batteryPercent: 35 } }));
    expect(battery()).toBe('75%');

    setDocumentVisibility('visible');
    expect(battery()).toBe('35%');
  });

  it('stops the stick preview heartbeat while the window is hidden', async () => {
    const bridge = installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    await openPage(host, 'deadzones');
    expect(bridge.fn('requestStickInputPreview')).toHaveBeenCalledOnce();
    setDocumentVisibility('hidden');
    expect(bridge.fn('releaseStickInputPreview')).toHaveBeenCalledOnce();
    setDocumentVisibility('visible');
    expect(bridge.fn('requestStickInputPreview')).toHaveBeenCalledTimes(2);
  });

  it('mounts each page on its first visit and keeps it afterwards', async () => {
    installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    expect(host.querySelector('#control-panel-chords')).toBeNull();
    expect(host.querySelector('#control-panel-settings')).toBeNull();
    await openPage(host, 'chords');
    await openPage(host, 'overview');
    expect(host.querySelector('#control-panel-chords')?.classList.contains('active')).toBe(false);
    expect(host.querySelector('#control-panel-overview.active')).not.toBeNull();
  });

  it('replaces the startup placeholder once a snapshot arrives and opens Overview', async () => {
    installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    expect(host.querySelector('.startup-placeholder-page')).toBeNull();
    expect(host.querySelector('#control-panel-overview.active h2')?.textContent).toBe('Overview');
  });

  it('shows saved feedback, trigger, and lightbar values without snapping them to slider notches', async () => {
    installBridgeMock(fixtureSnapshot({
      settings: { hapticsGainPercent: 137, triggerEffectIntensityPercent: 33, lightbarBrightnessPercent: 47 }
    }));
    const host = await renderApp();
    const firstRange = async (tab: string) => (await openPage(host, tab)).querySelector<HTMLInputElement>('input[type="range"]')!.value;
    expect(await firstRange('haptics')).toBe('137');
    expect(await firstRange('triggers')).toBe('33');
    expect(await firstRange('lighting')).toBe('47');
  });

  it('dims the shell and locks each page switch while the controller is away', async () => {
    installBridgeMock(fixtureSnapshot({ status: { controllerConnected: false } }));
    const host = await renderApp();
    expect(host.querySelector('.shell')?.classList.contains('controller-unavailable')).toBe(true);
    for (const tab of ['haptics', 'audio', 'triggers', 'lighting']) {
      const page = await openPage(host, tab);
      const pageSwitch = page.querySelector<HTMLButtonElement>('.feature-heading .inline-switch [role="switch"]');
      expect(pageSwitch?.disabled, tab).toBe(true);
    }
  });

  it('asks for the controller confirmation over any page and cancels it through the bridge', async () => {
    const bridge = installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    await openPage(host, 'lighting');
    expect(document.querySelector('.bootloader-confirmation-modal')).toBeNull();

    bridge.emit(fixtureSnapshot({
      bootloaderConfirmation: {
        purpose: 'bootloader-entry',
        sequence: ['cross', 'circle', 'square', 'triangle', 'cross', 'cross', 'circle', 'square'],
        progress: 0,
        mistakes: 0,
        expiresAtUnixMs: Date.now() + 30_000
      }
    }));
    expect(document.querySelector('.bootloader-confirmation-modal #bootloader-confirmation-title')?.textContent)
      .toBe('Confirm UF2 update mode');
    expect(host.querySelector('#control-panel-lighting.active')).not.toBeNull();

    bridge.fn('cancelBootloaderConfirmation').mockImplementation(async () => fixtureSnapshot());
    await click(buttonByText(document.querySelector('.bootloader-confirmation-footer')!, 'Cancel'));
    expect(bridge.fn('cancelBootloaderConfirmation')).toHaveBeenCalledOnce();
    expect(document.querySelector('.bootloader-confirmation-modal')).toBeNull();
  });

  it('shows why Mount stopped in the Settings firmware tools', async () => {
    const bridge = installBridgeMock(fixtureSnapshot());
    bridge.fn('mountPicoBootloader').mockResolvedValue({
      ok: false,
      action: 'mount',
      message: 'Connect a controller to this Pico to confirm UF2 mode, or hold BOOTSEL while plugging the Pico in.'
    });
    const host = await renderApp();
    await openPage(host, 'settings');
    await click([...host.querySelectorAll('.settings-section-button')].find((button) => button.textContent === 'Bridge Firmware'));
    await click(buttonByText(host.querySelector('.pico-firmware-actions')!, 'Mount'));
    expect(host.querySelector('.pico-firmware-message.bad')?.textContent).toBe(
      'Connect a controller to this Pico to confirm UF2 mode, or hold BOOTSEL while plugging the Pico in.'
    );
  });

  it('labels the sidebar power indicator as charging or connected to power', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ status: { rawPowerState: 0x01 } }));
    const host = await renderApp();
    const indicator = () => host.querySelector('.device-power-indicator')?.getAttribute('aria-label');
    expect(indicator()).toBe('Charging');
    bridge.emit(fixtureSnapshot({ status: { rawPowerState: 0x02 } }));
    expect(indicator()).toBe('Connected to power');
    bridge.emit(fixtureSnapshot({ status: { rawPowerState: 0x00 } }));
    expect(indicator()).toBeUndefined();
  });

  it('keeps all four abbreviated personas on the Overview quick actions and switches through the bridge', async () => {
    const bridge = installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    const personas = [...host.querySelectorAll<HTMLButtonElement>('.overview-persona-grid .overview-persona-button')];
    expect(personas.map((button) => button.textContent)).toEqual(['DS', 'DSE', 'DS4', 'XBOX']);
    expect(personas.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Switch to DualSense mode',
      'Switch to DualSense Edge mode',
      'Switch to DualShock 4 mode',
      'Switch to Xbox mode'
    ]);
    expect(personas[0].getAttribute('aria-pressed')).toBe('true');

    await click(personas[0]);
    expect(bridge.fn('setHostPersonaMode')).not.toHaveBeenCalled();
    await click(personas[3]);
    expect(bridge.fn('setHostPersonaMode')).toHaveBeenCalledWith('xbox');
  });

  it('opens every sidebar page', async () => {
    installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    for (const tab of ['devices', 'audio', 'haptics', 'triggers', 'lighting', 'deadzones', 'remapping', 'chords', 'audio-haptics', 'trigger-lab', 'system']) {
      const panel = await openPage(host, tab);
      expect(panel.querySelector('h2'), tab).not.toBeNull();
    }
  });
});
