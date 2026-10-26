// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
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
  it('leaves the startup screen once a snapshot arrives and opens Overview', async () => {
    installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    expect(host.querySelector('.startup-screen')).toBeNull();
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

  it('opens every sidebar page', async () => {
    installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    for (const tab of ['devices', 'audio', 'haptics', 'triggers', 'lighting', 'deadzones', 'remapping', 'chords', 'audio-haptics', 'trigger-lab', 'system']) {
      const panel = await openPage(host, tab);
      expect(panel.querySelector('h2'), tab).not.toBeNull();
    }
  });
});
