// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CustomSelect } from './CustomSelect';
import type { CustomSelectProps } from './custom-select-types';

type ActEnvironment = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };
let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeAll(() => { (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => {
  const mounted = root;
  root = null;
  if (mounted) await act(async () => mounted.unmount());
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(() => { (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = false; });

async function keyboardSelect(props: Partial<CustomSelectProps<string>> = {}) {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  container = document.createElement('div');
  container.className = 'shell';
  document.body.append(container);
  root = createRoot(container);
  const onChange = vi.fn();
  await act(async () => root?.render(<CustomSelect value="one" options={[
    ['One', 'one'], ['Unavailable', 'unavailable'], ['Three', 'three']
  ]} isOptionDisabled={value => value === 'unavailable'} ariaLabel="Fixture select" onChange={onChange} {...props} />));
  const trigger = container.querySelector<HTMLButtonElement>('.custom-select-button')!;
  trigger.focus();
  return { trigger, onChange };
}

function key(key: string, target: Element | null = document.activeElement) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => target?.dispatchEvent(event));
  return event;
}

describe('rendered CustomSelect', () => {
  it.each([true, false])('opens and selects by keyboard, skipping disabled options (floating=%s)', async floatingMenu => {
    const h = await keyboardSelect({ floatingMenu });
    key('ArrowDown');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('One');
    expect(h.trigger.getAttribute('aria-expanded')).toBe('true');
    key('ArrowDown');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Three');
    expect(h.onChange).not.toHaveBeenCalled();
    key('Enter');
    expect(h.onChange).toHaveBeenCalledExactlyOnceWith('three');
    expect(container?.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(h.trigger);
  });

  it.each(['Enter', ' ', 'ArrowUp'])('focuses the selected option when opened with %s', async openingKey => {
    const h = await keyboardSelect({ value: 'three' });
    key(openingKey);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Three');
    key('Home');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('One');
    key('End');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Three');
    key('Escape');
    expect(container?.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(h.trigger);
    expect(h.onChange).not.toHaveBeenCalled();
  });

  it('moves by grid rows and columns while retaining multi-select focus and the open menu', async () => {
    const h = await keyboardSelect({
      options: [['One', 'one'], ['Two', 'two'], ['Three', 'three'], ['Unavailable', 'unavailable'], ['Five', 'five'], ['Six', 'six']],
      menuGrid: { columns: 2, visibleRows: 2, measureCells: false },
      closeOnSelect: false, multiSelect: true
    });
    key('ArrowDown');
    key('ArrowRight');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Two');
    key('ArrowDown');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Six');
    key('ArrowUp');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Two');
    key('Home');
    key('ArrowDown');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Three');
    key(' ');
    expect(h.onChange).toHaveBeenCalledExactlyOnceWith('three');
    expect(container?.querySelector('[role="listbox"]')).not.toBeNull();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Three');
    key('End');
    key('Enter');
    expect(h.onChange.mock.calls).toEqual([['three'], ['six']]);
    expect(container?.querySelector('[role="listbox"]')).not.toBeNull();
    key('Escape');
    expect(document.activeElement).toBe(h.trigger);
  });

  it('does not consume the custom header, footer, or option-action keyboard events', async () => {
    const onAction = vi.fn();
    const h = await keyboardSelect({
      renderMenuHeader: () => <input aria-label="Fixture header" />,
      renderMenuFooter: () => <button onClick={onAction}>Fixture footer</button>,
      renderOptionAction: (_label, value) => value === 'three' ? <button onClick={onAction}>Fixture option action</button> : null
    });
    key('ArrowDown');
    const controls = [...container!.querySelectorAll<HTMLElement>('input, .custom-select-menu-footer button, .custom-select-menu-option-action button')];
    for (const control of controls) {
      control.focus();
      expect(key('ArrowDown').defaultPrevented).toBe(false);
      expect(key('Enter').defaultPrevented).toBe(false);
    }
    act(() => controls[controls.length - 1]!.click());
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(h.onChange).not.toHaveBeenCalled();
  });

  it('blocks option activation while the open control is disabled without closing it', async () => {
    const h = await keyboardSelect();
    key('ArrowDown');
    await act(async () => root?.render(<CustomSelect value="one" options={[
      ['One', 'one'], ['Three', 'three']
    ]} disabled ariaLabel="Fixture select" onChange={h.onChange} />));
    const option = container!.querySelectorAll<HTMLButtonElement>('[role="option"]')[1]!;
    expect(option.getAttribute('aria-disabled')).toBe('true');
    act(() => option.click());
    key('Enter', option);
    expect(h.onChange).not.toHaveBeenCalled();
    expect(container?.querySelector('[role="listbox"]')).not.toBeNull();
  });

  it.each([
    { name: 'requested cap above the trigger', top: 650, viewportHeight: 800, requested: 232, height: 232, placement: 'top' },
    { name: 'default long-list cap above the trigger', top: 650, viewportHeight: 800, requested: undefined, height: 360, placement: 'top' },
    { name: 'requested cap below the trigger', top: 20, viewportHeight: 800, requested: 232, height: 232, placement: 'bottom' },
    { name: 'less space than the requested cap', top: 20, viewportHeight: 190, requested: 232, height: 118, placement: 'bottom' }
  ])('bounds a long list with $name while retaining every option', async ({ top, viewportHeight, requested, height, placement }) => {
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('innerHeight', viewportHeight);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => (
      window.setTimeout(() => callback(0), 0)
    ));
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 100, y: top, left: 100, top, right: 180, bottom: top + 38, width: 80, height: 38,
      toJSON: () => ({})
    });
    const onChange = vi.fn();
    container = document.createElement('div');
    container.className = 'shell';
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <CustomSelect
        value={0}
        options={Array.from({ length: 25 }, (_, index) => [`Button ${index}`, index])}
        menuMaxHeight={requested}
        floatingMenuFitContent={false}
        ariaLabel="Remap target"
        onChange={onChange}
      />
    ));
    act(() => container?.querySelector<HTMLButtonElement>('.custom-select-button')?.click());
    const layer = container.querySelector<HTMLElement>('.custom-select-floating-layer')!;
    expect(layer.style.getPropertyValue('--custom-select-menu-max-height')).toBe(`${height}px`);
    expect(layer.classList.contains('menu-top')).toBe(placement === 'top');
    if (placement === 'top') {
      expect(layer.style.bottom).toBe(`${viewportHeight - top + 6}px`);
    } else {
      expect(layer.style.top).toBe(`${top + 38 + 6}px`);
    }
    const options = layer.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect(options).toHaveLength(25);
    act(() => options[24]?.click());
    expect(onChange).toHaveBeenCalledWith(24);
    expect(container.querySelector('.custom-select-menu')).toBeNull();
  });

  it('keeps an open fit-content menu stable across repeated selections', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => (
      window.setTimeout(() => callback(0), 0)
    ));
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
    const floatingWidth = (element: HTMLElement) => Number.parseFloat(
      element.closest<HTMLElement>('.custom-select-floating-layer')?.style.width ?? '0'
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      const isClosedRoot = this.classList.contains('custom-select')
        && !this.classList.contains('custom-select-floating-layer');
      const width = isClosedRoot ? 180
        : this.classList.contains('custom-select-menu') ? floatingWidth(this) : 0;
      return {
        x: 100, y: 20, left: 100, top: 20, right: 100 + width, bottom: 58, width, height: 38,
        toJSON: () => ({})
      };
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function clientWidth(this: HTMLElement) {
      return this.parentElement?.matches('button[role="option"]')
        ? Math.max(0, floatingWidth(this) - 59)
        : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function scrollWidth(this: HTMLElement) {
      return Math.max(this.clientWidth, (this.textContent?.length ?? 0) * 8);
    });

    function StatefulSelect() {
      const [value, setValue] = useState('one');
      return <CustomSelect value={value} options={[
        ['Function One', 'one'], ['Function Two', 'two'], ['Function Three', 'three']
      ]} closeOnSelect={false} ariaLabel="Function" onChange={setValue} />;
    }

    container = document.createElement('div');
    container.className = 'shell';
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<StatefulSelect />));

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('.custom-select-button')?.click();
      await new Promise((resolve) => window.setTimeout(resolve, 1));
    });
    const floatingLayer = container.querySelector<HTMLElement>('.custom-select-floating-layer');
    expect(floatingLayer?.style.width).toBe('180px');

    for (const label of ['Function Two', 'Function Three', 'Function One', 'Function Two']) {
      await act(async () => {
        [...container!.querySelectorAll<HTMLButtonElement>('[role="option"]')]
          .find((option) => option.textContent?.includes(label))?.click();
        await new Promise((resolve) => window.setTimeout(resolve, 1));
      });
      expect(floatingLayer?.style.width).toBe('180px');
    }
  });

  it('keeps every closed field bounded and expands its localized menu toward the right by default', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => (
      window.setTimeout(() => callback(0), 0)
    ));
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      const isClosedRoot = this.classList.contains('custom-select')
        && !this.classList.contains('custom-select-floating-layer');
      const left = isClosedRoot ? 100 : 0;
      const width = isClosedRoot ? 180 : 0;
      return {
        x: left, y: 20, left, top: 20, right: left + width, bottom: 58, width, height: 38,
        toJSON: () => ({})
      };
    });
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function scrollWidth(this: HTMLElement) {
      return (this.textContent?.length ?? 0) * 10;
    });

    container = document.createElement('div');
    container.className = 'shell';
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <CustomSelect
        value="system"
        options={[
          ['Acceso directo del teclado', 'keyboard'],
          ['Comando del sistema', 'system'],
          ['Envío de botón del mando', 'controller'],
          ['Repetir mientras se mantiene pulsado', 'repeat-es'],
          ['Repetir enquanto mantido pressionado', 'repeat-pt']
        ]}
        ariaLabel="Tipo de función"
        onChange={() => undefined}
      />
    ));

    const closedField = container.querySelector<HTMLButtonElement>('.custom-select-button');
    expect(closedField?.getAttribute('title')).toBe('Comando del sistema');
    expect(closedField?.getAttribute('aria-description')).toBe('Comando del sistema');
    act(() => {
      closedField?.click();
    });

    const floatingLayer = container.querySelector<HTMLElement>('.custom-select-floating-layer');
    expect(floatingLayer).not.toBeNull();
    expect(Number.parseFloat(floatingLayer?.style.width ?? '0')).toBeGreaterThan(180);
    expect(floatingLayer?.style.left).toBe('100px');
    expect(closedField?.closest<HTMLElement>('.custom-select')?.style.width).toBe('');
    expect(floatingLayer?.querySelector('[role="option"]')?.getAttribute('title'))
      .toBe('Acceso directo del teclado');
  });

  it('end-aligns a localized floating menu and clamps it inside the viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => (
      window.setTimeout(() => callback(0), 0)
    ));
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      const isClosedRoot = this.classList.contains('custom-select')
        && !this.classList.contains('custom-select-floating-layer');
      const left = isClosedRoot ? 878 : 0;
      const width = isClosedRoot ? 120 : 0;
      return {
        x: left, y: 20, left, top: 20, right: left + width, bottom: 58, width, height: 38,
        toJSON: () => ({})
      };
    });
    let intrinsicWidth = true;
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function scrollWidth(this: HTMLElement) {
      return intrinsicWidth ? (this.textContent?.length ?? 0) * 12 : 2_000;
    });

    container = document.createElement('div');
    container.className = 'shell';
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(
      <CustomSelect
        value="en"
        options={[
          ['Use system language', 'system'],
          ['English', 'en'],
          ['Español (Latinoamérica)', 'es-419'],
          ['Português (Brasil)', 'pt-BR']
        ]}
        floatingMenu
        floatingMenuFitContent
        floatingMenuAlign="end"
        ariaLabel="Application language"
        onChange={() => undefined}
      />
    ));

    const closedField = container.querySelector<HTMLButtonElement>('.custom-select-button');
    await act(async () => {
      closedField?.click();
      await new Promise((resolve) => window.setTimeout(resolve, 1));
    });

    const floatingLayer = container.querySelector<HTMLElement>('.custom-select-floating-layer');
    const left = Number.parseFloat(floatingLayer?.style.left ?? '0');
    const width = Number.parseFloat(floatingLayer?.style.width ?? '0');
    expect(width).toBeGreaterThan(120);
    expect(left + width).toBe(992);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + width).toBeLessThanOrEqual(992);

    intrinsicWidth = false;
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(Number.parseFloat(floatingLayer?.style.left ?? '0')).toBe(left);
    expect(Number.parseFloat(floatingLayer?.style.width ?? '0')).toBe(width);
  });
});
