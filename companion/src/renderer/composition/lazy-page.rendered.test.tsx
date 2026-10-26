// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { DeferredPage } from '../common/DeferredPage';
import { lazyPage, pageShell } from './lazy-page';

type PageProps = { readonly active: boolean; readonly label: string };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function FixturePage({ active, label }: PageProps) {
  const [count, setCount] = useState(0);
  return (
    <div className={`control-page fixture-page ${active ? 'active' : ''}`} data-page="real">
      <button type="button" onClick={() => setCount(count + 1)}>{label} {count}</button>
    </div>
  );
}

let root: Root | null = null;
let container = document.createElement('div');
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  container.remove();
});
async function render(ui: ReactNode) {
  if (!container.isConnected) document.body.append(container);
  root ??= createRoot(container);
  await act(async () => { root!.render(ui); });
}

it('loads only on first activation, shows the page shell meanwhile and then the page', async () => {
  const chunk = deferred<typeof FixturePage>();
  const load = vi.fn(() => chunk.promise);
  const Page = lazyPage<PageProps>(load, pageShell('fixture-page', 'control-panel-fixture'));
  container = document.createElement('div');
  await render(<DeferredPage active={false}><Page active={false} label="Chords" /></DeferredPage>);
  expect(load).not.toHaveBeenCalled();
  expect(container.innerHTML).toBe('');

  await render(<DeferredPage active><Page active label="Chords" /></DeferredPage>);
  expect(load).toHaveBeenCalledOnce();
  const shell = container.querySelector('.control-page.fixture-page.active');
  expect(shell?.getAttribute('aria-busy')).toBe('true');
  expect(shell?.id).toBe('control-panel-fixture');
  expect(shell?.childElementCount).toBe(0);

  await act(async () => { chunk.resolve(FixturePage); await chunk.promise; });
  expect(container.querySelector('[data-page="real"].active')?.textContent).toBe('Chords 0');
  expect(container.querySelector('[aria-busy]')).toBeNull();

  // Deactivating keeps the visited page mounted with its state, as DeferredPage requires.
  await act(async () => { container.querySelector('button')!.click(); });
  await render(<DeferredPage active={false}><Page active={false} label="Chords" /></DeferredPage>);
  expect(container.querySelector('[data-page="real"]')?.classList.contains('active')).toBe(false);
  await render(<DeferredPage active><Page active label="Chords" /></DeferredPage>);
  expect(container.querySelector('[data-page="real"].active')?.textContent).toBe('Chords 1');
  expect(load).toHaveBeenCalledOnce();
});

it('renders a preloaded page on its first activation without a placeholder', async () => {
  const Page = lazyPage<PageProps>(async () => FixturePage, pageShell('fixture-page'));
  await Page.preload();
  container = document.createElement('div');
  await render(<DeferredPage active={false}><Page active={false} label="Settings" /></DeferredPage>);
  const observed: string[] = [];
  const observer = new MutationObserver(() => observed.push(container.innerHTML));
  observer.observe(container, { childList: true, subtree: true });
  await render(<DeferredPage active><Page active label="Settings" /></DeferredPage>);
  observer.disconnect();
  expect(observed.every((html) => !html.includes('aria-busy'))).toBe(true);
  expect(container.querySelector('[data-page="real"].active')?.textContent).toBe('Settings 0');
});

it('retries a failed chunk load on the next activation', async () => {
  const load = vi.fn<() => Promise<typeof FixturePage>>()
    .mockRejectedValueOnce(new Error('fixture chunk failure'))
    .mockResolvedValue(FixturePage);
  const Page = lazyPage<PageProps>(load, pageShell('fixture-page'));
  container = document.createElement('div');
  await render(<Page active label="Devices" />);
  expect(container.querySelector('.fixture-page[aria-busy="true"]')).not.toBeNull();
  await act(async () => { root!.unmount(); });
  root = null;
  await render(<Page active label="Devices" />);
  expect(load).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[data-page="real"]')?.textContent).toBe('Devices 0');
});
