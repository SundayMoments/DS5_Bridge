// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_BUTTON_REMAP_PROFILE } from '@shared/protocol';
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

const customProfile = { ...DEFAULT_BUTTON_REMAP_PROFILE, id: 'custom-1', name: 'Racing' };

async function submitDialog(host: HTMLElement) {
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[role="dialog"][aria-label="Button remapping profile"] button[type="submit"]')!.click();
  });
}

describe('Button Remapping page', () => {
  it('lays out every DualSense Edge slot around the controller art', async () => {
    installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    const page = await openPage(host, 'remapping');

    expect(page.querySelector('h2')?.textContent).toBe('Button Remapping');
    expect(page.querySelectorAll('.remapping-side-left .remapping-pill')).toHaveLength(8);
    expect(page.querySelectorAll('.remapping-side-right .remapping-pill')).toHaveLength(8);
    expect([...page.querySelectorAll('.remapping-edge-layer [data-remap-button-id]')].map((pill) => pill.getAttribute('data-remap-button-id')))
      .toEqual(['lb', 'rb', 'lfn', 'rfn']);
    expect(page.querySelector('.remapping-side-left img')?.getAttribute('alt')).toBe('L2');
    expect(page.querySelector('.remapping-controller-art')?.getAttribute('src')).toContain('edge');
  });

  it('hides the Edge back buttons for a standard DualSense', async () => {
    installBridgeMock(fixtureSnapshot({ status: { controllerType: 'dualsense' } }));
    const host = await renderApp();
    const page = await openPage(host, 'remapping');
    expect(page.querySelector('.remapping-edge-layer')).toBeNull();
  });

  it('keeps the Edge layout from the last controller while none is connected', async () => {
    window.localStorage.setItem('ds5bridge.lastRemapControllerType', 'dualsense-edge');
    installBridgeMock(fixtureSnapshot({ status: { controllerConnected: false, controllerType: 'unknown' } }));
    const host = await renderApp();
    const page = await openPage(host, 'remapping');
    expect(page.querySelector('.remapping-edge-layer')).not.toBeNull();
  });

  it('remaps a slot and restores the defaults', async () => {
    const bridge = installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    const page = await openPage(host, 'remapping');

    await chooseOption(page, 'Cross remap target', 'Circle');
    expect(bridge.fn('setButtonRemap')).toHaveBeenCalledWith('cross', 'circle');
    expect(page.querySelector('[data-remap-button-id="cross"]')?.classList.contains('changed')).toBe(true);

    await click(buttonByText(page, 'Restore Defaults'));
    expect(bridge.fn('restoreButtonRemappingDefaults')).toHaveBeenCalledOnce();
  });

  it('saves a new profile and locks rename and delete for the default', async () => {
    const bridge = installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    const page = await openPage(host, 'remapping');
    expect(buttonByText(page, 'Rename Profile')?.disabled).toBe(true);
    expect(buttonByText(page, 'Delete Profile')?.disabled).toBe(true);

    await click(buttonByText(page, 'Save New Profile'));
    const input = host.querySelector<HTMLInputElement>('[role="dialog"][aria-label="Button remapping profile"] input')!;
    expect(input.value).toBe('Custom Profile 1');
    await submitDialog(host);
    expect(bridge.fn('saveButtonRemappingProfile')).toHaveBeenCalledWith('Custom Profile 1');
  });

  it('selects, renames, and deletes a custom profile', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({
      settings: {
        buttonRemappingProfiles: [DEFAULT_BUTTON_REMAP_PROFILE, customProfile],
        selectedButtonRemappingProfileId: 'custom-1'
      }
    }));
    const host = await renderApp();
    const page = await openPage(host, 'remapping');

    await chooseOption(page, 'Button remapping profile', 'Default');
    expect(bridge.fn('selectButtonRemappingProfile')).toHaveBeenCalledWith('default');

    await click(buttonByText(page, 'Rename Profile'));
    const input = host.querySelector<HTMLInputElement>('[role="dialog"][aria-label="Button remapping profile"] input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Rally');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await submitDialog(host);
    expect(bridge.fn('renameButtonRemappingProfile')).toHaveBeenCalledWith('custom-1', 'Rally');

    await click(buttonByText(page, 'Delete Profile'));
    expect(host.querySelector('[role="dialog"][aria-label="Button remapping profile"]')?.textContent).toContain('Delete Racing?');
    await submitDialog(host);
    expect(bridge.fn('deleteButtonRemappingProfile')).toHaveBeenCalledWith('custom-1');
  });
});
