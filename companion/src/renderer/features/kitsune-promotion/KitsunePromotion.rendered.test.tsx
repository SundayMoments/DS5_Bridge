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
import { KitsuneInputMonthlyAsk } from './KitsuneInputAsk';
import { KitsuneInputLaunchOffer } from './KitsuneInputLaunchOffer';
import { LAUNCH_OFFER_FEATURES } from './KitsuneInputOfferContent';
import { KitsuneInputPromotionDialog } from './KitsuneInputPromotionDialog';
import {
  KITSUNE_ASK_INTERVAL_MS,
  KITSUNE_ASK_SHOWN_AT_STORAGE_KEY,
  KITSUNE_LAUNCH_OFFER_WAIT_MS
} from './kitsune-ask-schedule';
import { LAUNCH_OFFER_DELAY_MS } from './use-kitsune-launch-offer';

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(installDomStubs);

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = '';
  window.localStorage.clear();
  delete (document as { visibilityState?: unknown }).visibilityState;
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

function pressTab(shiftKey = false) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true }));
  });
}

/** Overrides document.visibilityState the way a hidden or minimized window reports it. */
function setDocumentVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('KitsuneInputLaunchOffer', () => {
  it('sells only what Kitsune Input adds, for the bridge the user already owns', () => {
    mountElement(<KitsuneInputLaunchOffer onGet={vi.fn()} onLearnMore={vi.fn()} onClose={vi.fn()} />);
    const text = offer()?.textContent ?? '';
    expect(offer()?.getAttribute('aria-modal')).toBe('true');
    expect(document.querySelector('#kitsune-launch-offer-title')?.textContent).toBe('Make your controller yours.');
    expect(text).toContain('A separate Windows app from the developer of DS5 Bridge, for the bridge you already own.');
    // The extra controllers show their logos: PlayStation for the DualShock 4,
    // the Nintendo device mark for the original Switch Pro Controller.
    const controllers = [...document.querySelectorAll('.kitsune-launch-offer-controllers li')];
    expect(controllers.map((item) => item.querySelector('strong')?.textContent)).toEqual(['DualShock 4', 'Switch Pro Controller']);
    expect(controllers[0]?.querySelector('.kitsune-launch-offer-controller-logo.playstation')).not.toBeNull();
    expect(controllers[1]?.getAttribute('title')).toBe('Original model');
    expect(controllers.every((item) => item.querySelector('strong')?.getAttribute('data-l10n') === 'off')).toBe(true);
    expect(text).toContain('One-time purchase on Ko-fi');
    // Compact: titles only, and no line that the summary already says.
    expect(text).not.toContain('Nothing else to buy');
    expect(document.querySelectorAll('.kitsune-launch-offer-features li > span:not(.kitsune-launch-offer-feature-icon)')).toHaveLength(0);
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
      'Game Bar Overlay and Keyboard'
    ]);
    expect(features.length % 4).toBe(0);
    // Kitsune Input's own icons, down to its Kitsune Bar fox mark.
    expect(features.at(-1)?.querySelector('.kitsune-launch-offer-feature-mark')).not.toBeNull();
    expect(features.slice(0, -1).every((item) => item.querySelector('.kitsune-launch-offer-feature-icon svg'))).toBe(true);
    // Never list what DS5 Bridge already does.
    expect(text).not.toMatch(/Audio Haptics|Adaptive Triggers|Button Remapping|PC Wake|Wake PC|Themes/);
    expect(document.querySelector('.kitsune-launch-offer-amount')?.textContent).toBe('$7.99');
    expect(document.querySelector('.kitsune-launch-offer-amount')?.getAttribute('data-l10n')).toBe('off');
    expect(document.querySelector('.kitsune-launch-offer-get')?.textContent).toBe('Get Kitsune Input');
  });

  it('has every feature tile in the localization catalog', () => {
    const master = JSON.parse(readFileSync(
      path.join(process.cwd(), 'src', 'renderer', 'common', 'localization', 'locales', 'master.en.json'),
      'utf8'
    )) as { translations: Record<string, string> };
    for (const { title } of LAUNCH_OFFER_FEATURES) {
      expect(master.translations, title).toHaveProperty([title]);
    }
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

  it('closes at once from the X, Escape, or the backdrop', async () => {
    const onClose = vi.fn();
    mountElement(<KitsuneInputLaunchOffer onGet={vi.fn()} onLearnMore={vi.fn()} onClose={onClose} />);
    const close = document.querySelector<HTMLButtonElement>('.kitsune-launch-offer-close')!;

    // No countdown: the X shows and works from the first frame.
    expect(close.disabled).toBe(false);
    expect(close.textContent).toBe('');
    expect(close.querySelector('svg')).not.toBeNull();
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
  it('shows the launch offer content and closes at once, with no way to hide promotions for good', async () => {
    const onClose = vi.fn();
    const onPurchase = vi.fn();
    mountElement(
      <KitsuneInputPromotionDialog
        onClose={onClose}
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
    expect(dialog.querySelector<HTMLButtonElement>('.kitsune-launch-offer-close')?.disabled).toBe(false);

    expect(dialog.textContent).not.toContain("Don't show");

    await click(dialog.querySelector('.kitsune-launch-offer-get'));
    expect(onPurchase).toHaveBeenCalledOnce();
    pressEscape();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('KitsuneInputMonthlyAsk', () => {
  it('closes at once from Continue or Escape', async () => {
    const onClose = vi.fn();
    mountElement(<KitsuneInputMonthlyAsk onGet={vi.fn()} onLearnMore={vi.fn()} onClose={onClose} />);
    const continueButton = monthlyAsk()!.querySelector<HTMLButtonElement>('.kitsune-ask-continue-button')!;
    expect(continueButton.disabled).toBe(false);
    expect(continueButton.textContent).toBe('Continue');
    // Last in the actions, so it sits bottom right where moving on is expected.
    expect(monthlyAsk()!.querySelector('.kitsune-launch-offer-actions')!.lastElementChild).toBe(continueButton);
    await click(continueButton);
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('takes focus, keeps Tab inside, and gives focus back when it closes', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    mountElement(<KitsuneInputMonthlyAsk onGet={vi.fn()} onLearnMore={vi.fn()} onClose={vi.fn()} />);
    const ask = monthlyAsk()!;
    expect(document.activeElement).toBe(ask);
    const buttons = [...ask.querySelectorAll<HTMLButtonElement>('button')];
    buttons.at(-1)!.focus();
    pressTab();
    expect(document.activeElement).toBe(buttons[0]);
    pressTab(true);
    expect(document.activeElement).toBe(buttons.at(-1));
    // Focus that reached the page behind comes back into the dialog.
    opener.focus();
    pressTab();
    expect(document.activeElement).toBe(buttons[0]);

    act(() => root!.unmount());
    root = null;
    expect(document.activeElement).toBe(opener);
  });
});

describe('Kitsune Input offers in the app', () => {
  function offerSnapshot(overrides: Parameters<typeof fixtureSnapshot>[0] = {}) {
    return fixtureSnapshot({
      ...overrides,
      settings: { kitsuneInputLaunchOfferShown: false, kitsuneInputPromotionDismissed: false, ...overrides.settings }
    });
  }

  function trackLaunchOfferShown(bridge: BridgeMock) {
    bridge.fn('markKitsuneInputLaunchOfferShown').mockImplementation(async () => {
      const next = fixtureSnapshot({ settings: { ...bridge.snapshot().settings, kitsuneInputLaunchOfferShown: true } });
      bridge.emit(next);
      return next;
    });
  }

  /** Finishes setup just over a day ago, so the launch offer is due. */
  function finishSetupJustOverADayAgo() {
    const finishedAt = Date.now() - KITSUNE_LAUNCH_OFFER_WAIT_MS - 1000;
    window.localStorage.setItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY, String(finishedAt));
    return finishedAt;
  }

  /** Shows the last prompt just over a month ago, so the monthly ask is due. */
  function startMonthJustOverAMonthAgo() {
    const startedAt = Date.now() - KITSUNE_ASK_INTERVAL_MS - 1000;
    window.localStorage.setItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY, String(startedAt));
    return startedAt;
  }

  function unmountApp() {
    act(() => root!.unmount());
    root = null;
    document.body.innerHTML = '';
  }

  it('shows the launch offer once, a day after setup', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const setupFinishedAt = finishSetupJustOverADayAgo();
    const bridge = installBridgeMock(offerSnapshot());
    trackLaunchOfferShown(bridge);
    await mountApp();
    expect(offer()).toBeNull();

    await advance(LAUNCH_OFFER_DELAY_MS);
    expect(offer()).not.toBeNull();
    expect(bridge.fn('markKitsuneInputLaunchOfferShown')).toHaveBeenCalledOnce();
    // The launch offer starts the month before the monthly ask.
    expect(Number(window.localStorage.getItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY))).toBeGreaterThan(setupFinishedAt);

    // Both buttons carry the source tag the website counts.
    await click(buttonByText(offer()!, 'Learn More'));
    expect(bridge.fn('openExternal')).toHaveBeenLastCalledWith('https://kitsuneinput.com/?src=ds5-popup');
    await click(document.querySelector('.kitsune-launch-offer-get'));
    expect(bridge.fn('openExternal')).toHaveBeenLastCalledWith('https://kitsuneinput.com/buy?src=ds5-popup');
    expect(offer()).toBeNull();
    await advance(LAUNCH_OFFER_DELAY_MS * 4);
    expect(offer()).toBeNull();
    expect(bridge.fn('markKitsuneInputLaunchOfferShown')).toHaveBeenCalledOnce();
  });

  it('never shows the launch offer to anyone who hid promotions in an earlier version', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    finishSetupJustOverADayAgo();
    const bridge = installBridgeMock(offerSnapshot({ settings: { kitsuneInputPromotionDismissed: true } }));
    trackLaunchOfferShown(bridge);
    await mountApp();
    await advance(LAUNCH_OFFER_DELAY_MS * 4);
    expect(offer()).toBeNull();
    expect(monthlyAsk()).toBeNull();
    expect(bridge.fn('markKitsuneInputLaunchOfferShown')).not.toHaveBeenCalled();
  });

  it('never shows the launch offer again once it has been shown', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    finishSetupJustOverADayAgo();
    installBridgeMock(fixtureSnapshot());
    await mountApp();
    await advance(LAUNCH_OFFER_DELAY_MS * 4);
    expect(offer()).toBeNull();
  });

  it('shows no Kitsune Input prompt during first-run setup and starts the wait when setup finishes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const bridge = installBridgeMock(offerSnapshot());
    trackLaunchOfferShown(bridge);
    await mountApp({ tutorialDone: false });
    await advance(LAUNCH_OFFER_DELAY_MS * 2);
    const tutorial = document.querySelector('.startup-tutorial-modal')!;
    expect(tutorial.textContent).not.toContain('Kitsune');
    expect(offer()).toBeNull();
    expect(window.localStorage.getItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY)).toBeNull();

    const finishedAt = Date.now();
    await click(tutorial.querySelector('[aria-label="Toggle example effect"]'));
    await click(buttonByText(tutorial, /Next/));
    expect(document.querySelector('.startup-tutorial-modal')).toBeNull();
    expect(Number(window.localStorage.getItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY))).toBeGreaterThanOrEqual(finishedAt);

    await advance(LAUNCH_OFFER_DELAY_MS * 4);
    expect(offer()).toBeNull();
    expect(monthlyAsk()).toBeNull();
    expect(bridge.fn('markKitsuneInputLaunchOfferShown')).not.toHaveBeenCalled();
  });

  it('waits a day before the launch offer, starting it on the first run after 1.x', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    // Setup finished in 1.x, which never started the wait: this first run starts it.
    const bridge = installBridgeMock(offerSnapshot());
    trackLaunchOfferShown(bridge);
    const firstRunAt = Date.now();
    await mountApp();
    await advance(LAUNCH_OFFER_DELAY_MS * 4);
    expect(offer()).toBeNull();
    expect(Number(window.localStorage.getItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY))).toBeGreaterThanOrEqual(firstRunAt);
    unmountApp();

    // A minute short of a day: still nothing.
    window.localStorage.setItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY, String(Date.now() - KITSUNE_LAUNCH_OFFER_WAIT_MS + 60_000));
    const laterBridge = installBridgeMock(offerSnapshot());
    trackLaunchOfferShown(laterBridge);
    await mountApp();
    await advance(LAUNCH_OFFER_DELAY_MS * 4);
    expect(offer()).toBeNull();
    expect(laterBridge.fn('markKitsuneInputLaunchOfferShown')).not.toHaveBeenCalled();
  });

  it('holds the launch offer while the window is hidden, so it is never used up unseen', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    finishSetupJustOverADayAgo();
    const bridge = installBridgeMock(offerSnapshot());
    trackLaunchOfferShown(bridge);
    await mountApp();
    setDocumentVisibility('hidden');
    await advance(LAUNCH_OFFER_DELAY_MS * 4);
    expect(offer()).toBeNull();
    expect(bridge.fn('markKitsuneInputLaunchOfferShown')).not.toHaveBeenCalled();

    setDocumentVisibility('visible');
    await advance(LAUNCH_OFFER_DELAY_MS);
    expect(offer()).not.toBeNull();
    expect(bridge.fn('markKitsuneInputLaunchOfferShown')).toHaveBeenCalledOnce();
  });

  it('shows no prompt for the rest of a run once the banner opened the offer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    finishSetupJustOverADayAgo();
    const bridge = installBridgeMock(offerSnapshot());
    trackLaunchOfferShown(bridge);
    await mountApp();
    await click(host.querySelector('.kitsune-promotion-banner'));
    expect(document.querySelector('.kitsune-promotion-modal')).not.toBeNull();
    pressEscape();
    expect(document.querySelector('.kitsune-promotion-modal')).toBeNull();

    await advance(LAUNCH_OFFER_DELAY_MS * 4);
    expect(offer()).toBeNull();
    expect(monthlyAsk()).toBeNull();
    // The one-time offer is left for a later run.
    expect(bridge.fn('markKitsuneInputLaunchOfferShown')).not.toHaveBeenCalled();
  });

  it('shows one prompt per run even when the wait cannot be saved', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    // Both the launch offer and the monthly ask read as due.
    startMonthJustOverAMonthAgo();
    const bridge = installBridgeMock(offerSnapshot());
    trackLaunchOfferShown(bridge);
    await mountApp();
    const setItem = Storage.prototype.setItem;
    const failingSave = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === KITSUNE_ASK_SHOWN_AT_STORAGE_KEY) throw new Error('QuotaExceededError');
      setItem.call(this, key, value);
    });
    try {
      await advance(LAUNCH_OFFER_DELAY_MS);
      expect(offer()).not.toBeNull();
      pressEscape();
      await advance(LAUNCH_OFFER_DELAY_MS * 4);
      expect(offer()).toBeNull();
      expect(monthlyAsk()).toBeNull();
    } finally {
      failingSave.mockRestore();
    }
  });

  it('waits for a bootloader confirmation before the launch offer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    finishSetupJustOverADayAgo();
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
  });

  it('asks "Considering Getting Kitsune Input?" at most once a month after the launch offer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const lastAsked = startMonthJustOverAMonthAgo();
    const bridge = installBridgeMock(fixtureSnapshot({ settings: { kitsuneInputLaunchOfferShown: true } }));
    await mountApp();
    await advance(LAUNCH_OFFER_DELAY_MS);
    const ask = monthlyAsk()!;
    expect(ask.querySelector('h2')?.textContent).toBe('Considering Getting Kitsune Input?');
    expect(Number(window.localStorage.getItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY))).toBeGreaterThan(lastAsked);

    await click(ask.querySelector('.kitsune-launch-offer-learn'));
    expect(bridge.fn('openExternal')).toHaveBeenLastCalledWith('https://kitsuneinput.com/?src=ds5-popup');
    await click(ask.querySelector('.kitsune-launch-offer-get'));
    expect(bridge.fn('openExternal')).toHaveBeenLastCalledWith('https://kitsuneinput.com/buy?src=ds5-popup');
    // No countdown: Escape closes it at once.
    pressEscape();
    expect(monthlyAsk()).toBeNull();
  });

  it('skips the monthly ask within a month and after promotions were hidden', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    // Only the launch offer waits just a day; after it, prompts are a month apart.
    window.localStorage.setItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY, String(Date.now() - KITSUNE_ASK_INTERVAL_MS / 2));
    installBridgeMock(fixtureSnapshot({ settings: { kitsuneInputLaunchOfferShown: true } }));
    await mountApp();
    await advance(LAUNCH_OFFER_DELAY_MS * 4);
    expect(monthlyAsk()).toBeNull();
    unmountApp();

    window.localStorage.setItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY, String(Date.now() - KITSUNE_ASK_INTERVAL_MS * 2));
    installBridgeMock(fixtureSnapshot({
      settings: { kitsuneInputLaunchOfferShown: true, kitsuneInputPromotionDismissed: true }
    }));
    await mountApp();
    await advance(LAUNCH_OFFER_DELAY_MS * 4);
    expect(monthlyAsk()).toBeNull();
  });

  it('keeps honoring a dismissal made before the option was removed', async () => {
    installBridgeMock(fixtureSnapshot());
    await mountApp();
    expect(host.querySelector('.kitsune-promotion-banner')).not.toBeNull();
    unmountApp();

    installBridgeMock(fixtureSnapshot({ settings: { kitsuneInputPromotionDismissed: true } }));
    await mountApp();
    expect(host.querySelector('.kitsune-promotion-banner')).toBeNull();
  });
});
