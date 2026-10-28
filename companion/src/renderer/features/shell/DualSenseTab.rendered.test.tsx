// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
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

const strip = (host: HTMLElement) => host.querySelector<HTMLElement>('.control-page.active .studio-tab-strip');
const sectionTab = (host: HTMLElement, section: string) => (
  strip(host)?.querySelector<HTMLButtonElement>(`[data-dualsense-section="${section}"]`) ?? null
);

describe('DualSense tab', () => {
  it('groups Audio, Haptics, Triggers and Lighting under one sidebar entry', async () => {
    installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    expect([...host.querySelectorAll('#control-group-panel-controller .control-tab-button')].map((button) => button.textContent))
      .toEqual(['Devices', 'DualSense']);
    for (const section of ['audio', 'haptics', 'triggers', 'lighting']) {
      expect(host.querySelector(`#control-tab-${section}`)).toBeNull();
    }

    await click(host.querySelector('#control-tab-dualsense'));
    expect(host.querySelector('#control-panel-audio.active')).not.toBeNull();
    expect(host.querySelector('#control-tab-dualsense')?.getAttribute('aria-current')).toBe('page');
    // The strip sits above the page's own header, as in Kitsune Input's Controller Studio.
    expect(strip(host)?.nextElementSibling?.classList.contains('feature-heading')).toBe(true);
    expect([...strip(host)!.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent))
      .toEqual(['Audio', 'Haptics', 'Triggers', 'Lighting']);
    expect(sectionTab(host, 'audio')?.getAttribute('aria-selected')).toBe('true');
  });

  it('moves between sections from the strip and reopens the last one', async () => {
    installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    await openPage(host, 'dualsense');
    await click(sectionTab(host, 'triggers'));
    expect(host.querySelector('#control-panel-triggers.active h2')?.textContent).toBe('Adaptive Triggers');
    expect(sectionTab(host, 'triggers')?.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('#control-tab-dualsense')?.getAttribute('aria-current')).toBe('page');

    await act(async () => sectionTab(host, 'triggers')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    ));
    expect(host.querySelector('#control-panel-lighting.active')).not.toBeNull();

    await click(host.querySelector('#control-tab-overview'));
    await click(host.querySelector('#control-tab-dualsense'));
    expect(host.querySelector('#control-panel-lighting.active')).not.toBeNull();
  });

  it('leaves the strip off Audio Haptics and Trigger Lab, which reuse those pages', async () => {
    installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    await openPage(host, 'haptics');
    expect(strip(host)).not.toBeNull();
    await openPage(host, 'audio-haptics');
    expect(host.querySelector('#control-panel-haptics.active')).not.toBeNull();
    expect(strip(host)).toBeNull();
    await openPage(host, 'trigger-lab');
    expect(host.querySelector('#control-panel-triggers.active')).not.toBeNull();
    expect(strip(host)).toBeNull();
    expect(host.querySelector('#control-tab-dualsense')?.getAttribute('aria-current')).toBeNull();
  });
});
