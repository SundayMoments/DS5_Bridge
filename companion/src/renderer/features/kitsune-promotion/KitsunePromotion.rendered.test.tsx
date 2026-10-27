// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
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
import { LAUNCH_OFFER_FEATURES } from './KitsuneInputOfferContent';
import { KitsuneInputPromotionDialog } from './KitsuneInputPromotionDialog';
import { KITSUNE_ASK_INTERVAL_MS, KITSUNE_ASK_SHOWN_AT_STORAGE_KEY } from './kitsune-ask-schedule';
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

function monthlyAsk() {
  return document.querySelector<HTMLElement>('.kitsune-ask-modal');
}

function pressEscape() {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
}

describe('KitsuneInputLaunchOffer', () => {
  it('sells only what Kitsune Input adds, for the bridge the user already owns', () => {
    mountElement(<KitsuneInputLaunchOffer onGet={vi.fn()} onLearnMore={vi.fn()} onClose={vi.fn()} />);
    const text = offer()?.textContent ?? '';
    expect(offer()?.getAttribute('aria-modal')).toBe('true');
    expect(document.querySelector('#kitsune-launch-offer-title')?.textContent).toBe('Make your controller yours.');
    expect(text).toContain('A separate Windows app from the developer of DS5 Bridge');
    expect(text).toContain('Same Pico 2 W or Waveshare RP2350B-Plus-W bridge. Nothing else to buy.');
    // The extra controllers stand out as logo chips: PlayStation for the
    // DualShock 4, the Nintendo device mark for the Switch Pro Controller.
    const controllers = [...document.querySelectorAll('.kitsune-launch-offer-controllers li')];
    expect(controllers.map((item) => item.querySelector('strong')?.textContent)).toEqual(['DualShock 4', 'Switch Pro Controller']);
    expect(controllers[0]?.querySelector('.kitsune-launch-offer-controller-logo.playstation')).not.toBeNull();
    expect(controllers[1]?.textContent).toContain('Original model');
    expect(controllers.every((item) => item.querySelector('strong')?.getAttribute('data-l10n') === 'off')).toBe(true);
    expect(text).toContain('One-time purchase on Ko-fi');
    expect(text).toContain('DS5 Bridge stays free and open source.');
    // kitsuneinput.com: DS5 Bridge is a separate project, not a free tier.
    expect(text).not.toMatch(/trial|lite|upgrade|full version|free version/i);
    const features = [...document.querySelectorAll('.kitsune-launch-offer-features li')];
    expect(features.map((item) => item.querySelector('strong')?.textContent)).toEqual([
      'Auto-Switching Per-Game Profiles',
      'Shift Layers',
      'Gyro Aim and Flick Stick',
      'Touchpad Gestures',
      'Multi-Actions',
      'Stick and Trigger Tuning',
      'Xbox Series X Mode',
      'Kitsune Bar and Keyboard'
    ]);
    expect(features.length % 2).toBe(0);
    // Never list what DS5 Bridge already does.
    expect(text).not.toMatch(/Audio Haptics|Adaptive Triggers|Button Remapping|PC Wake|Wake PC|Themes/);
    expect(features.every((item) => item.querySelector('.kitsune-launch-offer-feature-copy span')?.textContent)).toBe(true);
    expect(document.querySelector('.kitsune-launch-offer-amount')?.textContent).toBe('$7.99');
    expect(document.querySelector('.kitsune-launch-offer-amount')?.getAttribute('data-l10n')).toBe('off');
    expect(document.querySelector('.kitsune-launch-offer-get')?.textContent).toBe('Get Kitsune Input');
  });

  it('uses flat surfaces with no gradients or glows', () => {
    // jsdom gives import.meta.url a non-file scheme; vitest runs from companion/.
    const renderer = path.join(process.cwd(), 'src', 'renderer');
    const source = readFileSync(path.join(renderer, 'features', 'kitsune-promotion', 'kitsune-launch-offer.css'), 'utf8');
    const promotionSource = readFileSync(path.join(renderer, 'styles', 'modal-surfaces.css'), 'utf8');
    const kitsuneRules = promotionSource.slice(
      promotionSource.indexOf('.kitsune-promotion-backdrop'),
      promotionSource.indexOf('.remap-profile-modal')
    );
    // Both offers share one panel stylesheet; only the backdrop lives here.
    expect(kitsuneRules).not.toContain('.kitsune-promotion-modal');
    for (const css of [source, kitsuneRules]) {
      expect(css).not.toMatch(/gradient\(/);
      expect(css).not.toMatch(/drop-shadow/);
      // No orange glow shadows.
      expect(css).not.toMatch(/box-shadow:[^;]*rgba\(255,/);
    }
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
  it('shows the launch offer content, closes at once, and can hide the banner for good', async () => {
    const onClose = vi.fn();
    const onPurchase = vi.fn();
    const onDismissForever = vi.fn();
    mountElement(
      <KitsuneInputPromotionDialog
        dismissing={false}
        onClose={onClose}
        onDismissForever={onDismissForever}
        onLearnMore={vi.fn()}
        onPurchase={onPurchase}
      />
    );
    const dialog = document.querySelector<HTMLElement>('.kitsune-promotion-modal')!;
    // Same panel and content as the launch offer.
    expect(dialog.classList.contains('kitsune-launch-offer-modal')).toBe(true);
    expect(dialog.getAttribute('aria-labelledby')).toBe('kitsune-promotion-title');
    expect(dialog.querySelector('#kitsune-promotion-title')?.textContent).toBe('Make your controller yours.');
    expect([...dialog.querySelectorAll('.kitsune-launch-offer-features strong')].map((title) => title.textContent))
      .toEqual(LAUNCH_OFFER_FEATURES.map(({ title }) => title));
    expect(dialog.querySelector('.kitsune-launch-offer-amount')?.textContent).toBe('$7.99');
    expect(dialog.querySelector('.kitsune-promotion-wordmark')?.getAttribute('data-l10n')).toBe('off');
    // No countdown: the banner's dialog was asked for.
    expect(dialog.querySelector<HTMLButtonElement>('.kitsune-launch-offer-close')?.disabled).toBe(false);

    await click(dialog.querySelector('.kitsune-launch-offer-get'));
    expect(onPurchase).toHaveBeenCalledOnce();
    await click(buttonByText(dialog, "Don't show Kitsune Input promotions again"));
    expect(onDismissForever).toHaveBeenCalledOnce();
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

  it('leaves the launch offer for a later run when the first-run tutorial already asked', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const bridge = installBridgeMock(offerSnapshot());
    trackLaunchOfferShown(bridge);
    await mountApp({ tutorialDone: false });
    await advance(LAUNCH_OFFER_DELAY_MS * 2);
    expect(document.querySelector('.startup-tutorial-modal')).not.toBeNull();
    expect(offer()).toBeNull();

    await click(document.querySelector('[aria-label="Toggle example effect"]'));
    await click(buttonByText(document.querySelector('.startup-tutorial-modal')!, /Next/));
    for (let second = 0; second < 5; second += 1) await advance(1000);
    await click(document.querySelector('.kitsune-ask-continue-button'));
    await advance(LAUNCH_OFFER_DELAY_MS * 4);
    // One Kitsune Input prompt per run: the tutorial's ask was this run's.
    expect(offer()).toBeNull();
    expect(monthlyAsk()).toBeNull();
    expect(bridge.fn('markKitsuneInputLaunchOfferShown')).not.toHaveBeenCalled();
  });

  it('waits for a bootloader confirmation before the launch offer', async () => {
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
    await mountApp();
    await advance(LAUNCH_OFFER_DELAY_MS * 2);
    expect(document.querySelector('.bootloader-confirmation-modal')).not.toBeNull();
    expect(offer()).toBeNull();

    bridge.emit(offerSnapshot({ bootloaderConfirmation: null }));
    await advance(LAUNCH_OFFER_DELAY_MS);
    expect(offer()).not.toBeNull();
    // The launch offer starts the month before the monthly ask.
    expect(Number(window.localStorage.getItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY))).toBeGreaterThan(0);
  });

  it('asks "Considering Getting Kitsune Input?" at most once a month after the launch offer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const lastAsked = Date.now() - KITSUNE_ASK_INTERVAL_MS - 1000;
    window.localStorage.setItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY, String(lastAsked));
    const bridge = installBridgeMock(fixtureSnapshot({ settings: { kitsuneInputLaunchOfferShown: true } }));
    await mountApp();
    await advance(LAUNCH_OFFER_DELAY_MS);
    const ask = monthlyAsk()!;
    expect(ask.querySelector('h2')?.textContent).toBe('Considering Getting Kitsune Input?');
    expect(Number(window.localStorage.getItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY))).toBeGreaterThan(lastAsked);

    const continueButton = ask.querySelector<HTMLButtonElement>('.kitsune-ask-continue-button')!;
    expect(continueButton.disabled).toBe(true);
    await click(ask.querySelector('.kitsune-launch-offer-learn'));
    expect(bridge.fn('openExternal')).toHaveBeenCalledWith('https://kitsuneinput.com/');
    for (let second = 0; second < 5; second += 1) await advance(1000);
    await click(continueButton);
    expect(monthlyAsk()).toBeNull();
  });

  it('skips the monthly ask within a month and after promotions were hidden', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    window.localStorage.setItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY, String(Date.now() - KITSUNE_ASK_INTERVAL_MS / 2));
    installBridgeMock(fixtureSnapshot({ settings: { kitsuneInputLaunchOfferShown: true } }));
    await mountApp();
    await advance(LAUNCH_OFFER_DELAY_MS * 4);
    expect(monthlyAsk()).toBeNull();
    act(() => root!.unmount());
    root = null;
    document.body.innerHTML = '';

    window.localStorage.setItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY, String(Date.now() - KITSUNE_ASK_INTERVAL_MS * 2));
    installBridgeMock(fixtureSnapshot({
      settings: { kitsuneInputLaunchOfferShown: true, kitsuneInputPromotionDismissed: true }
    }));
    await mountApp();
    await advance(LAUNCH_OFFER_DELAY_MS * 4);
    expect(monthlyAsk()).toBeNull();
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
