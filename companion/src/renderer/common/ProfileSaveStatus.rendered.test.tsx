// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ProfileSaveStatus } from './ProfileSaveStatus';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('ProfileSaveStatus', () => {
  it('draws an outlined and filled check beside the autosave message', () => {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(<ProfileSaveStatus />));
    expect(host.querySelector('.autosave-check-icon .autosave-check-outline')).not.toBeNull();
    expect(host.querySelector('.autosave-check-icon .autosave-check-fill')).not.toBeNull();
    expect(host.textContent).toBe('Changes Are Automatically Saved');
  });
});
