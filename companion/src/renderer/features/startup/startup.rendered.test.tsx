// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BridgeSnapshot } from '@shared/types';
import { App } from '../../App';
import { RendererLocalization } from '../../composition/RendererLocalization';
import { buttonByText, click, fixtureSnapshot, installBridgeMock, installDomStubs } from '../../test-support/app-harness';
import { STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY } from './startup-tutorial-storage';

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(installDomStubs);

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = '';
  window.localStorage.clear();
  vi.useRealTimers();
});

async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<RendererLocalization><App /></RendererLocalization>);
  });
}

describe('startup', () => {
  it('renders the shell at once and swaps the placeholder for the page as soon as a snapshot arrives', async () => {
    window.localStorage.setItem(STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY, '1');
    const bridge = installBridgeMock(fixtureSnapshot());
    let resolveStatus!: (snapshot: BridgeSnapshot) => void;
    bridge.fn('getStatus').mockImplementation(() => new Promise<BridgeSnapshot>((resolve) => { resolveStatus = resolve; }));
    await mount();

    expect(host.querySelector('.startup-screen')).toBeNull();
    expect(host.querySelector('.shell.starting .window-bar')).not.toBeNull();
    expect(host.querySelector('.shell.starting nav[aria-label="Controls"]')).not.toBeNull();
    expect(host.querySelector('.hero-main strong')?.textContent).toBe('Controller');
    expect(host.querySelector('.bridge-state')?.textContent).toBe('Starting');
    // The selector holds its place so the navigation does not shift when bridges load.
    expect(host.querySelector('.sidebar-bridge-selector')?.textContent).toContain('Looking for bridges…');
    const placeholder = host.querySelector('.startup-placeholder-page.active');
    expect(placeholder?.getAttribute('aria-busy')).toBe('true');
    expect(placeholder?.querySelector('h2')?.textContent).toBe('Overview');

    await act(async () => resolveStatus(fixtureSnapshot()));
    expect(host.querySelector('.shell.starting')).toBeNull();
    expect(host.querySelector('.startup-placeholder-page')).toBeNull();
    expect(host.querySelector('#control-panel-overview.active h2')?.textContent).toBe('Overview');
    expect(host.querySelector('.hero-main strong')?.textContent).toBe('DualSense Edge');
  });

  it('walks a first-time user through the feature tile and support steps once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    installBridgeMock(fixtureSnapshot());
    await mount();

    const featureStep = document.querySelector('[role="dialog"][aria-label="Feature tile tutorial"]');
    expect(featureStep).not.toBeNull();
    const next = buttonByText(featureStep!, 'Next');
    expect(next?.disabled).toBe(true);
    await click(featureStep!.querySelector('[aria-label="Toggle example effect"]'));
    expect(next?.disabled).toBe(false);
    await click(next);

    const supportStep = document.querySelector('[role="dialog"][aria-label="Support DS5 Bridge"]');
    const continueButton = supportStep?.querySelector<HTMLButtonElement>('.startup-tutorial-actions .primary-action');
    expect(continueButton?.textContent).toBe('Continue In 5');
    expect(continueButton?.disabled).toBe(true);
    for (const remaining of [4, 3, 2, 1]) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(continueButton?.textContent).toBe(`Continue In ${remaining}`);
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(continueButton?.textContent).toBe('Continue');
    expect(continueButton?.disabled).toBe(false);

    await click(continueButton);
    expect(document.querySelector('.startup-tutorial-modal')).toBeNull();
    expect(window.localStorage.getItem(STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY)).toBe('1');
  });
});
