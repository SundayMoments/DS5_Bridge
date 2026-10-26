import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  LocalizationContext,
  UI_LOCALE_OPTIONS,
  createMessageTranslator,
  loadedLocaleCatalog,
  loadLocaleCatalog,
  localizeDocument,
  resolveActiveLocale,
  validLocalePreference
} from '../common/localization';
import type { LocaleCatalog, UiLocalePreference } from '../common/localization';
import { fitAutoFitText, installAutoFitText } from '../common/auto-fit-text';

/**
 * Renderer cache of the language saved in companion settings. Settings stay
 * authoritative; the cache lets the first paint use the saved language.
 */
export const UI_LOCALE_STORAGE_KEY = 'ds5bridge.uiLocale';

function storedLocalePreference(): UiLocalePreference {
  try {
    return validLocalePreference(window.localStorage.getItem(UI_LOCALE_STORAGE_KEY));
  } catch {
    return validLocalePreference(null);
  }
}

export function RendererLocalization({ children }: { readonly children: ReactNode }) {
  const [preference, setPreferenceState] = useState(storedLocalePreference);
  const [systemLocales, setSystemLocales] = useState(() => [...navigator.languages]);
  const active = resolveActiveLocale(preference, systemLocales);
  const [catalog, setCatalog] = useState<LocaleCatalog | null>(() => loadedLocaleCatalog(active.locale));
  const translator = useMemo(() => catalog ? createMessageTranslator(catalog) : null, [catalog]);

  useEffect(() => {
    let disposed = false;
    const loaded = loadedLocaleCatalog(active.locale);
    if (loaded) {
      setCatalog(loaded);
    } else {
      void loadLocaleCatalog(active.locale)
        .catch(() => loadedLocaleCatalog('en')!)
        .then((next) => { if (!disposed) setCatalog(next); });
    }
    return () => { disposed = true; };
  }, [active.locale]);

  const setPreference = useCallback((next: UiLocalePreference) => {
    const valid = validLocalePreference(next);
    try {
      window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, valid);
    } catch {
      // The settings snapshot remains authoritative; the cache only avoids a startup flash.
    }
    setPreferenceState(valid);
  }, []);

  useEffect(() => {
    const synchronize = (event: StorageEvent) => {
      if (event.key === UI_LOCALE_STORAGE_KEY) setPreferenceState(storedLocalePreference());
    };
    window.addEventListener('storage', synchronize);
    return () => window.removeEventListener('storage', synchronize);
  }, []);

  useEffect(() => {
    const synchronize = () => setSystemLocales([...navigator.languages]);
    window.addEventListener('languagechange', synchronize);
    return () => window.removeEventListener('languagechange', synchronize);
  }, []);

  useLayoutEffect(() => {
    if (!catalog) return;
    const stopLocalizing = localizeDocument(document, catalog);
    fitAutoFitText(document);
    return stopLocalizing;
  }, [catalog]);

  useLayoutEffect(() => installAutoFitText(document), []);

  const value = useMemo(() => ({
    locale: catalog?.meta.locale ?? active.locale,
    direction: catalog?.meta.direction ?? 'ltr',
    preference,
    options: UI_LOCALE_OPTIONS,
    translate: translator?.translate ?? ((source: string) => source),
    setPreference
  }), [catalog, active.locale, preference, setPreference, translator]);

  // Initial children wait for their language. Once mounted, keep them alive
  // while a subsequent language is loading.
  return <LocalizationContext.Provider value={value}>{catalog ? children : null}</LocalizationContext.Provider>;
}
