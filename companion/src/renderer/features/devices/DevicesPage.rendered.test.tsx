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
  unmountApp
} from '../../test-support/app-harness';

beforeAll(installDomStubs);
afterEach(unmountApp);

const identity = {
  addressKnown: true,
  bluetoothAddress: 'AA:BB:CC:DD:EE:FF',
  controllerName: 'DualSense Edge',
  linkKeyKnown: true,
  productId: 0x0df2,
  vendorId: 0x054c
};

describe('Devices page', () => {
  it('lists the current controller and remembers it locally', async () => {
    installBridgeMock(fixtureSnapshot({ diagnostics: { deviceIdentity: identity as never } }));
    const host = await renderApp();
    const page = await openPage(host, 'devices');

    expect(page.querySelector('h2')?.textContent).toBe('Devices');
    expect(page.querySelector('.devices-heading-copy p')?.textContent).toBe('Current and last controllers.');
    const card = page.querySelector('.trusted-device-card');
    expect(card?.querySelector('h3')?.textContent).toBe('DualSense Edge');
    expect(window.localStorage.length).toBeGreaterThan(0);
    expect(page.textContent).not.toContain('Profile');
  });

  it('starts pairing through the bridge', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ status: { controllerConnected: false } }));
    const host = await renderApp();
    const page = await openPage(host, 'devices');
    await click(buttonByText(page, 'Pair Controller'));
    expect(bridge.fn('requestControllerScan')).toHaveBeenCalledOnce();
  });

  it('shows why pairing could not start', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ status: { controllerConnected: false } }));
    bridge.fn('requestControllerScan').mockRejectedValue(new Error('Bridge busy'));
    const host = await renderApp();
    const page = await openPage(host, 'devices');
    await click(buttonByText(page, 'Pair Controller'));
    expect(page.querySelector('.devices-action-error')?.textContent).toBe('Bridge busy');
  });

  it('forgets every pairing after confirmation', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ diagnostics: { deviceIdentity: identity as never } }));
    const host = await renderApp();
    const page = await openPage(host, 'devices');
    await click(buttonByText(page, 'Forget Controllers'));
    const dialog = host.querySelector('[role="dialog"][aria-label="Forget controllers"]')!;
    expect(dialog.textContent).toContain('Forget every controller stored on the bridge?');
    await act(async () => {
      dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });
    expect(bridge.fn('forgetControllerPairings')).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="dialog"][aria-label="Forget controllers"]')).toBeNull();
  });

  it('deletes and renames one controller from its menu', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ diagnostics: { deviceIdentity: identity as never } }));
    const host = await renderApp();
    const page = await openPage(host, 'devices');

    await click(page.querySelector('.trusted-device-menu-button'));
    await click(buttonByText(page.querySelector('.trusted-device-menu')!, 'Delete'));
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Delete controller"] button[type="submit"]')!.click();
    });
    expect(bridge.fn('forgetControllerPairing')).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF');

    await click(page.querySelector('.trusted-device-menu-button'));
    await click(buttonByText(page.querySelector('.trusted-device-menu')!, 'Rename'));
    const input = host.querySelector<HTMLInputElement>('[aria-label="Rename controller"] input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Couch Pad');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Rename controller"] button[type="submit"]')!.click();
    });
    expect(page.querySelector('.trusted-device-card h3')?.textContent).toBe('Couch Pad');
  });

  it('opens from the sidebar device card', async () => {
    installBridgeMock(fixtureSnapshot());
    const host = await renderApp();
    await click(host.querySelector('[aria-label="Open Devices"]'));
    expect(host.querySelector('#control-panel-devices.active')).not.toBeNull();
  });
});
