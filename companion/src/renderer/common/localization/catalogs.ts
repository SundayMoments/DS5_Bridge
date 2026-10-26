import { matchingUiLocale } from '../../../shared/ui-locale-matching';
import type { ActiveLocale, LocaleCatalog, UiLocalePreference } from './types';

export const DEFAULT_UI_LOCALE = 'en';
export const SYSTEM_UI_LOCALE = 'system';
export const AI_TRANSLATED_UI_LOCALES = ['es-419', 'es-ES', 'pt-BR', 'it', 'fr', 'pl', 'ko', 'zh-Hans'] as const;

const modules = import.meta.glob<LocaleCatalog>(['./locales/*.json', '!./locales/master.en.json'], {
  import: 'default'
});

function isCatalog(value: unknown): value is LocaleCatalog {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LocaleCatalog>;
  return typeof candidate.meta?.locale === 'string'
    && typeof candidate.meta.nativeName === 'string'
    && (candidate.meta.direction === 'ltr' || candidate.meta.direction === 'rtl')
    && Boolean(candidate.translations && typeof candidate.translations === 'object');
}

// Language selection needs only this small manifest. Translation dictionaries are
// loaded once, on demand, instead of being parsed in every renderer at startup.
const localeNames: Array<[string, string]> = [
  ['English', 'en'],
  ['Español (Latinoamérica)', 'es-419'],
  ['Español (España)', 'es-ES'],
  ['Português (Brasil)', 'pt-BR'],
  ['Italiano', 'it'],
  ['Français', 'fr'],
  ['Polski', 'pl'],
  ['한국어', 'ko'],
  ['简体中文', 'zh-Hans']
];
const englishName = localeNames[0][0];
// UI text is authored in English and the generated master maps every source to
// itself, so English needs no dictionary: a translator miss returns the source.
// The generator and validation scripts still read master.en.json from disk.
const englishCatalog: LocaleCatalog = Object.freeze({
  meta: Object.freeze({ locale: DEFAULT_UI_LOCALE, name: englishName, nativeName: englishName, direction: 'ltr' as const }),
  translations: Object.freeze({})
});
const loadedCatalogs = new Map<string, LocaleCatalog>([[DEFAULT_UI_LOCALE, englishCatalog]]);
const pendingCatalogs = new Map<string, Promise<LocaleCatalog>>();
const evictionListeners = new Set<(catalog: LocaleCatalog) => void>();
let requestedLocale = DEFAULT_UI_LOCALE;

/** True for the built-in English identity catalog, which never needs DOM translation. */
export function isBundledEnglishCatalog(catalog: LocaleCatalog): boolean {
  return catalog === englishCatalog;
}

/** Notified when a translated catalog stops being retained after a locale switch. */
export function onLocaleCatalogEvicted(listener: (catalog: LocaleCatalog) => void): () => void {
  evictionListeners.add(listener);
  return () => { evictionListeners.delete(listener); };
}

function evictInactiveCatalogs() {
  // Keep English and the most recently requested locale; a previous dictionary
  // and its compiled translator are released once the switch completes.
  for (const [locale, catalog] of loadedCatalogs) {
    if (locale === DEFAULT_UI_LOCALE || locale === requestedLocale) continue;
    loadedCatalogs.delete(locale);
    evictionListeners.forEach((listener) => listener(catalog));
  }
}

export const UI_LOCALE_OPTIONS: Array<[string, UiLocalePreference]> = [
  ['Use system language', SYSTEM_UI_LOCALE],
  ...localeNames.slice().sort(([left], [right]) => left.localeCompare(right, 'en'))
];

export function isAiTranslatedUiLocale(locale: UiLocalePreference): boolean {
  return AI_TRANSLATED_UI_LOCALES.some((candidate) => candidate === locale);
}

export function validLocalePreference(value: string | null): UiLocalePreference {
  if (value === SYSTEM_UI_LOCALE) return value;
  return (value && matchingUiLocale(value)) || SYSTEM_UI_LOCALE;
}

export function resolveActiveLocale(
  preference: UiLocalePreference,
  systemLocales: readonly string[]
): ActiveLocale {
  const preferred = preference === SYSTEM_UI_LOCALE ? null : matchingUiLocale(preference);
  const system = systemLocales.map(matchingUiLocale).find((locale) => locale !== null) ?? null;
  return {
    locale: preferred ?? system ?? DEFAULT_UI_LOCALE,
    preference
  };
}

export function loadedLocaleCatalog(locale: string): LocaleCatalog | null {
  const canonical = matchingUiLocale(locale) ?? DEFAULT_UI_LOCALE;
  const loaded = loadedCatalogs.get(canonical) ?? null;
  // Switching to an already retained catalog (always the case for English)
  // completes the switch without a load, so release the previous dictionary here.
  if (loaded && canonical !== requestedLocale && !pendingCatalogs.size) {
    requestedLocale = canonical;
    evictInactiveCatalogs();
  }
  return loaded;
}

export function loadLocaleCatalog(locale: string): Promise<LocaleCatalog> {
  const canonical = matchingUiLocale(locale) ?? DEFAULT_UI_LOCALE;
  requestedLocale = canonical;
  const loaded = loadedCatalogs.get(canonical);
  if (loaded) {
    evictInactiveCatalogs();
    return Promise.resolve(loaded);
  }
  const pending = pendingCatalogs.get(canonical);
  if (pending) return pending;
  const load = modules[`./locales/${canonical}.json`];
  const promise = Promise.resolve().then(async () => {
    const catalog = await load?.();
    if (!isCatalog(catalog) || catalog.meta.locale !== canonical) {
      throw new Error(`Invalid localization catalog: ${canonical}`);
    }
    loadedCatalogs.set(canonical, catalog);
    evictInactiveCatalogs();
    return catalog;
  }).finally(() => pendingCatalogs.delete(canonical));
  pendingCatalogs.set(canonical, promise);
  return promise;
}

export function mergedTranslations(catalog: LocaleCatalog): Readonly<Record<string, string>> {
  // English is the identity: a missing source translates to itself, so no
  // English entries are merged. Bundled dictionaries are reused as loaded;
  // other catalogs are snapshotted so later edits do not leak into a translator.
  if (catalog === englishCatalog || loadedCatalogs.get(catalog.meta.locale) === catalog) return catalog.translations;
  return { ...catalog.translations };
}
