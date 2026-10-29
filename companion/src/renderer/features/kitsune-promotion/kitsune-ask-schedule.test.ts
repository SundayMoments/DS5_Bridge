// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  KITSUNE_ASK_INTERVAL_MS,
  KITSUNE_ASK_SHOWN_AT_STORAGE_KEY,
  KITSUNE_LAUNCH_OFFER_WAIT_MS,
  kitsuneAskDue,
  kitsuneAskShownAt,
  kitsuneLaunchOfferDue,
  recordKitsuneAskShown
} from './kitsune-ask-schedule';

afterEach(() => window.localStorage.clear());

describe('Kitsune Input ask schedule', () => {
  it('makes the launch offer due a day after setup', () => {
    expect(kitsuneLaunchOfferDue(1_000, 1_000 + KITSUNE_LAUNCH_OFFER_WAIT_MS - 1)).toBe(false);
    expect(kitsuneLaunchOfferDue(1_000, 1_000 + KITSUNE_LAUNCH_OFFER_WAIT_MS)).toBe(true);
    expect(KITSUNE_LAUNCH_OFFER_WAIT_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('is due a month after the last Kitsune Input prompt', () => {
    expect(kitsuneAskShownAt()).toBeNull();
    recordKitsuneAskShown(1_000);
    expect(kitsuneAskShownAt()).toBe(1_000);
    expect(kitsuneAskDue(1_000, 1_000 + KITSUNE_ASK_INTERVAL_MS - 1)).toBe(false);
    expect(kitsuneAskDue(1_000, 1_000 + KITSUNE_ASK_INTERVAL_MS)).toBe(true);
    expect(KITSUNE_ASK_INTERVAL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('treats an unreadable value as never recorded', () => {
    window.localStorage.setItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY, 'soon');
    expect(kitsuneAskShownAt()).toBeNull();
  });
});
