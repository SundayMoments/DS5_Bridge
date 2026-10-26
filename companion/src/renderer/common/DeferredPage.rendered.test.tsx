// @vitest-environment jsdom

import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { DeferredPage } from './DeferredPage';

describe('deferred page mounting', () => {
  it('waits until first activation, then preserves drafts and inactive cleanup across visits', () => {
    const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onActive = vi.fn();
    const onUnmount = vi.fn();
    function Page({ active }: { active: boolean }) {
      const [draft, setDraft] = useState(0);
      useEffect(() => { onActive(active); }, [active]);
      useEffect(() => onUnmount, []);
      return <button hidden={!active} onClick={() => setDraft(draft + 1)}>{draft}</button>;
    }
    const render = (active: boolean) => act(() => root.render(
      <DeferredPage active={active}><Page active={active} /></DeferredPage>
    ));
    try {
      render(false);
      expect(container.children).toHaveLength(0);
      expect(onActive).not.toHaveBeenCalled();
      render(true);
      const button = container.querySelector('button')!;
      expect(button.hidden).toBe(false);
      act(() => button.click());
      expect(button.textContent).toBe('1');
      render(false);
      expect(button.hidden).toBe(true);
      expect(onActive).toHaveBeenLastCalledWith(false);
      expect(onUnmount).not.toHaveBeenCalled();
      render(true);
      expect(container.querySelector('button')).toBe(button);
      expect(button.textContent).toBe('1');
    } finally {
      act(() => root.unmount());
      container.remove();
      environment.IS_REACT_ACT_ENVIRONMENT = false;
    }
    expect(onUnmount).toHaveBeenCalledOnce();
  });

  it('freezes a hidden page across snapshot changes and renders it once on reactivation', () => {
    const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    let renderCount = 0;
    const effects: Array<[boolean, number]> = [];
    let bumpLocal: (() => void) | null = null;
    function Page({ active, snapshot }: { active: boolean; snapshot: number }) {
      renderCount += 1;
      const [local, setLocal] = useState(0);
      bumpLocal = () => setLocal((value) => value + 1);
      useEffect(() => { effects.push([active, snapshot]); }, [active, snapshot]);
      return <output hidden={!active}>{`${snapshot}:${local}`}</output>;
    }
    const render = (active: boolean, snapshot: number) => act(() => root.render(
      <DeferredPage active={active}><Page active={active} snapshot={snapshot} /></DeferredPage>
    ));
    try {
      render(true, 1);
      render(true, 2);
      expect(renderCount).toBe(2);
      render(false, 3);
      // The deactivation render reaches the page so it can react to `active`.
      expect(renderCount).toBe(3);
      expect(effects.at(-1)).toEqual([false, 3]);
      const output = container.querySelector('output')!;
      expect(output.hidden).toBe(true);
      for (let snapshot = 4; snapshot < 10; snapshot += 1) render(false, snapshot);
      expect(renderCount).toBe(3);
      expect(output.textContent).toBe('3:0');
      // Its own state still updates while hidden.
      act(() => bumpLocal?.());
      expect(renderCount).toBe(4);
      expect(output.textContent).toBe('3:1');
      render(true, 10);
      expect(renderCount).toBe(5);
      expect(container.querySelector('output')).toBe(output);
      expect(output.hidden).toBe(false);
      expect(output.textContent).toBe('10:1');
      expect(effects.at(-1)).toEqual([true, 10]);
      render(true, 11);
      expect(renderCount).toBe(6);

      // A hidden page that is kept live receives every render, then freezes again.
      const renderLive = (live: boolean, snapshot: number) => act(() => root.render(
        <DeferredPage active={false} live={live}><Page active={false} snapshot={snapshot} /></DeferredPage>
      ));
      renderLive(true, 12);
      renderLive(true, 13);
      expect(renderCount).toBe(8);
      expect(output.textContent).toBe('13:1');
      renderLive(false, 14);
      renderLive(false, 15);
      expect(renderCount).toBe(9);
      expect(output.textContent).toBe('14:1');
    } finally {
      act(() => root.unmount());
      container.remove();
      environment.IS_REACT_ACT_ENVIRONMENT = false;
    }
  });
});
