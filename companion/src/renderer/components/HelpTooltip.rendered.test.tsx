// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HelpTooltip } from './HelpTooltip';

type ActEnvironment = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeAll(() => {
  (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render(element: React.ReactElement) {
  container = document.createElement('div');
  container.className = 'shell';
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(element));
}

describe('HelpTooltip', () => {
  it('marks a label and opens its floating popup on hover, focus and Escape', () => {
    render(<p><HelpTooltip id="tip" label="Battery Layout" tooltip="Each range lights more lights." /></p>);
    const trigger = container!.querySelector<HTMLElement>('.help-tooltip-trigger')!;
    const popup = document.getElementById('tip')!;
    expect(trigger.textContent).toBe('Battery Layout');
    expect(trigger.tabIndex).toBe(0);
    expect(trigger.getAttribute('aria-describedby')).toBe('tip');
    expect(trigger.querySelector('svg.help-tooltip-mark')).not.toBeNull();
    // The popup lives in the shell, outside the label, so cards cannot clip it.
    expect(popup.getAttribute('role')).toBe('tooltip');
    expect(trigger.contains(popup)).toBe(false);
    expect(popup.parentElement).toBe(container);
    expect(popup.classList.contains('open')).toBe(false);

    act(() => trigger.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })));
    expect(popup.classList.contains('open')).toBe(true);
    act(() => trigger.dispatchEvent(new PointerEvent('pointerout', { bubbles: true })));
    expect(popup.classList.contains('open')).toBe(false);

    act(() => trigger.focus());
    expect(popup.classList.contains('open')).toBe(true);
    act(() => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(popup.classList.contains('open')).toBe(false);
  });

  it('wraps a focusable control without adding a tab stop or question mark', () => {
    render(
      <HelpTooltip id="zone" tooltip="Safe: more headroom.">
        <button type="button" aria-describedby="zone">Safe</button>
      </HelpTooltip>
    );
    const trigger = container!.querySelector<HTMLElement>('.help-tooltip-trigger')!;
    expect(trigger.hasAttribute('tabindex')).toBe(false);
    expect(trigger.querySelector('.help-tooltip-mark')).toBeNull();
    act(() => container!.querySelector('button')!.focus());
    expect(document.getElementById('zone')!.classList.contains('open')).toBe(true);
  });

  it('draws one opaque popup style with dropdown corners and regular text', () => {
    const css = readFileSync(path.join(__dirname, 'help-tooltip.css'), 'utf8');
    const popup = css.slice(css.indexOf('.help-tooltip {'), css.indexOf('}', css.indexOf('.help-tooltip {')));
    expect(popup).toContain('position: fixed;');
    expect(popup).toContain('border-radius: 12px;');
    expect(popup).toContain('background: var(--surface-menu);');
    expect(popup).toContain('font-weight: var(--font-weight-regular);');
    expect(css).toContain('.help-tooltip::after');
    expect(css).toContain('underline dotted');
  });
});
