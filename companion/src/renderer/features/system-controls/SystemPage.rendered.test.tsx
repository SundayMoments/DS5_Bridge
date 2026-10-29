// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  buttonByText,
  chooseOption,
  click,
  fixtureSnapshot,
  installBridgeMock,
  installDomStubs,
  openPage,
  renderApp,
  unmountApp
} from '../../test-support/app-harness';

beforeAll(installDomStubs);
afterEach(unmountApp);

function repairDialog() {
  return document.querySelector<HTMLFormElement>('form[role="dialog"][aria-label="Emergency device repair"]');
}

async function openRepairDialog(page: HTMLElement) {
  await click(page.querySelector('button[aria-label="Emergency device repair"]'));
  const dialog = repairDialog();
  if (!dialog) throw new Error('The emergency repair dialog did not open');
  return dialog;
}

describe('System page', () => {
  it('offers DualSense Edge as a PlayStation host persona and switches to it', async () => {
    const bridge = installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    const page = await openPage(host, 'system');
    await click(page.querySelector('button.custom-select-button[aria-label="Host controller persona"]'));
    const options = [...document.querySelectorAll<HTMLButtonElement>(
      '[role="listbox"][aria-label="Host controller persona"] button[role="option"]'
    )];
    expect(options.map((option) => option.getAttribute('aria-label')))
      .toEqual(['DualSense', 'DualSense Edge', 'DualShock 4', 'Xbox']);
    const edge = options.find((option) => option.getAttribute('aria-label') === 'DualSense Edge')!;
    expect(edge.querySelector('.host-persona-brand-icon')).not.toBeNull();

    await click(edge);
    expect(bridge.fn('setHostPersonaMode')).toHaveBeenCalledWith('dualsense-edge');
  });

  it('asks before an emergency repair and refuses while the controller is connected', async () => {
    const bridge = installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    const page = await openPage(host, 'system');
    expect(repairDialog()).toBeNull();

    const dialog = await openRepairDialog(page);
    expect(dialog.textContent).toContain(
      'Only run this if you are running into persistent odd controller, rumble, haptics, audio, or Windows device issues.'
    );
    expect(dialog.textContent).toContain('Disconnect the controller from the bridge before running this repair.');
    expect(dialog.textContent).toContain('Controller identity based profiles in Steam, emulators, or other tools may need to be assigned again.');
    expect(dialog.textContent).toContain('DualSense controllers paired directly to Windows over Bluetooth may need to be paired again.');
    expect(dialog.querySelector('.device-cleanup-alert.bad')?.textContent?.trim())
      .toBe('Controller is still connected to the bridge.');
    expect(buttonByText(dialog, 'Run Repair')?.disabled).toBe(true);
    expect(bridge.fn('repairWindowsDeviceCache')).not.toHaveBeenCalled();

    await click(buttonByText(dialog, 'Close'));
    expect(repairDialog()).toBeNull();
  });

  it('runs the emergency repair once the controller is disconnected and shows the result', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ status: { controllerConnected: false } }));
    bridge.fn('repairWindowsDeviceCache').mockResolvedValue({ message: 'Removed 3 stale device records.' });
    const host = await renderApp();
    const page = await openPage(host, 'system');
    const dialog = await openRepairDialog(page);
    expect(dialog.querySelector('.device-cleanup-alert.bad')).toBeNull();

    await click(buttonByText(dialog, 'Run Repair'));
    expect(bridge.fn('repairWindowsDeviceCache')).toHaveBeenCalledOnce();
    expect(repairDialog()?.querySelector('.device-cleanup-alert.good')?.textContent?.trim())
      .toBe('Removed 3 stale device records.');
  });

  it('shows the bridge health in the Device card', async () => {
    installBridgeMock(fixtureSnapshot({
      settings: { wakeOnConnectEnabled: true },
      status: { controllerConnected: false }
    }));
    const host = await renderApp();
    const page = await openPage(host, 'system');
    const health = page.querySelector<HTMLElement>('.device-status-row .health-label')!;
    expect(health.textContent).toBe('Wake with controller enabled');
    expect(health.title).toBe('The Pico bridge is online. Controller wake is enabled, but no controller is connected.');
    expect(health.classList.contains('info')).toBe(true);
  });

  it('lets Mute start a chord when it sends a keyboard key', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({
      settings: {
        muteButtonMode: 'keyboard',
        muteKeyboardUsage: 0x68,
        muteKeyboardModifiers: 0,
        muteKeyboardBehavior: 'tap',
        muteKeyboardChordStarterEnabled: false
      }
    }));
    const host = await renderApp();
    const page = await openPage(host, 'system');
    const starterRow = [...page.querySelectorAll('.mute-card .select-row')]
      .find((row) => row.querySelector('.chord-starter-label'))!;
    expect(starterRow.querySelector('.chord-starter-label')?.firstChild?.textContent?.trim()).toBe('Chord Starter');
    const starterSwitch = starterRow.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(starterSwitch.getAttribute('aria-checked')).toBe('false');

    await click(starterSwitch);
    expect(bridge.fn('setMuteButtonAction')).toHaveBeenCalledWith('keyboard', 0x68, 0, 'tap', true);
  });

  it('offers Scroll Lock, Pause and Print Screen as the Mute key', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({
      settings: {
        muteButtonMode: 'keyboard',
        muteKeyboardUsage: 0x68,
        muteKeyboardModifiers: 0,
        muteKeyboardBehavior: 'tap',
        muteKeyboardChordStarterEnabled: false
      }
    }));
    const host = await renderApp();
    const page = await openPage(host, 'system');
    await chooseOption(page, 'Mute keyboard key', 'Scroll Lock');
    expect(bridge.fn('setMuteButtonAction')).toHaveBeenCalledWith('keyboard', 0x47, 0, 'tap', false);
  });

  it('switches the Device card to diagnostics and builds the debug text only then', async () => {
    installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    const page = await openPage(host, 'system');
    expect(page.querySelector('.device-card h3')?.textContent).toBe('Device');
    expect(page.querySelector('.device-card .title-copy p')?.textContent).toBe('Firmware');
    expect(page.querySelector('textarea[aria-label="Audio debug copy text"]')).toBeNull();

    await click(buttonByText(page.querySelector('[aria-label="System control mode"]')!, 'Diagnostics'));
    expect(page.querySelector('.device-card h3')?.textContent).toBe('Diagnostics');
    expect(page.querySelector('.device-card .title-copy p')?.textContent).toBe('Debug Data');
    expect(page.querySelector<HTMLTextAreaElement>('textarea[aria-label="Audio debug copy text"]')?.value)
      .toContain('firmware=2.0.0');
    expect(page.querySelector<HTMLTextAreaElement>('textarea[aria-label="Trigger trace text"]')?.value)
      .toBe('No trigger trace events captured yet.');
    expect(page.textContent).toContain('Choose a folder to start capture.');
    expect(page.textContent).toContain('No commands yet');
  });

  it('switches the polling rate', async () => {
    const bridge = installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    const page = await openPage(host, 'system');
    await chooseOption(page, 'Polling rate', '500 Hz');
    expect(bridge.fn('setPollingRateMode')).toHaveBeenCalledOnce();
  });
});
