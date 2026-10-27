// @vitest-environment jsdom
import { act } from 'react';
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
  setRange,
  unmountApp
} from '../../test-support/app-harness';

beforeAll(installDomStubs);
afterEach(unmountApp);

const audioOn = { settings: { speakerEnabled: true, speakerVolumePercent: 100, hapticsBufferLength: 64 } };

describe('Audio page', () => {
  it('sets speaker volume and gain and toggles audio', async () => {
    const bridge = installBridgeMock(fixtureSnapshot(audioOn));
    const host = await renderApp();
    const page = await openPage(host, 'audio');

    expect(page.querySelector('h2')?.textContent).toBe('Audio');
    await click(buttonByText(page.querySelector('.preset-card .segmented-row')!, 'Medium'));
    expect(bridge.fn('setSpeakerVolume')).toHaveBeenCalledWith(70);

    await chooseOption(page, 'Speaker gain', '3');
    expect(bridge.fn('setSpeakerGainLevel')).toHaveBeenCalledWith(3);

    const headerSwitch = page.querySelector('.studio-feature-heading [role="switch"]')!;
    expect(headerSwitch.parentElement?.textContent).toBe('Speaker Enabled');
    expect(headerSwitch.getAttribute('aria-label')).toBe('Disable speaker');
    await click(headerSwitch);
    expect(bridge.fn('setSpeakerEnabled')).toHaveBeenCalledWith(false);
    expect(bridge.fn('setDuplexMicEnabled')).not.toHaveBeenCalled();
  });

  it('locks controls during an action and marks the shell so their disabled look can wait', async () => {
    const bridge = installBridgeMock(fixtureSnapshot(audioOn));
    let finish!: () => void;
    bridge.fn('setSpeakerEnabled').mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve(fixtureSnapshot({ settings: { ...audioOn.settings, speakerEnabled: false } }));
    }));
    const host = await renderApp();
    const page = await openPage(host, 'audio');
    const shell = host.querySelector('.shell')!;
    const headerSwitch = page.querySelector<HTMLButtonElement>('.studio-feature-heading [role="switch"]')!;
    expect(shell.hasAttribute('data-app-action-pending')).toBe(false);
    await click(headerSwitch);
    expect(shell.hasAttribute('data-app-action-pending')).toBe(true);
    expect(headerSwitch.disabled).toBe(true);
    // A second click during the action is refused, not queued.
    await click(headerSwitch);
    expect(bridge.fn('setSpeakerEnabled')).toHaveBeenCalledOnce();
    await act(async () => finish());
    expect(shell.hasAttribute('data-app-action-pending')).toBe(false);
    expect(headerSwitch.disabled).toBe(false);
  });

  it('turns the selected tab’s feature on and off from both header controls', async () => {
    // The speaker is on and the mic off: on the Mic tab, the header follows the mic, not the speaker.
    const bridge = installBridgeMock(fixtureSnapshot({ settings: { ...audioOn.settings, duplexMicEnabled: false } }));
    const host = await renderApp();
    const page = await openPage(host, 'audio');
    const speakerSwitch = page.querySelector('.studio-feature-heading [role="switch"]')!;
    await click(buttonByText(page.querySelector('.audio-mode-selector')!, 'Mic'));
    const headerSwitch = page.querySelector('.studio-feature-heading [role="switch"]')!;
    // A new switch for the new feature, so its knob does not slide across on the tab change.
    expect(headerSwitch).not.toBe(speakerSwitch);
    const headerIcon = page.querySelector('.studio-heading-copy .feature-icon')!;
    expect(headerSwitch.parentElement?.textContent).toBe('Mic Enabled');
    expect(headerSwitch.getAttribute('aria-checked')).toBe('false');
    expect(headerIcon.getAttribute('aria-pressed')).toBe('false');
    await click(headerSwitch);
    expect(bridge.fn('setDuplexMicEnabled')).toHaveBeenLastCalledWith(true);
    await click(headerIcon);
    expect(bridge.fn('setDuplexMicEnabled')).toHaveBeenCalledTimes(2);
    expect(bridge.fn('setSpeakerEnabled')).not.toHaveBeenCalled();
  });

  it('keeps the firmware-gated buffer length under the speaker presets only', async () => {
    const bridge = installBridgeMock(fixtureSnapshot(audioOn));
    bridge.fn('setHapticsBufferLength').mockImplementation(async (length: number) => fixtureSnapshot({
      settings: { ...audioOn.settings, hapticsBufferLength: length }
    }));
    const host = await renderApp();
    const page = await openPage(host, 'audio');

    const presetCard = page.querySelector('.preset-card')!;
    const buffer = presetCard.querySelector('.audio-buffer-control')!;
    expect(buffer.classList.contains('disabled')).toBe(false);
    expect(buffer.previousElementSibling ?? buffer.parentElement?.previousElementSibling)
      .toBe(presetCard.querySelector('.segmented-row'));
    expect(buffer.querySelector('.audio-buffer-title')?.textContent).toContain('Audio Buffer Length');
    expect(buffer.querySelector('.audio-buffer-title svg')).toBeNull();
    const slider = buffer.querySelector<HTMLInputElement>('input[aria-label="Audio buffer length"]')!;
    expect(slider.getAttribute('aria-valuetext')).toBe('64, 21.3 ms, Safe');

    await setRange(slider, 40);
    expect(bridge.fn('setHapticsBufferLength')).toHaveBeenCalledWith(40);
    expect(buffer.querySelector('.audio-buffer-status-icon')?.getAttribute('aria-label')).toBe('High stutter');

    await click(buttonByText(page.querySelector('.audio-mode-selector')!, 'Mic'));
    expect(page.querySelector('.audio-buffer-control')).toBeNull();
  });

  it('locks the buffer length on firmware without the control', async () => {
    installBridgeMock(fixtureSnapshot({
      ...audioOn,
      status: { firmwareFlags: { ...fixtureSnapshot().status!.firmwareFlags, hapticsBufferLengthControl: false } }
    }));
    const host = await renderApp();
    const page = await openPage(host, 'audio');
    expect(page.querySelector('.audio-buffer-control')?.classList.contains('disabled')).toBe(true);
    expect(page.querySelector<HTMLInputElement>('input[aria-label="Audio buffer length"]')?.disabled).toBe(true);
  });

  it('reports a failed speaker test', async () => {
    const bridge = installBridgeMock(fixtureSnapshot(audioOn));
    bridge.fn('testSpeaker').mockRejectedValue(new Error('Controller audio endpoint unavailable'));
    const host = await renderApp();
    const page = await openPage(host, 'audio');
    await click(buttonByText(page, 'Test Speaker'));
    expect(bridge.fn('testSpeaker')).toHaveBeenCalledOnce();
    // The status keeps reading Playing until the test lock releases.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 950));
    });
    expect(page.querySelector('.audio-test-status .status-badge')?.getAttribute('title'))
      .toBe('Controller audio endpoint unavailable');
  });

  it('sets microphone volume in Mic mode', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ settings: { ...audioOn.settings, duplexMicEnabled: true, micVolumePercent: 100 } }));
    const host = await renderApp();
    const page = await openPage(host, 'audio');
    await click(buttonByText(page.querySelector('.audio-mode-selector')!, 'Mic'));
    expect(page.querySelector('.preset-card .studio-mode-tabs [aria-selected="true"]')?.textContent).toBe('Mic');
    expect(page.querySelector('.studio-heading-copy .feature-icon svg')).not.toBeNull();
    await click(buttonByText(page.querySelector('.preset-card .segmented-row')!, 'Low'));
    expect(bridge.fn('setMicVolume')).toHaveBeenCalledWith(30);
  });
});
