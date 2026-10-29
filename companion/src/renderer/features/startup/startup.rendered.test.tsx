// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BridgeSnapshot } from '@shared/types';
import { App } from '../../App';
import { RendererLocalization } from '../../composition/RendererLocalization';
import { buttonByText, click, fixtureSnapshot, installBridgeMock, installDomStubs } from '../../test-support/app-harness';
import { KITSUNE_ASK_SHOWN_AT_STORAGE_KEY } from '../kitsune-promotion/kitsune-ask-schedule';
import { STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY } from './startup-tutorial-storage';
import { UI_THEME_PRESET_STORAGE_KEY } from '../../ui-theme-preferences';

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

    // The DS5 Bridge mark is inline SVG, so it follows the theme colors.
    expect(host.querySelector('svg.bridge-mark')).not.toBeNull();

    await act(async () => resolveStatus(fixtureSnapshot()));
    expect(host.querySelector('.shell.starting')).toBeNull();
    expect(host.querySelector('.startup-placeholder-page')).toBeNull();
    expect(host.querySelector('#control-panel-overview.active h2')?.textContent).toBe('Overview');
    expect(host.querySelector('.hero-main strong')?.textContent).toBe('DualSense Edge');
  });

  it('opens in the theme and text size saved from the last run, then follows the bridge settings', async () => {
    window.localStorage.setItem(STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY, '1');
    window.localStorage.setItem(UI_THEME_PRESET_STORAGE_KEY, 'light');
    const bridge = installBridgeMock(fixtureSnapshot({ settings: { uiThemePreset: 'dark' } }));
    let resolveStatus!: (snapshot: BridgeSnapshot) => void;
    bridge.fn('getStatus').mockImplementation(() => new Promise<BridgeSnapshot>((resolve) => { resolveStatus = resolve; }));
    await mount();
    expect(host.querySelector('.shell.starting')?.getAttribute('data-theme')).toBe('light');

    await act(async () => resolveStatus(fixtureSnapshot({ settings: { uiThemePreset: 'dark' } })));
    expect(host.querySelector('.shell')?.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(UI_THEME_PRESET_STORAGE_KEY)).toBe('dark');
  });

  it('walks a first-time user through the feature tile once, with no Kitsune Input ask', async () => {
    installBridgeMock(fixtureSnapshot());
    await mount();

    const featureStep = document.querySelector('[role="dialog"][aria-label="Feature tile tutorial"]');
    expect(featureStep).not.toBeNull();
    // A single step, so no step count.
    expect(featureStep!.textContent).not.toMatch(/\d \/ \d/);
    const next = buttonByText(featureStep!, 'Next');
    expect(next?.disabled).toBe(true);
    await click(featureStep!.querySelector('[aria-label="Toggle example effect"]'));
    expect(next?.disabled).toBe(false);
    const finishedAt = Date.now();
    await click(next);

    expect(document.querySelector('.startup-tutorial-modal')).toBeNull();
    expect(document.querySelector('[role="dialog"][aria-label="Considering Getting Kitsune Input?"]')).toBeNull();
    expect(window.localStorage.getItem(STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY)).toBe('1');
    // Finishing setup starts the day before the first Kitsune Input prompt.
    expect(Number(window.localStorage.getItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY))).toBeGreaterThanOrEqual(finishedAt);
  });
});
