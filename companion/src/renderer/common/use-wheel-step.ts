import { useCallback, useRef } from 'react';

export interface WheelStepOptions {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly disabled: boolean;
  onStep(value: number): void;
}

/**
 * Steps a value with the mouse wheel over an element. React's wheel listener
 * is passive and cannot stop the page scrolling, so this attaches its own.
 * Fast notches step from the last value sent, and a notch at a limit sends
 * nothing.
 */
export function useWheelStep<T extends HTMLElement>(options: WheelStepOptions): (element: T | null) => void {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const latest = useRef({ shown: options.value, sent: options.value });
  if (latest.current.shown !== options.value) latest.current = { shown: options.value, sent: options.value };
  const detach = useRef<(() => void) | null>(null);
  return useCallback((element: T | null) => {
    detach.current?.();
    detach.current = null;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      const { min, max, step, disabled, onStep } = optionsRef.current;
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();
      const current = latest.current.sent;
      const next = Math.max(min, Math.min(max, current + (event.deltaY < 0 ? 1 : -1) * step));
      if (next === current) return;
      latest.current = { ...latest.current, sent: next };
      onStep(next);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    detach.current = () => element.removeEventListener('wheel', onWheel);
  }, []);
}
