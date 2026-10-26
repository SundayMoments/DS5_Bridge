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

    await click(page.querySelector('[role="switch"][aria-label="Enable audio"]'));
    expect(bridge.fn('setSpeakerEnabled')).toHaveBeenCalledWith(false);
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
    expect(page.querySelector('.preset-card h3')?.textContent).toBe('Microphone');
    await click(buttonByText(page.querySelector('.preset-card .segmented-row')!, 'Low'));
    expect(bridge.fn('setMicVolume')).toHaveBeenCalledWith(30);
  });
});
