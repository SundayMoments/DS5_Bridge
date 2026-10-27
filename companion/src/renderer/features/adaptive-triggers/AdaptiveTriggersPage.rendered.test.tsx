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
  unmountApp
} from '../../test-support/app-harness';

beforeAll(installDomStubs);
afterEach(unmountApp);

const triggersOn = { settings: { adaptiveTriggersEnabled: true, triggerEffectIntensityPercent: 100 } };

describe('Adaptive Triggers page', () => {
  it('sets intensity, test mode, and target, then tests and resets the triggers', async () => {
    const bridge = installBridgeMock(fixtureSnapshot(triggersOn));
    const host = await renderApp();
    const page = await openPage(host, 'triggers');

    expect(page.querySelector('h2')?.textContent).toBe('Adaptive Triggers');
    await click(buttonByText(page.querySelector('.preset-card .segmented-row')!, 'Medium'));
    expect(bridge.fn('setTriggerEffectIntensity')).toHaveBeenLastCalledWith(70);

    await chooseOption(page, 'Trigger test type', 'Weapon');
    expect(bridge.fn('setTriggerTestMode')).toHaveBeenCalledWith('weapon');

    await click(buttonByText(page.querySelector('.target-row')!, 'L2'));
    await click(buttonByText(page, 'Test Triggers'));
    expect(bridge.fn('testAdaptiveTriggers')).toHaveBeenCalledWith('feedback', 'l2');
    expect(page.querySelector('.test-card .status-badge strong')?.textContent).toBe('Testing');

    await click(buttonByText(page, 'Reset Triggers'));
    expect(bridge.fn('resetAdaptiveTriggers')).toHaveBeenCalled();
  });

  it('turns adaptive triggers off from the heading switch', async () => {
    const bridge = installBridgeMock(fixtureSnapshot(triggersOn));
    const host = await renderApp();
    const page = await openPage(host, 'triggers');
    await click(page.querySelector('.feature-heading [role="switch"]'));
    expect(bridge.fn('setAdaptiveTriggersEnabled')).toHaveBeenCalledWith(false);
  });

  it('holds tests while a game drives the triggers', async () => {
    installBridgeMock(fixtureSnapshot({ ...triggersOn, status: { adaptiveTriggerOutputRecent: true } }));
    const host = await renderApp();
    const page = await openPage(host, 'triggers');
    const test = buttonByText(page, 'Game Triggers Active')!;
    expect(test.disabled).toBe(true);
    expect(page.querySelector('.test-card .status-badge strong')?.textContent).toBe('Game Triggers Active');
  });
});

const customProfile = {
  id: 'custom',
  name: 'Custom',
  mode: 'weapon',
  startPercent: 20,
  wallPercent: 60,
  forcePercent: 85,
  active: true
};
const customDraft = { profileId: 'custom', mode: 'weapon', startPercent: 20, wallPercent: 60, forcePercent: 85 };

function storeLabWorkspace(enabled: boolean, active: boolean) {
  window.localStorage.setItem('ds5bridge.triggerLabProfiles', JSON.stringify([customProfile]));
  window.localStorage.setItem('ds5bridge.triggerLabWorkspace', JSON.stringify({
    enabled,
    linked: true,
    drafts: { l2: customDraft, r2: customDraft },
    active: { l2: active, r2: active },
    splitState: null
  }));
}

describe('Trigger Lab page', () => {
  it('enables the lab without touching the global adaptive-trigger setting', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ settings: { adaptiveTriggersEnabled: false } }));
    const host = await renderApp();
    const page = await openPage(host, 'trigger-lab');

    expect(page.querySelector('h2')?.textContent).toBe('Trigger Lab');
    expect([...page.querySelectorAll('.trigger-lab-card h3')].map((title) => title.textContent))
      .toEqual(['Left Trigger', 'Right Trigger']);
    const labSwitch = page.querySelector<HTMLButtonElement>('[role="switch"][aria-label="Enable Trigger Lab"]')!;
    // The header's icon tile toggles the lab too, as in Kitsune Input.
    expect(page.querySelector('.studio-heading-copy .feature-icon')?.getAttribute('aria-label')).toBe('Enable Trigger Lab');
    expect(labSwitch.getAttribute('aria-checked')).toBe('false');
    await click(labSwitch);
    expect(labSwitch.getAttribute('aria-checked')).toBe('true');
    expect(bridge.fn('setAdaptiveTriggersEnabled')).not.toHaveBeenCalled();

    await click(labSwitch);
    expect(bridge.fn('resetAdaptiveTriggers')).toHaveBeenCalledOnce();
  });

  it('applies a linked lab effect to both triggers and shows the override badge', async () => {
    storeLabWorkspace(true, false);
    const bridge = installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    const page = await openPage(host, 'trigger-lab');
    expect(page.querySelector('.trigger-lab-state')).toBeNull();

    await click(page.querySelector('[role="switch"][aria-label="Left Trigger persistent lab effect"]'));
    expect(bridge.fn('applyAdaptiveTriggerEffect')).toHaveBeenLastCalledWith({
      mode: 'weapon',
      target: 'both',
      startPercent: 20,
      wallPercent: 60,
      forcePercent: 85
    });
    expect(page.querySelector('.trigger-lab-state')?.textContent).toBe('Lab Override');

    await click(buttonByText(page.querySelector('.trigger-lab-card')!, /Preview/));
    expect(bridge.fn('previewAdaptiveTriggerEffect')).toHaveBeenCalledOnce();

    await click(buttonByText(page.querySelector('.trigger-lab-card')!, /Linked/));
    expect(page.querySelector('.trigger-lab-chip-label')?.textContent).toBe('Split');
  });

  it('reapplies active lab effects on reconnect and after the global setting changes', async () => {
    storeLabWorkspace(true, true);
    const bridge = installBridgeMock(fixtureSnapshot({ settings: { adaptiveTriggersEnabled: true } }));
    await renderApp();
    const apply = bridge.fn('applyAdaptiveTriggerEffect');
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ target: 'both', forcePercent: 85 }));
    const restores = apply.mock.calls.length;

    bridge.emit(fixtureSnapshot({ settings: { adaptiveTriggersEnabled: false } }));
    await act(async () => undefined);
    expect(apply.mock.calls.length).toBeGreaterThan(restores);
  });

  it('saves the current draft as a named profile', async () => {
    storeLabWorkspace(true, false);
    installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    const page = await openPage(host, 'trigger-lab');
    await click(page.querySelector('button.custom-select-button[aria-label="Left Trigger lab profile"]'));
    await click(document.querySelector('[aria-label="Save new trigger profile"]'));
    const dialog = host.querySelector('[role="dialog"][aria-label="Trigger Lab profile"]')!;
    expect(dialog.querySelector('input')?.value).toBe('Custom Trigger 2');
    await act(async () => {
      dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });
    expect(host.querySelector('[role="dialog"][aria-label="Trigger Lab profile"]')).toBeNull();
    const profiles = JSON.parse(window.localStorage.getItem('ds5bridge.triggerLabProfiles')!) as Array<{ name: string }>;
    expect(profiles.map((profile) => profile.name)).toEqual(['Custom', 'Custom Trigger 2']);
  });
});
