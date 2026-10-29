// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buttonByText,
  click,
  fixtureSnapshot,
  installBridgeMock,
  installDomStubs,
  renderApp,
  setRange,
  unmountApp
} from '../../test-support/app-harness';
import { SLEEP_CONFIRM_MS } from './use-overview-controller';

beforeAll(installDomStubs);
afterEach(() => {
  vi.useRealTimers();
  unmountApp();
});

function overviewPage(host: HTMLElement) {
  const page = host.querySelector<HTMLElement>('#control-panel-overview.active');
  if (!page) throw new Error('Overview is not open');
  return page;
}

function field(page: HTMLElement, card: string, label: string) {
  const cardElement = [...page.querySelectorAll('.overview-card')].find((element) => element.querySelector('h3')?.textContent === card);
  const row = [...(cardElement?.querySelectorAll('.overview-fields > div') ?? [])]
    .find((element) => element.querySelector('span')?.textContent === label);
  return row?.querySelector<HTMLElement>('strong') ?? null;
}

describe('Overview page', () => {
  it('summarises the connection, audio path, audio, and wireless link', async () => {
    installBridgeMock(fixtureSnapshot({ settings: { speakerVolumePercent: 80 } }));
    const page = overviewPage(await renderApp());
    expect(page.querySelector('.overview-health')?.textContent).toBe('All systems normal');
    expect(field(page, 'Connection', 'USB')?.textContent).toBe('Stable');
    expect(field(page, 'Connection', 'Polling Rate')?.textContent).toBe('1000 Hz');
    expect(field(page, 'Audio Path', 'Route')?.textContent).toBe('Pico Local');
    expect(field(page, 'Audio Path', 'Status')?.textContent).toBe('Waiting');
    expect(field(page, 'Audio', 'Route')?.textContent).toBe('Speaker');
    expect(field(page, 'Audio', 'Volume')?.textContent).toBe('80%');
    const signal = field(page, 'Wireless', 'Signal');
    expect(signal?.textContent).toBe('Excellent');
    expect(signal?.title).toBe('-14 dBm');
    expect(signal?.classList.contains('good')).toBe(true);
    expect(field(page, 'Wireless', 'Firmware')?.textContent).toBe('2.0.0');
  });

  it('opens the page behind a status card', async () => {
    installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    await click(overviewPage(host).querySelector('.overview-card'));
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(host.querySelector('#control-panel-system.active')).not.toBeNull();
  });

  it('asks for a second press before putting the controller to sleep', async () => {
    const bridge = installBridgeMock(fixtureSnapshot());
    const page = overviewPage(await renderApp());
    // As in Kitsune Input, Sleep Controller is the one action under the personas.
    const actions = page.querySelector('.overview-quick-actions .overview-persona-grid + .overview-sleep-row')!;
    expect([...actions.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Sleep Controller']);
    expect(page.textContent).not.toMatch(/Test Haptics|Test Speaker|Listen Mic/);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await click(buttonByText(actions, 'Sleep Controller'));
    expect(bridge.fn('sleepController')).not.toHaveBeenCalled();
    expect(buttonByText(actions, 'Confirm Sleep')?.classList.contains('confirm')).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(SLEEP_CONFIRM_MS); });
    expect(buttonByText(actions, 'Sleep Controller')).toBeDefined();

    await click(buttonByText(actions, 'Sleep Controller'));
    await click(buttonByText(actions, 'Confirm Sleep'));
    expect(bridge.fn('sleepController')).toHaveBeenCalledOnce();
  });

  it('keeps all four abbreviated personas on the quick actions and switches through the bridge', async () => {
    const bridge = installBridgeMock(fixtureSnapshot());
    const page = overviewPage(await renderApp());
    const personas = [...page.querySelectorAll<HTMLButtonElement>('.overview-persona-grid .overview-persona-button')];
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

  it('offers no persona switch while no controller is connected', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ status: { controllerConnected: false } }));
    const page = overviewPage(await renderApp());
    const personas = [...page.querySelectorAll<HTMLButtonElement>('.overview-persona-grid .overview-persona-button')];
    // A persona is how the bridge presents a controller; without one there is nothing to switch.
    expect(personas.map((button) => button.disabled)).toEqual([true, true, true, true]);
    await click(personas[3]);
    expect(bridge.fn('setHostPersonaMode')).not.toHaveBeenCalled();
  });

  it('writes a quick control when the slider is released', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ settings: { hapticsEnabled: true, hapticsGainPercent: 100 } }));
    bridge.fn('setHapticsGain').mockImplementation(async (value: number) => (
      fixtureSnapshot({ settings: { hapticsEnabled: true, hapticsGainPercent: value } })
    ));
    const page = overviewPage(await renderApp());
    const haptics = [...page.querySelectorAll('.overview-slider-row')]
      .find((row) => row.querySelector('span')?.textContent === 'Haptics')!;
    await setRange(haptics.querySelector<HTMLInputElement>('input[type="range"]')!, 140);
    expect(bridge.fn('setHapticsGain')).toHaveBeenCalledWith(140);
    expect(haptics.querySelector('strong')?.textContent).toBe('140%');
  });

  it('jumps from the settings summary to the matching setting', async () => {
    installBridgeMock(fixtureSnapshot({
      settings: { sleepKeybindEnabled: true, notifyControllerConnection: false, notifyLowBattery: false }
    }));
    const host = await renderApp();
    const summary = overviewPage(host).querySelector('.overview-status-panel')!;
    const notificationsGroup = [...summary.querySelectorAll('.overview-status-group')]
      .find((group) => group.querySelector('.overview-status-heading')?.textContent === 'Notifications')!;

    await click(buttonByText(notificationsGroup, 'Off'));
    expect(host.querySelector('.notifications-menu')?.getAttribute('data-open')).toBe('true');
    expect(host.querySelectorAll('.notifications-menu .settings-menu-row-highlight')).toHaveLength(2);

    await click(summary.querySelector('.overview-shortcut-chip'));
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(host.querySelector('#control-panel-settings.active')).not.toBeNull();
  });

  it('opens Settings › Shortcuts with every shortcut framed when none are on', async () => {
    installBridgeMock(fixtureSnapshot({
      settings: { sleepKeybindEnabled: false, speakerVolumeShortcutEnabled: false }
    }));
    const host = await renderApp();
    const summary = overviewPage(host).querySelector('.overview-status-panel')!;
    await click(buttonByText(summary, 'None enabled'));
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(host.querySelector('#control-panel-settings.active')).not.toBeNull();
    expect([...host.querySelectorAll('.settings-page .settings-menu-row-highlight strong')].map((label) => label.textContent))
      .toEqual(['Sleep Shortcut', 'Volume Shortcut']);
  });
});
