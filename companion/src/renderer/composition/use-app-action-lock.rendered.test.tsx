// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useAppActionLock } from './use-app-action-lock';

type Lock = ReturnType<typeof useAppActionLock>;

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
});

function renderLock(hasSnapshot = true): () => Lock {
  let latest!: Lock;
  function Probe() {
    latest = useAppActionLock(hasSnapshot);
    return null;
  }
  const host = document.createElement('div');
  root = createRoot(host);
  act(() => root!.render(<Probe />));
  return () => latest;
}

describe('App action lock', () => {
  it('lets only the first of two actions started in the same tick run', () => {
    const lock = renderLock();
    let first = false;
    let second = false;
    act(() => {
      const current = lock();
      first = current.beginAppAction('save-theme');
      second = current.beginAppAction('save-scale');
    });
    expect([first, second]).toEqual([true, false]);
    expect(lock().pendingAction).toBe('save-theme');
    act(() => lock().endAppAction('save-theme'));
    expect(lock().pendingAction).toBeNull();
    let next = false;
    act(() => { next = lock().beginAppAction('save-scale'); });
    expect(next).toBe(true);
  });

  it('ends only its own action and never starts without a snapshot', () => {
    const lock = renderLock();
    act(() => lock().setPendingAction('controller-pairing'));
    act(() => lock().endAppAction('save-theme'));
    expect(lock().pendingAction).toBe('controller-pairing');
    act(() => root!.unmount());
    root = null;
    const empty = renderLock(false);
    let started = true;
    act(() => { started = empty().beginAppAction('save-theme'); });
    expect(started).toBe(false);
  });
});
