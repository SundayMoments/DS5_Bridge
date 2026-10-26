// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { RendererLocalization } from '../../composition/RendererLocalization';
import {
  buttonByText,
  click,
  fixtureSnapshot,
  installBridgeMock,
  installDomStubs,
  type BridgeMock
} from '../../test-support/app-harness';
import { STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY } from '../startup';
import { KitsuneInputLaunchOffer } from './KitsuneInputLaunchOffer';
import { KitsuneInputPromotionDialog } from './KitsuneInputPromotionDialog';
import { LAUNCH_OFFER_DELAY_MS } from './use-kitsune-launch-offer';

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

function mountElement(element: ReactElement) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(element));
}

async function mountApp({ tutorialDone = true } = {}) {
  if (tutorialDone) window.localStorage.setItem(STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY, '1');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<RendererLocalization><App /></RendererLocalization>);
  });
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

function offer() {
  return document.querySelector<HTMLElement>('.kitsune-launch-offer-modal');
}

function pressEscape() {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
}

describe('KitsuneInputLaunchOffer', () => {
  it('sells Kitsune Input for the bridge the user already owns without calling DS5 Bridge a trial', () => {
    mountElement(<KitsuneInputLaunchOffer onGet={vi.fn()} onLearnMore={vi.fn()} onClose={vi.fn()} />);
    const text = offer()?.textContent ?? '';
    expect(offer()?.getAttribute('aria-modal')).toBe('true');
    expect(document.querySelector('#kitsune-launch-offer-title')?.textContent).toBe('Make your controller yours.');
    expect(text).toContain('Pico 2 W or Waveshare RP2350B-Plus-W');
    expect(text).toContain('nothing new to buy but the app');
    expect(text).toContain('One-time purchase on Ko-fi');
    expect(text).toContain('DS5 Bridge stays free and open source.');
    expect(text).not.toMatch(/trial|lite|upgrade/i);
    expect([...document.querySelectorAll('.kitsune-launch-offer-features li')].map((item) => item.textContent)).toEqual([
      'Auto-Switching Per-Game Profiles',
      'Button Remapping',
      'Gyro Aim and Flick Stick',
      'Touchpad Gestures',
      'Multi-Actions',
      'Audio Haptics',
      'Adaptive Triggers',
      'Kitsune Bar Overlay',
      'PC Wake',
      'Themes'
    ]);
    expect(document.querySelector('.kitsune-launch-offer-controller-names')?.textContent)
      .toBe('DualSense · DualSense Edge · DualShock 4 · Switch Pro Controller');
    expect(document.querySelector('.kitsune-launch-offer-get')?.textContent).toBe('Get Kitsune Input — $7.99');
  });

  it('keeps the close button, Escape, and the backdrop inert for five seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const onClose = vi.fn();
    mountElement(<KitsuneInputLaunchOffer onGet={vi.fn()} onLearnMore={vi.fn()} onClose={onClose} />);
    const close = document.querySelector<HTMLButtonElement>('.kitsune-launch-offer-close')!;

    for (const remaining of [5, 4, 3, 2, 1]) {
      expect(close.textContent).toBe(`Close in ${remaining}`);
      expect(close.disabled).toBe(true);
      pressEscape();
      act(() => {
        document.querySelector('.kitsune-launch-offer-backdrop')!
          .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      });
      await advance(1000);
    }
    expect(onClose).not.toHaveBeenCalled();

    expect(close.disabled).toBe(false);
    expect(close.getAttribute('aria-label')).toBe('Close');
    await click(close);
    pressEscape();
    act(() => {
      document.querySelector('.kitsune-launch-offer-backdrop')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('opens the purchase page and the website from its buttons', async () => {
    const onGet = vi.fn();
    const onLearnMore = vi.fn();
    mountElement(<KitsuneInputLaunchOffer onGet={onGet} onLearnMore={onLearnMore} onClose={vi.fn()} />);
    await click(document.querySelector('.kitsune-launch-offer-get'));
    await click(buttonByText(document, 'Learn More'));
    expect(onGet).toHaveBeenCalledOnce();
    expect(onLearnMore).toHaveBeenCalledOnce();
  });
});

describe('KitsuneInputPromotionDialog', () => {
  it('lists what Kitsune Input adds and closes on Escape', () => {
    const onClose = vi.fn();
    mountElement(
      <KitsuneInputPromotionDialog
        dismissing={false}
        onClose={onClose}
        onDismissForever={vi.fn()}
        onLearnMore={vi.fn()}
        onPurchase={vi.fn()}
      />
    );
    const dialog = document.querySelector('.kitsune-promotion-modal')!;
    expect(dialog.querySelector('h2')?.textContent).toBe('Take controller customization further');
    expect([...dialog.querySelectorAll('.kitsune-promotion-feature-kicker strong')].map((title) => title.textContent))
      .toEqual(['Tuning & Compatibility', 'Profiles & Tools']);
    expect(dialog.querySelectorAll('.kitsune-promotion-feature-card li')).toHaveLength(12);
    expect(dialog.querySelector('.kitsune-promotion-wordmark')?.getAttribute('data-l10n')).toBe('off');
    expect(buttonByText(dialog, "Don't show Kitsune Input promotions again")).toBeDefined();
    pressEscape();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('Kitsune Input offers in the app', () => {
  function offerSnapshot(overrides: Parameters<typeof fixtureSnapshot>[0] = {}) {
    return fixtureSnapshot({
      ...overrides,
      settings: { kitsuneInputLaunchOfferShown: false, kitsuneInputPromotionDismissed: true, ...overrides.settings }
    });
  }

  function trackLaunchOfferShown(bridge: BridgeMock) {
    bridge.fn('markKitsuneInputLaunchOfferShown').mockImplementation(async () => {
      const next = fixtureSnapshot({ settings: { ...bridge.snapshot().settings, kitsuneInputLaunchOfferShown: true } });
      bridge.emit(next);
      return next;
    });
  }

  it('shows the launch offer once after startup, even after the promotion was hidden', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const bridge = installBridgeMock(offerSnapshot());
    trackLaunchOfferShown(bridge);
    await mountApp();
    expect(offer()).toBeNull();
    expect(host.querySelector('.kitsune-promotion-banner')).toBeNull();

    await advance(LAUNCH_OFFER_DELAY_MS);
    expect(offer()).not.toBeNull();
    expect(bridge.fn('markKitsuneInputLaunchOfferShown')).toHaveBeenCalledOnce();

    await click(document.querySelector('.kitsune-launch-offer-get'));
    expect(bridge.fn('openExternal')).toHaveBeenCalledWith('https://ko-fi.com/s/d1f0a3b26f');
    expect(offer()).toBeNull();
    await advance(LAUNCH_OFFER_DELAY_MS * 4);
    expect(offer()).toBeNull();
    expect(bridge.fn('markKitsuneInputLaunchOfferShown')).toHaveBeenCalledOnce();
  });

  it('never shows the launch offer again once it has been shown', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    installBridgeMock(fixtureSnapshot());
    await mountApp();
    await advance(LAUNCH_OFFER_DELAY_MS * 4);
    expect(offer()).toBeNull();
  });

  it('waits for the first-run tutorial and for a bootloader confirmation', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const bridge = installBridgeMock(offerSnapshot({
      bootloaderConfirmation: {
        purpose: 'enrollment',
        sequence: ['cross', 'circle', 'square', 'triangle', 'cross', 'cross', 'circle', 'square'],
        progress: 0,
        mistakes: 0,
        expiresAtUnixMs: Date.now() + 30_000
      }
    }));
    trackLaunchOfferShown(bridge);
    await mountApp({ tutorialDone: false });
    await advance(LAUNCH_OFFER_DELAY_MS * 2);
    expect(document.querySelector('.startup-tutorial-modal')).not.toBeNull();
    expect(offer()).toBeNull();

    await click(document.querySelector('[aria-label="Toggle example effect"]'));
    await click(buttonByText(document.querySelector('.startup-tutorial-modal')!, /Next/));
    for (let second = 0; second < 5; second += 1) await advance(1000);
    await click(document.querySelector('.startup-tutorial-actions .primary-action'));
    await advance(LAUNCH_OFFER_DELAY_MS * 2);
    expect(document.querySelector('.bootloader-confirmation-modal')).not.toBeNull();
    expect(offer()).toBeNull();

    bridge.emit(offerSnapshot({ bootloaderConfirmation: null }));
    await advance(LAUNCH_OFFER_DELAY_MS);
    expect(offer()).not.toBeNull();
  });

  it('hides the window-bar promotion for good when asked', async () => {
    const bridge = installBridgeMock(fixtureSnapshot());
    bridge.fn('setKitsuneInputPromotionDismissed').mockImplementation(async () => (
      fixtureSnapshot({ settings: { kitsuneInputPromotionDismissed: true } })
    ));
    await mountApp();
    await click(host.querySelector('.kitsune-promotion-banner'));
    await click(buttonByText(document.querySelector('.kitsune-promotion-modal')!, "Don't show Kitsune Input promotions again"));
    expect(bridge.fn('setKitsuneInputPromotionDismissed')).toHaveBeenCalledWith(true);
    expect(host.querySelector('.kitsune-promotion-banner')).toBeNull();
    expect(document.querySelector('.kitsune-promotion-modal')).toBeNull();
  });
});
