// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLocaleCatalog, useLocalization } from '../common/localization';
import { RendererLocalization, UI_LOCALE_STORAGE_KEY } from './RendererLocalization';

type ActEnvironment = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };
let container: HTMLDivElement;
let root: Root;

function LocaleProbe({ next = 'en' }: { readonly next?: string }) {
  const localization = useLocalization();
  return (
    <button type="button" data-l10n="off" onClick={() => localization.setPreference(next)}>
      {localization.preference}:{localization.locale}
    </button>
  );
}

describe('RendererLocalization', () => {
  beforeEach(() => {
    (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
    vi.restoreAllMocks();
    (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('uses the DS5 Bridge cache key for the saved language', () => {
    expect(UI_LOCALE_STORAGE_KEY).toBe('ds5bridge.uiLocale');
  });

  it('starts from the system locale and persists an explicit language choice', () => {
    act(() => root.render(
      <RendererLocalization><LocaleProbe /></RendererLocalization>
    ));
    const button = container.querySelector('button')!;
    expect(button.textContent).toBe('system:en');
    expect(document.documentElement.lang).toBe('en');

    act(() => button.click());
    expect(button.textContent).toBe('en:en');
    expect(window.localStorage.getItem(UI_LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('restores and persists an explicit translated locale', async () => {
    window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, 'pt-BR');
    act(() => root.render(
      <RendererLocalization><LocaleProbe next="it" /></RendererLocalization>
    ));
    expect(container.querySelector('button')).toBeNull();
    await act(async () => { await loadLocaleCatalog('pt-BR'); });
    const button = container.querySelector('button')!;
    expect(button.textContent).toBe('pt-BR:pt-BR');
    expect(document.documentElement.lang).toBe('pt-BR');

    act(() => button.click());
    expect(container.querySelector('button')).toBe(button);
    await act(async () => { await loadLocaleCatalog('it'); });
    expect(button.textContent).toBe('it:it');
    expect(document.documentElement.lang).toBe('it');
    expect(window.localStorage.getItem(UI_LOCALE_STORAGE_KEY)).toBe('it');
  });

  it('follows system language changes while the system preference is active', async () => {
    const languages = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
    act(() => root.render(
      <RendererLocalization><LocaleProbe /></RendererLocalization>
    ));
    const button = container.querySelector('button')!;
    expect(button.textContent).toBe('system:en');

    languages.mockReturnValue(['es-MX']);
    act(() => window.dispatchEvent(new Event('languagechange')));
    await act(async () => { await loadLocaleCatalog('es-419'); });
    expect(button.textContent).toBe('system:es-419');
    expect(document.documentElement.lang).toBe('es-419');
  });

  it('ignores an older dictionary load after another language is selected', async () => {
    act(() => root.render(
      <RendererLocalization><LocaleProbe next="en" /></RendererLocalization>
    ));
    const button = container.querySelector('button')!;
    window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, 'fr');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: UI_LOCALE_STORAGE_KEY })));
    act(() => button.click());
    await act(async () => { await loadLocaleCatalog('fr'); });
    expect(container.querySelector('button')).toBe(button);
    expect(button.textContent).toBe('en:en');
    expect(document.documentElement.lang).toBe('en');
  });
});
