// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitAutoFitTextElement, fitAutoFitTextGroup, installAutoFitText, largestFittingFontSize } from './auto-fit-text';

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('automatic text fitting', () => {
  it('keeps the intended size when it already fits', () => {
    expect(largestFittingFontSize(18, 10, (size) => size <= 18)).toBe(18);
  });

  it('finds the largest fitting size without dropping directly to the minimum', () => {
    const fitted = largestFittingFontSize(20, 10, (size) => size <= 14.3);
    expect(fitted).toBeGreaterThanOrEqual(14.125);
    expect(fitted).toBeLessThanOrEqual(14.3);
  });

  it('applies a measured font size only when the rendered label overflows', () => {
    const style = document.createElement('style');
    style.textContent = '.fitted-label { display: block; width: 100px; font-size: 20px; }';
    const label = document.createElement('span');
    label.className = 'fitted-label';
    label.dataset.autoFitText = '';
    label.dataset.autoFitMin = '10';
    label.textContent = 'Localized label';
    document.head.append(style);
    document.body.append(label);

    Object.defineProperty(label, 'clientWidth', { configurable: true, get: () => 100 });
    Object.defineProperty(label, 'scrollWidth', {
      configurable: true,
      get: () => Number.parseFloat(getComputedStyle(label).fontSize) * 7
    });

    const fitted = fitAutoFitTextElement(label);
    expect(fitted).toBeGreaterThan(14);
    expect(fitted).toBeLessThan(14.5);
    expect(Number.parseFloat(label.style.fontSize)).toBe(fitted);

    style.remove();
  });

  it('uses the remaining parent width when an intrinsic label box escapes its column', () => {
    const style = document.createElement('style');
    style.textContent = '.escaping-label { font-size: 20px; }';
    const parent = document.createElement('div');
    const label = document.createElement('span');
    label.className = 'escaping-label';
    label.dataset.autoFitText = '';
    label.dataset.autoFitMin = '10';
    parent.append(label);
    document.head.append(style);
    document.body.append(parent);

    Object.defineProperty(label, 'clientWidth', { configurable: true, get: () => 140 });
    Object.defineProperty(label, 'scrollWidth', {
      configurable: true,
      get: () => Number.parseFloat(getComputedStyle(label).fontSize) * 7
    });
    parent.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30,
      toJSON: () => ({})
    });
    label.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 140, bottom: 30, width: 140, height: 30,
      toJSON: () => ({})
    });

    const fitted = fitAutoFitTextElement(label);
    expect(fitted).toBeGreaterThan(14);
    expect(fitted).toBeLessThan(14.5);

    style.remove();
  });

  it('uses one shared fitted size for related labels based on the longest localization', () => {
    const style = document.createElement('style');
    style.textContent = '.group-label { display: block; width: 100px; font-size: 9.6px; }';
    const shortLabel = document.createElement('span');
    const longLabel = document.createElement('span');
    [shortLabel, longLabel].forEach((label) => {
      label.className = 'group-label';
      label.dataset.autoFitText = '';
      label.dataset.autoFitGroup = 'quick-actions';
      label.dataset.autoFitMin = '7';
      Object.defineProperty(label, 'clientWidth', { configurable: true, get: () => 100 });
      document.body.append(label);
    });
    shortLabel.textContent = 'Testar áudio';
    longLabel.textContent = 'Colocar o controle em repouso';
    Object.defineProperty(shortLabel, 'scrollWidth', {
      configurable: true,
      get: () => Number.parseFloat(getComputedStyle(shortLabel).fontSize) * 9
    });
    Object.defineProperty(longLabel, 'scrollWidth', {
      configurable: true,
      get: () => Number.parseFloat(getComputedStyle(longLabel).fontSize) * 13
    });
    document.head.append(style);

    const fitted = fitAutoFitTextGroup([shortLabel, longLabel]);
    expect(fitted).toBeGreaterThanOrEqual(7.625);
    expect(fitted).toBeLessThanOrEqual(7.75);
    expect(shortLabel.style.fontSize).toBe(longLabel.style.fontSize);

    style.remove();
  });
});

