// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RendererFailureBoundary } from './RendererFailureBoundary';

type ActEnvironment = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function BrokenRenderer(): ReactNode {
  throw new TypeError('bootstrap exploded');
}

async function render(node: ReactNode): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
}

beforeAll(() => {
  (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  const mounted = root;
  root = null;
  if (mounted) await act(async () => mounted.unmount());
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

afterAll(() => {
  (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
});

describe('RendererFailureBoundary', () => {
  it('leaves a healthy renderer unchanged', async () => {
    await render(
      <RendererFailureBoundary>
        <main aria-label="Healthy renderer">Ready</main>
      </RendererFailureBoundary>
    );

    expect(container?.querySelector('[aria-label="Healthy renderer"]')?.textContent).toBe('Ready');
    expect(container?.querySelector('.renderer-failure')).toBeNull();
  });

  it('reports render failures and provides a working reload action', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();

    await render(
      <RendererFailureBoundary reload={reload}>
        <BrokenRenderer />
      </RendererFailureBoundary>
    );

    const alert = container?.querySelector<HTMLElement>('[role="alert"]');
    expect(alert?.textContent).toContain('DS5 Bridge could not finish loading');
    expect(alert?.textContent).toContain('TypeError: bootstrap exploded');
    expect(consoleError.mock.calls).toContainEqual([
      '[renderer] Uncaught render failure.',
      expect.objectContaining({ message: 'bootstrap exploded' }),
      expect.any(String)
    ]);

    await act(async () => alert?.querySelector<HTMLButtonElement>('button')?.click());
    expect(reload).toHaveBeenCalledOnce();
  });
});
