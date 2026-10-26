// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buttonByText,
  click,
  fixtureSnapshot,
  installBridgeMock,
  installDomStubs,
  openPage,
  renderApp,
  setRange,
  unmountApp
} from '../../test-support/app-harness';

beforeAll(installDomStubs);
afterEach(() => {
  vi.useRealTimers();
  unmountApp();
});

function testButton(page: HTMLElement) {
  return page.querySelector<HTMLButtonElement>('.test-card .primary-action')!;
}

function statusLabel(page: HTMLElement) {
  return page.querySelector('.test-card .status-badge strong')?.textContent;
}

describe('Haptics page', () => {
  it('keeps the haptics and rumble tests available while game audio and output are active', async () => {
    installBridgeMock(fixtureSnapshot({
      settings: { hapticsEnabled: true, classicRumbleEnabled: true },
      status: { audioRecent: true, hostOutputRecent: true }
    }));
    const host = await renderApp();
    const page = await openPage(host, 'haptics');
    expect(testButton(page).textContent).toBe('Test Haptics');
    expect(testButton(page).disabled).toBe(false);
    expect(statusLabel(page)).toBe('Ready');

    await click(buttonByText(page, 'Rumble'));
    expect(testButton(page).textContent).toBe('Test Rumble');
    expect(testButton(page).disabled).toBe(false);
  });

  it('shows Testing while a test runs and Cooling Down from the bridge, never a game-active label', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ settings: { hapticsEnabled: true } }));
    let finish!: (value: unknown) => void;
    bridge.fn('testHaptics').mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const host = await renderApp();
    const page = await openPage(host, 'haptics');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await click(testButton(page));
    expect(testButton(page).textContent).toBe('Testing');
    expect(statusLabel(page)).toBe('Testing');
    await act(async () => finish(bridge.snapshot()));

    bridge.emit(fixtureSnapshot({ settings: { hapticsEnabled: true }, status: { testHapticsCooldown: true } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    expect(testButton(page).textContent).toBe('Cooling Down');
    expect(statusLabel(page)).toBe('Cooling Down');
    expect(page.textContent).not.toContain('Game Active');
  });

  it('shows why the bridge refused a test as Failed and lets the user retry at once', async () => {
    const reason = 'The controller audio endpoint is unavailable. Close any games using the controller and try again.';
    const bridge = installBridgeMock(fixtureSnapshot({ settings: { hapticsEnabled: true } }));
    bridge.fn('testHaptics').mockRejectedValueOnce(
      new Error(`Error invoking remote method 'bridge:testHaptics': Error: ${reason}`)
    );
    const host = await renderApp();
    const page = await openPage(host, 'haptics');

    await click(testButton(page));
    const alert = page.querySelector('.test-card [role="alert"]');
    expect(alert?.textContent).toBe(reason);
    expect(statusLabel(page)).toBe('Failed');
    expect(page.querySelector('.test-card .test-status')?.classList.contains('warn')).toBe(true);
    expect(testButton(page).disabled).toBe(false);
    expect(testButton(page).textContent).toBe('Test Haptics');
    expect(testButton(page).getAttribute('aria-describedby')).toBe(alert?.id);

    await click(testButton(page));
    expect(bridge.fn('testHaptics')).toHaveBeenCalledTimes(2);
    expect(page.querySelector('.test-card [role="alert"]')).toBeNull();
    expect(statusLabel(page)).toBe('Testing');
  });

  it('forgets a failed haptics test when switching to Rumble', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ settings: { hapticsEnabled: true, classicRumbleEnabled: true } }));
    bridge.fn('testHaptics').mockRejectedValueOnce(new Error('Haptics test failed.'));
    const host = await renderApp();
    const page = await openPage(host, 'haptics');
    await click(testButton(page));
    expect(statusLabel(page)).toBe('Failed');

    await click(buttonByText(page, 'Rumble'));
    expect(page.querySelector('.test-card [role="alert"]')).toBeNull();
    expect(statusLabel(page)).toBe('Ready');
  });

  it('marks the Overview quick action when a test fails', async () => {
    const reason = 'Haptics test failed. Close any games using the controller and try again. If it still fails, reconnect the controller.';
    const bridge = installBridgeMock(fixtureSnapshot({ settings: { hapticsEnabled: true } }));
    bridge.fn('testHaptics').mockRejectedValueOnce(new Error(reason));
    const host = await renderApp();
    const quickAction = () => buttonByText(host.querySelector('.overview-action-grid')!, /Test Haptics|Failed/)!;

    await click(quickAction());
    expect(quickAction().textContent).toBe('Failed');
    expect(quickAction().classList.contains('failed')).toBe(true);
    expect(quickAction().title).toBe(reason);
    expect(quickAction().disabled).toBe(false);
    expect(document.getElementById(quickAction().getAttribute('aria-describedby')!)?.textContent?.trim()).toBe(reason);
  });

  it('commits the test strength before running a test', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ settings: { hapticsEnabled: true, hapticsGainPercent: 100 } }));
    const host = await renderApp();
    const page = await openPage(host, 'haptics');
    await setRange(page.querySelector<HTMLInputElement>('.preset-card input[type="range"]')!, 140, false);
    await click(testButton(page));
    expect(bridge.fn('setHapticsGain')).toHaveBeenCalledWith(140);
    expect(bridge.fn('testHaptics')).toHaveBeenCalledOnce();
  });
});

describe('Audio Haptics page', () => {
  it('drives the page switch from audio haptics and turns haptics on when enabling them', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({
      settings: { hapticsEnabled: false, audioReactiveHapticsEnabled: false }
    }));
    const host = await renderApp();
    const page = await openPage(host, 'audio-haptics');
    expect(page.querySelector('h2')?.textContent).toBe('Audio Haptics');
    const pageSwitch = page.querySelector<HTMLButtonElement>('.feature-heading [role="switch"]')!;
    expect(pageSwitch.getAttribute('aria-checked')).toBe('false');

    await click(pageSwitch);
    expect(bridge.fn('setHapticsEnabled')).toHaveBeenCalledWith(true);
    expect(bridge.fn('setAudioReactiveHapticsConfig')).toHaveBeenCalledWith({ enabled: true });
    expect(bridge.fn('setHapticsEnabled').mock.invocationCallOrder[0])
      .toBeLessThan(bridge.fn('setAudioReactiveHapticsConfig').mock.invocationCallOrder[0]);
  });

  it('uses the main haptics gain and presets in the Audio Haptics card', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({
      settings: { hapticsEnabled: true, hapticsGainPercent: 120, audioReactiveHapticsEnabled: true }
    }));
    const host = await renderApp();
    const page = await openPage(host, 'audio-haptics');
    const gain = page.querySelector<HTMLInputElement>('input[aria-label="Haptics gain"]')!;
    expect(gain.value).toBe('120');
    await click(buttonByText(page.querySelector('.audio-haptics-card')!, 'High'));
    expect(bridge.fn('setHapticsGain')).toHaveBeenCalledWith(160);
    expect(page.querySelector('.audio-haptics-mode-state')?.textContent).toBe('Mixed');
  });
});