function observerFixture(initialVisibility: DocumentVisibilityState = 'visible') {
  const root = document.createElement('div');
  const style = document.createElement('style');
  style.textContent = '.observer-label { font-size: 20px; }';
  root.append(style);
  document.body.append(root);
  let visibility = initialVisibility;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frame) => { frames.delete(frame); });
  let resizeCallback: ResizeObserverCallback | undefined;
  const observe = vi.fn();
  const unobserve = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resizeCallback = callback; }
    observe = observe;
    unobserve = unobserve;
    disconnect = disconnect;
  });

  function label(text: string, group?: string) {
    const container = document.createElement('section');
    const element = document.createElement('span');
    element.className = 'observer-label';
    element.dataset.autoFitText = '';
    element.dataset.autoFitMin = '5';
    if (group) element.dataset.autoFitGroup = group;
    element.textContent = text;
    container.append(element);
    root.append(container);
    const bounds = () => element.closest('[hidden]') ? [] : [new DOMRect(0, 0, 100, 20)];
    Object.defineProperty(element, 'getClientRects', { configurable: true, value: bounds });
    Object.defineProperty(container, 'getClientRects', { configurable: true, value: bounds });
    Object.defineProperty(element, 'clientWidth', { get: () => 100 });
    const measure = vi.fn(() => (
      Number.parseFloat(getComputedStyle(element).fontSize) * (element.textContent?.length ?? 0)
    ));
    Object.defineProperty(element, 'scrollWidth', { get: measure });
    return { element, container, measure };
  }

  return {
    root, label, frames, observe, unobserve, disconnect,
    install() { cleanups.push(installAutoFitText(root)); },
    visibility(next: DocumentVisibilityState) {
      visibility = next;
      document.dispatchEvent(new Event('visibilitychange'));
    },
    resize() { resizeCallback?.([], {} as ResizeObserver); },
    async flush() {
      await Promise.resolve();
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
      await Promise.resolve();
    }
  };
}

describe('automatic text fitting observers', () => {
  it('ignores unrelated page mutations and does not loop on its own font-size writes', async () => {
    const fixture = observerFixture();
    const label = fixture.label('A longer label');
    const unrelated = document.createElement('aside');
    unrelated.textContent = 'Playing';
    fixture.root.append(unrelated);
    fixture.install();
    label.measure.mockClear();

    unrelated.firstChild!.textContent = 'Paused';
    unrelated.style.setProperty('--progress', '0.25');
    unrelated.className = 'media-frame';
    unrelated.append(document.createElement('span'));
    await fixture.flush();
    expect(label.measure).not.toHaveBeenCalled();

    label.element.firstChild!.textContent = 'A translated longer label';
    await fixture.flush();
    expect(label.measure).toHaveBeenCalled();
    expect(fixture.frames.size).toBe(0);
    label.measure.mockClear();
    await fixture.flush();
    expect(label.measure).not.toHaveBeenCalled();
  });

  it('refits for ancestor styles, label constraints, sibling layout, and container resizing', async () => {
    const fixture = observerFixture();
    const label = fixture.label('Localized label');
    fixture.install();
    label.measure.mockClear();
    const changes = [
      () => { label.container.className = 'compact'; },
      () => { fixture.root.dir = 'rtl'; },
      () => { label.element.dataset.autoFitMin = '8'; },
      () => { label.element.style.letterSpacing = '1px'; },
      () => { label.container.append(document.createTextNode('Wider sibling')); },
      () => fixture.resize()
    ];
    for (const change of changes) {
      change();
      await fixture.flush();
      expect(label.measure).toHaveBeenCalled();
      label.measure.mockClear();
    }
  });

  it('fits once at hidden startup and suspends work until the document becomes visible', async () => {
    const fixture = observerFixture('hidden');
    const label = fixture.label('Localized label');
    fixture.install();
    expect(label.measure).toHaveBeenCalled();
    expect(fixture.observe).not.toHaveBeenCalled();
    label.measure.mockClear();
    label.element.textContent = 'Changed while hidden';
    fixture.resize();
    await fixture.flush();
    expect(label.measure).not.toHaveBeenCalled();

    fixture.visibility('visible');
    await fixture.flush();
    expect(label.measure).toHaveBeenCalled();
    expect(fixture.observe).toHaveBeenCalledWith(label.container);
    label.measure.mockClear();
    fixture.resize();
    expect(fixture.frames.size).toBe(1);
    fixture.visibility('hidden');
    expect(fixture.frames.size).toBe(0);
    expect(fixture.disconnect).toHaveBeenCalled();
    label.element.textContent = 'Another hidden change';
    await fixture.flush();
    expect(label.measure).not.toHaveBeenCalled();
    fixture.visibility('visible');
    await fixture.flush();
    expect(label.measure).toHaveBeenCalled();
    expect(fixture.observe).toHaveBeenCalledTimes(2);
  });

  it('resynchronizes group members when pages are revealed and labels are added or removed', async () => {
    const fixture = observerFixture();
    const short = fixture.label('Short text', 'actions');
    const long = fixture.label('A much longer label', 'actions');
    long.container.hidden = true;
    fixture.install();
    const shortOnlySize = Number.parseFloat(short.element.style.fontSize);
    expect(long.measure).not.toHaveBeenCalled();

    long.element.textContent = 'A hidden translated longer label';
    short.measure.mockClear();
    await fixture.flush();
    expect(short.measure).not.toHaveBeenCalled();
    long.container.hidden = false;
    await fixture.flush();
    expect(long.element.style.fontSize).toBe(short.element.style.fontSize);
    expect(Number.parseFloat(short.element.style.fontSize)).toBeLessThan(shortOnlySize);
    expect(fixture.observe).toHaveBeenCalledWith(long.container);

    long.container.remove();
    await fixture.flush();
    expect(Number.parseFloat(short.element.style.fontSize)).toBe(shortOnlySize);
    expect(fixture.unobserve).toHaveBeenCalledWith(long.container);
    const added = fixture.label('An even longer translated label', 'actions');
    await fixture.flush();
    expect(added.element.style.fontSize).toBe(short.element.style.fontSize);
    expect(fixture.observe).toHaveBeenCalledWith(added.container);
  });
});

