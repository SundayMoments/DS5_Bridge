// @vitest-environment jsdom
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
afterEach(unmountApp);

describe('App against a fixture bridge', () => {
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

  it('opens every sidebar page', async () => {
    installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    for (const tab of ['devices', 'audio', 'haptics', 'triggers', 'lighting', 'deadzones', 'remapping', 'chords', 'audio-haptics', 'trigger-lab', 'system']) {
      const panel = await openPage(host, tab);
      expect(panel.querySelector('h2'), tab).not.toBeNull();
    }
  });
});
