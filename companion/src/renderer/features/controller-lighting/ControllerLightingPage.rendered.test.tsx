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
  setRange,
  unmountApp
} from '../../test-support/app-harness';

beforeAll(installDomStubs);
afterEach(unmountApp);

const yellow = { red: 255, green: 255, blue: 0, brightnessPercent: 50 };

function lightingSnapshot(overrides: Parameters<typeof fixtureSnapshot>[0] = {}) {
  return fixtureSnapshot({
    ...overrides,
    settings: { lightbarEnabled: true, lightbarColor: '#ffff00', lightbarBrightnessPercent: 50, ...overrides.settings },
    status: { lightbarColor: yellow, ...overrides.status }
  });
}

describe('Lighting page', () => {
  it('commits brightness presets, slider moves, and swatches with the current color', async () => {
    const bridge = installBridgeMock(lightingSnapshot());
    bridge.fn('setLightbarColor').mockImplementation(async (color: string, brightness: number) => lightingSnapshot({
      settings: { lightbarColor: color, lightbarBrightnessPercent: brightness },
      status: {
        lightbarColor: {
          red: parseInt(color.slice(1, 3), 16),
          green: parseInt(color.slice(3, 5), 16),
          blue: parseInt(color.slice(5, 7), 16),
          brightnessPercent: brightness
        }
      }
    }));
    const host = await renderApp();
    const page = await openPage(host, 'lighting');

    expect(page.querySelector('h2')?.textContent).toBe('Lighting');
    expect(page.querySelector('.lighting-status strong')?.textContent).toBe('Active');
    await click(buttonByText(page.querySelector('.segmented-row')!, 'High'));
    expect(bridge.fn('setLightbarColor')).toHaveBeenLastCalledWith('#ffff00', 100);

    await setRange(page.querySelector<HTMLInputElement>('input[type="range"]')!, 70);
    expect(bridge.fn('setLightbarColor')).toHaveBeenLastCalledWith('#ffff00', 70);

    await click(page.querySelector('.behavior-swatches button[title="Red #FF0000"]'));
    expect(bridge.fn('setLightbarColor')).toHaveBeenLastCalledWith('#ff0000', 70);
  });

  it('toggles lighting and the override through the bridge', async () => {
    const bridge = installBridgeMock(lightingSnapshot());
    const host = await renderApp();
    const page = await openPage(host, 'lighting');
    await click(page.querySelector('[aria-label="Enable lighting"]'));
    expect(bridge.fn('setLightbarEnabled')).toHaveBeenCalledWith(false);
    await click(page.querySelector('.behavior-toggle-row [role="switch"]'));
    expect(bridge.fn('setLightbarOverrideEnabled')).toHaveBeenCalledWith(true);
  });

  it('primes the empty custom swatch, then picks and saves a palette color', async () => {
    const bridge = installBridgeMock(lightingSnapshot());
    const host = await renderApp();
    const page = await openPage(host, 'lighting');
    const customSwatch = page.querySelector<HTMLButtonElement>('.custom-color-swatch')!;
    await click(customSwatch);
    expect(customSwatch.classList.contains('primed')).toBe(true);

    await act(async () => {
      customSwatch.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    const picker = page.querySelector('[aria-label="Custom light bar color picker"]')!;
    expect(picker).not.toBeNull();
    const cell = picker.querySelector<HTMLButtonElement>('[role="gridcell"]')!;
    await click(cell);
    const color = cell.getAttribute('aria-label')!.split(' ').pop()!.toLowerCase();
    expect(bridge.fn('setLightbarColor')).toHaveBeenLastCalledWith(color, 50);

    await click(buttonByText(picker, 'Use Color'));
    expect(window.localStorage.getItem('ds5bridge.customLightbarColor')).toBe(color);
    expect(page.querySelector('[aria-label="Custom light bar color picker"]')).toBeNull();
  });

  it('remembers a custom color the controller reports', async () => {
    installBridgeMock(lightingSnapshot({ status: { lightbarColor: { red: 18, green: 52, blue: 86, brightnessPercent: 50 } } }));
    const host = await renderApp();
    const page = await openPage(host, 'lighting');
    expect(window.localStorage.getItem('ds5bridge.customLightbarColor')).toBe('#123456');
    expect(page.querySelector('.custom-color-swatch')?.getAttribute('aria-pressed')).toBe('true');
    expect(page.querySelector('.light-color-meta span')?.textContent).toBe('#123456');
  });

  it('caps brightness while power saving is active', async () => {
    installBridgeMock(lightingSnapshot({
      settings: { controllerPowerSavingEnabled: true, lightbarBrightnessPercent: 100 },
      diagnostics: { audioStatus: { headsetPlugged: true } as never }
    }));
    const host = await renderApp();
    const page = await openPage(host, 'lighting');
    const slider = page.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(slider.max).toBe('60');
    expect(slider.value).toBe('60');
    expect(page.querySelector('.lighting-enable-button')?.classList.contains('power-saving-active')).toBe(true);
  });
});