describe('automatic text fitting mutation filtering', () => {
  function syntheticFixture() {
    const fixture = observerFixture();
    let deliver: MutationCallback | undefined;
    vi.stubGlobal('MutationObserver', class {
      constructor(callback: MutationCallback) { deliver = callback; }
      observe = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
    });
    const record = (init: Partial<MutationRecord> & Pick<MutationRecord, 'type' | 'target'>) => ({
      addedNodes: document.createDocumentFragment().childNodes,
      removedNodes: document.createDocumentFragment().childNodes,
      attributeName: null,
      ...init
    }) as MutationRecord;
    return {
      ...fixture,
      record,
      deliver(records: MutationRecord[]) { deliver?.(records, {} as MutationObserver); }
    };
  }

  function spyClientRects(element: Element) {
    const original = element.getClientRects.bind(element);
    const spy = vi.fn(() => original());
    Object.defineProperty(element, 'getClientRects', { configurable: true, value: spy });
    return spy;
  }

  it('measures only the container that holds a text change and refits only its labels', async () => {
    const fixture = syntheticFixture();
    const first = fixture.label('First label');
    const second = fixture.label('Second label');
    fixture.install();
    first.measure.mockClear();
    second.measure.mockClear();
    const firstRects = spyClientRects(first.container);
    const secondRects = spyClientRects(second.container);

    fixture.deliver([fixture.record({ type: 'characterData', target: first.element.firstChild! })]);
    expect(firstRects).toHaveBeenCalledOnce();
    expect(secondRects).not.toHaveBeenCalled();
    await fixture.flush();
    expect(first.measure).toHaveBeenCalled();
    expect(second.measure).not.toHaveBeenCalled();
  });

  it('refits every member of a group when one member container changes', async () => {
    const fixture = syntheticFixture();
    const short = fixture.label('Short', 'shared');
    const long = fixture.label('A much longer label', 'shared');
    const solo = fixture.label('Solo label');
    fixture.install();
    [short, long, solo].forEach((label) => label.measure.mockClear());

    fixture.deliver([fixture.record({ type: 'childList', target: short.container })]);
    await fixture.flush();
    expect(short.measure).toHaveBeenCalled();
    expect(long.measure).toHaveBeenCalled();
    expect(solo.measure).not.toHaveBeenCalled();
    expect(short.element.style.fontSize).toBe(long.element.style.fontSize);
  });

  it('skips subtree queries for leaf attribute changes outside label containers', async () => {
    const fixture = syntheticFixture();
    const label = fixture.label('Localized label');
    const unrelated = document.createElement('button');
    fixture.root.append(unrelated);
    fixture.install();
    label.measure.mockClear();
    const query = vi.spyOn(unrelated, 'querySelector');
    const containerRects = spyClientRects(label.container);

    fixture.deliver([fixture.record({ type: 'attributes', target: unrelated, attributeName: 'class' })]);
    expect(query).not.toHaveBeenCalled();
    expect(containerRects).not.toHaveBeenCalled();
    await fixture.flush();
    expect(label.measure).not.toHaveBeenCalled();
    expect(fixture.frames.size).toBe(0);
  });

  it('refits everything for ancestor attribute changes and label attribute changes', async () => {
    const fixture = syntheticFixture();
    const first = fixture.label('First label');
    const second = fixture.label('Second label');
    fixture.install();
    for (const record of [
      fixture.record({ type: 'attributes', target: fixture.root, attributeName: 'lang' }),
      fixture.record({ type: 'attributes', target: first.container, attributeName: 'class' }),
      fixture.record({ type: 'attributes', target: first.element, attributeName: 'style' }),
      fixture.record({ type: 'attributes', target: document.createElement('span'), attributeName: 'data-auto-fit-min' })
    ]) {
      first.measure.mockClear();
      second.measure.mockClear();
      fixture.deliver([record]);
      await fixture.flush();
      expect(first.measure).toHaveBeenCalled();
      expect(second.measure).toHaveBeenCalled();
    }
  });

  it('does not inspect records while a full refit is already pending', async () => {
    const fixture = syntheticFixture();
    const label = fixture.label('Localized label');
    fixture.install();
    fixture.resize();
    const containerRects = spyClientRects(label.container);
    fixture.deliver([fixture.record({ type: 'characterData', target: label.element.firstChild! })]);
    expect(containerRects).not.toHaveBeenCalled();
    label.measure.mockClear();
    await fixture.flush();
    expect(label.measure).toHaveBeenCalled();
  });
});
