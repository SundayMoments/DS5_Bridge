// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { radialDeadzonePreview } from '@renderer/radial-deadzone-preview';
import { normalizeRadialDeadzonePercent } from '@shared/protocol';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('renderer test environment', () => {
  it('resolves the renderer and shared aliases', () => {
    expect(typeof radialDeadzonePreview).toBe('function');
    expect(normalizeRadialDeadzonePercent(200)).toBeLessThanOrEqual(100);
  });

  it('renders React components into jsdom', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<button type="button">Ready</button>));
    expect(host.querySelector('button')?.textContent).toBe('Ready');
    act(() => root.unmount());
  });
});
