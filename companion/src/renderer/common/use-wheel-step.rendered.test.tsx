// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useWheelStep } from './use-wheel-step';

type ActEnvironment = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Stepper({ value, disabled = false, onStep }: { value: number; disabled?: boolean; onStep(value: number): void }) {
  const ref = useWheelStep<HTMLInputElement>({ value, min: 10, max: 100, step: 10, disabled, onStep });
  return <input aria-label="Amount" readOnly value={value} ref={ref} />;
}

async function render(props: Parameters<typeof Stepper>[0]) {
  if (!root) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }
  await act(async () => root!.render(<Stepper {...props} />));
  return container!.querySelector<HTMLInputElement>('input')!;
}

function wheel(target: HTMLElement, deltaY: number): WheelEvent {
  const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

beforeAll(() => { (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = false; });
afterEach(async () => {
  const mounted = root;
  root = null;
  if (mounted) await act(async () => mounted.unmount());
  container?.remove();
  container = null;
});

describe('useWheelStep', () => {
  it('keeps the page from scrolling and accumulates notches that arrive before a render', async () => {
    const onStep = vi.fn();
    const input = await render({ value: 50, onStep });
    const page = vi.fn();
    container!.addEventListener('wheel', page);

    const up = wheel(input, -100);
    wheel(input, -100);
    expect(up.defaultPrevented).toBe(true);
    expect(page).not.toHaveBeenCalled();
    expect(onStep.mock.calls).toEqual([[60], [70]]);
    await render({ value: 70, onStep });
    wheel(input, 100);
    expect(onStep).toHaveBeenLastCalledWith(60);
  });

  it('sends nothing for a notch at a limit', async () => {
    const onStep = vi.fn();
    const input = await render({ value: 100, onStep });
    expect(wheel(input, -100).defaultPrevented).toBe(true);
    expect(onStep).not.toHaveBeenCalled();
    await render({ value: 10, onStep });
    wheel(input, 100);
    expect(onStep).not.toHaveBeenCalled();
  });

  it('leaves the wheel to the page while disabled', async () => {
    const onStep = vi.fn();
    const input = await render({ value: 50, disabled: true, onStep });
    expect(wheel(input, -100).defaultPrevented).toBe(false);
    expect(onStep).not.toHaveBeenCalled();
  });
});
