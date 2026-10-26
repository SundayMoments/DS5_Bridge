// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScrollContextEdges } from './use-scroll-context-edges';

class TrackingResizeObserver {
  static instances: TrackingResizeObserver[] = [];
  readonly targets = new Set<Element>();
  readonly observe = vi.fn((target: Element) => this.targets.add(target));
  readonly unobserve = vi.fn((target: Element) => this.targets.delete(target));
  readonly disconnect = vi.fn(() => this.targets.clear());

  constructor(readonly callback: ResizeObserverCallback) {
    TrackingResizeObserver.instances.push(this);
  }

  resize() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

let container: HTMLDivElement;
let root: Root;

function ScrollArea({ active = true, children = ['first', 'second'] }: {
  active?: boolean;
  children?: string[];
}) {
  const { scrollRef, scrollEdges, updateScrollEdges } = useScrollContextEdges(active);
  return <div ref={scrollRef} data-up={scrollEdges.up} data-down={scrollEdges.down} onScroll={updateScrollEdges}>
    {children.map((child) => <div key={child}><span>{child}</span></div>)}
  </div>;
}

async function render(active = true, children?: string[]) {
  await act(async () => root.render(<ScrollArea active={active} children={children} />));
  return container.firstElementChild as HTMLDivElement;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', TrackingResizeObserver);
  TrackingResizeObserver.instances = [];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('scroll context observation', () => {
  it('releases removed children across repeated library filtering without reobserving retained cards', async () => {
    const element = await render();
    const observer = TrackingResizeObserver.instances[0]!;
    const first = element.firstElementChild!;
    const second = element.lastElementChild!;
    expect(observer.targets).toEqual(new Set([element, first, second]));

    await render(true, ['second', 'third']);
    const third = element.lastElementChild!;
    expect(observer.targets).toEqual(new Set([element, second, third]));
    expect(observer.unobserve).toHaveBeenCalledWith(first);
    expect(observer.observe.mock.calls.filter(([target]) => target === second)).toHaveLength(1);

    for (let index = 0; index < 20; index += 1) {
      await render(true, [`game-${index}`]);
      expect(observer.targets).toEqual(new Set([element, element.firstElementChild!]));
    }
    await render(true, []);
    expect(observer.targets).toEqual(new Set([element]));
  });

  it('updates overflow for content changes and resizing without repeating child observations', async () => {
    const element = await render();
    const observer = TrackingResizeObserver.instances[0]!;
    const observedCount = observer.observe.mock.calls.length;
    let scrollHeight = 300;
    Object.defineProperties(element, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, get: () => scrollHeight }
    });

    await act(async () => { element.querySelector('span')!.textContent = 'Longer game title'; });
    expect(element.dataset.down).toBe('true');
    expect(observer.observe).toHaveBeenCalledTimes(observedCount);

    act(() => {
      element.scrollTop = 200;
      element.dispatchEvent(new Event('scroll'));
    });
    expect(element.dataset.up).toBe('true');
    expect(element.dataset.down).toBe('false');

    act(() => {
      element.scrollTop = 0;
      scrollHeight = 80;
      observer.resize();
    });
    expect(element.dataset.up).toBe('false');
    expect(element.dataset.down).toBe('false');
  });

  it('disconnects while inactive and observes the current children when reopened', async () => {
    await render();
    const initialObserver = TrackingResizeObserver.instances[0]!;
    await render(false, ['replacement']);
    expect(initialObserver.disconnect).toHaveBeenCalledOnce();
    expect(initialObserver.targets.size).toBe(0);

    const element = await render(true, ['replacement']);
    const reopenedObserver = TrackingResizeObserver.instances[1]!;
    expect(reopenedObserver.targets).toEqual(new Set([element, element.firstElementChild!]));
  });
});
