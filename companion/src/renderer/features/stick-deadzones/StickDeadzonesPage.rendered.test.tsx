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
  setRange,
  unmountApp
} from '../../test-support/app-harness';

beforeAll(installDomStubs);
afterEach(unmountApp);

describe('Stick Deadzones page', () => {
  it('shows one radial deadzone card per stick and only radial controls', async () => {
    installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    const page = await openPage(host, 'deadzones');

    expect(page.querySelector('h2')?.textContent).toBe('Stick Deadzones');
    const cards = [...page.querySelectorAll('.deadzone-card')];
    expect(cards.map((card) => card.querySelector('h3')?.textContent)).toEqual(['Left Stick', 'Right Stick']);
    expect(cards.every((card) => card.querySelector('.feature-icon svg'))).toBe(true);
    expect([...page.querySelectorAll('input')].map((input) => input.getAttribute('aria-label')))
      .toEqual(['Left Stick radial deadzone', 'Right Stick radial deadzone']);
    expect(page.querySelector('.system-profile-save-status')).toBeNull();
    expect(page.textContent).not.toContain('Tips');
    expect(page.textContent).not.toContain('How Radial Deadzones Work');
    expect(page.textContent).not.toContain('All Personas');
  });

  it('streams the stick preview only while the page is open', async () => {
    const bridge = installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    expect(bridge.fn('requestStickInputPreview')).not.toHaveBeenCalled();
    await openPage(host, 'deadzones');
    expect(bridge.fn('requestStickInputPreview')).toHaveBeenCalledTimes(1);
    await openPage(host, 'overview');
    expect(bridge.fn('releaseStickInputPreview')).toHaveBeenCalledTimes(1);
  });

  it('saves both sticks together from presets and the slider', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({
      settings: { leftStickRadialDeadzonePercent: 0, rightStickRadialDeadzonePercent: 5 }
    }));
    bridge.fn('setRadialDeadzones').mockImplementation(async (left: number, right: number) => fixtureSnapshot({
      settings: { leftStickRadialDeadzonePercent: left, rightStickRadialDeadzonePercent: right }
    }));
    const host = await renderApp();
    const page = await openPage(host, 'deadzones');
    const [left, right] = [...page.querySelectorAll('.deadzone-card')];

    await click(buttonByText(left!.querySelector('.deadzone-presets')!, '10%'));
    expect(bridge.fn('setRadialDeadzones')).toHaveBeenLastCalledWith(10, 5);
    expect(left!.querySelector('.deadzone-presets .active')?.textContent).toBe('10%');

    await setRange(right!.querySelector('input')!, 12);
    expect(bridge.fn('setRadialDeadzones')).toHaveBeenLastCalledWith(10, 12);
    expect(right!.querySelector('.deadzone-preview-copy strong')?.textContent).toBe('12%');
    expect(buttonByText(right!.querySelector('.deadzone-presets')!, 'Off')).toBeDefined();
  });

  it('plots the physical and adjusted stick positions from the live preview', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ settings: { leftStickRadialDeadzonePercent: 2 } }));
    const host = await renderApp();
    const page = await openPage(host, 'deadzones');
    const leftField = page.querySelector<HTMLElement>('.deadzone-stick-field')!;
    expect(leftField.style.getPropertyValue('--deadzone-diameter')).toBe('3%');
    expect(leftField.querySelector('.deadzone-center')).not.toBeNull();

    bridge.emit(fixtureSnapshot({
      settings: { leftStickRadialDeadzonePercent: 2 },
      stickInputPreview: { raw: { lx: 255, ly: 128, rx: 128, ry: 128 } } as never
    }));
    const physical = leftField.querySelector<HTMLElement>('.deadzone-position-dot.physical')!;
    expect(physical.style.left).toBe('100%');
    expect(leftField.querySelector('.deadzone-position-dot.output')).not.toBeNull();
    expect([...page.querySelectorAll('.deadzone-position-legend span')].map((item) => item.textContent))
      .toEqual(['Physical', 'Output', 'Physical', 'Output']);
  });

  it('locks the controls while the controller is away', async () => {
    installBridgeMock(fixtureSnapshot({ status: { controllerConnected: false } }));
    const host = await renderApp();
    const page = await openPage(host, 'deadzones');
    expect([...page.querySelectorAll<HTMLInputElement>('input')].every((input) => input.disabled)).toBe(true);
    expect([...page.querySelectorAll<HTMLButtonElement>('.deadzone-presets button')].every((button) => button.disabled)).toBe(true);
  });
});
