// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BootloaderConfirmationPresentation } from '@shared/types';
import { BootloaderConfirmationDialog } from './BootloaderConfirmationDialog';

const SEQUENCE: BootloaderConfirmationPresentation['sequence'] = [
  'triangle', 'circle', 'cross', 'square', 'cross', 'triangle', 'square', 'circle'
];

function confirmation(overrides: Partial<BootloaderConfirmationPresentation> = {}): BootloaderConfirmationPresentation {
  return {
    purpose: 'enrollment',
    sequence: SEQUENCE,
    progress: 3,
    mistakes: 0,
    expiresAtUnixMs: Date.now() + 25_000,
    ...overrides
  };
}

let root: Root | null = null;
let container: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  vi.useRealTimers();
});

function render(value: BootloaderConfirmationPresentation | null, onCancel = vi.fn()) {
  if (!root) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }
  act(() => root!.render(<BootloaderConfirmationDialog confirmation={value} onCancel={onCancel} />));
  return onCancel;
}

function dialog() {
  return container.querySelector<HTMLElement>('[role="dialog"]');
}

describe('BootloaderConfirmationDialog', () => {
  it('renders nothing while no confirmation is pending', () => {
    render(null);
    expect(container.childElementCount).toBe(0);
  });

  it('asks to pair this PC the first time and explains why', () => {
    render(confirmation());
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(container.querySelector('#bootloader-confirmation-title')?.textContent).toBe("Confirm it's you");
    expect(dialog()?.textContent).toContain(
      'This pairs this PC with the bridge so only DS5 Bridge on this computer can put it into update mode.'
    );
    expect(dialog()?.textContent).toContain('No controller? Hold BOOTSEL while plugging in the Pico.');
  });

  it('names UF2 update mode for a repeat confirmation', () => {
    render(confirmation({ purpose: 'bootloader-entry' }));
    expect(container.querySelector('#bootloader-confirmation-title')?.textContent).toBe('Confirm UF2 update mode');
    expect(dialog()?.textContent).not.toContain('This pairs this PC');
  });

  it('shows the eight colored face buttons in order with completed and next steps marked', () => {
    render(confirmation());
    const glyphs = [...container.querySelectorAll('.bootloader-confirmation-step svg')];
    expect(glyphs.map((glyph) => glyph.getAttribute('aria-label'))).toEqual([
      'Triangle', 'Circle', 'Cross', 'Square', 'Cross', 'Triangle', 'Square', 'Circle'
    ]);
    expect(glyphs.map((glyph) => glyph.getAttribute('class'))).toEqual(SEQUENCE.map((button) => (
      `face-button-glyph face-button-${button}`
    )));
    const states = [...container.querySelectorAll('.bootloader-confirmation-step')]
      .map((step) => step.getAttribute('data-step-state'));
    expect(states).toEqual(['complete', 'complete', 'complete', 'current', 'pending', 'pending', 'pending', 'pending']);
    expect(container.querySelector('[aria-current="step"] svg')?.getAttribute('aria-label')).toBe('Square');
    expect(container.querySelector('.bootloader-confirmation-progress')?.textContent).toBe('3 of 8 entered');
  });

  it('counts down to the deadline', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(1_000_000);
    render(confirmation({ expiresAtUnixMs: 1_000_000 + 30_000 }));
    expect(container.querySelector('.bootloader-confirmation-countdown')?.textContent).toBe('30s left');
    act(() => vi.advanceTimersByTime(21_000));
    const countdown = container.querySelector('.bootloader-confirmation-countdown');
    expect(countdown?.textContent).toBe('9s left');
    expect(countdown?.classList.contains('urgent')).toBe(true);
  });

  it('flashes an incorrect state when a wrong press restarts the sequence', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    render(confirmation({ progress: 5 }));
    expect(dialog()?.classList.contains('incorrect')).toBe(false);

    render(confirmation({ progress: 0, mistakes: 1 }));
    expect(dialog()?.classList.contains('incorrect')).toBe(true);
    expect(container.querySelector('.bootloader-confirmation-progress')?.textContent).toBe('Incorrect, start again');

    act(() => vi.advanceTimersByTime(1700));
    expect(dialog()?.classList.contains('incorrect')).toBe(false);
    expect(container.querySelector('.bootloader-confirmation-progress')?.textContent).toBe('0 of 8 entered');
  });

  it('cancels from the close button, the Cancel button, and Escape', () => {
    const onCancel = render(confirmation());
    act(() => container.querySelector<HTMLButtonElement>('.modal-close-button')!.click());
    act(() => container.querySelector<HTMLButtonElement>('.bootloader-confirmation-footer .secondary-action')!.click());
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(3);
  });
});
