import { isSimplifiedChineseLocale } from './simplified-chinese-locale';

/** UI languages with a bundled catalog. English is the authored source. */
export const UI_LOCALE_IDS = ['en', 'es-419', 'es-ES', 'pt-BR', 'it', 'fr', 'pl', 'ko', 'zh-Hans'] as const;
export type UiLocaleId = typeof UI_LOCALE_IDS[number];

const LATIN_AMERICAN_SPANISH_REGIONS = new Set([
  '419', 'AR', 'BO', 'BR', 'BZ', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'GT', 'HN',
  'MX', 'NI', 'PA', 'PE', 'PR', 'PY', 'SV', 'US', 'UY', 'VE'
]);
const localeIds = new Map<string, UiLocaleId>(UI_LOCALE_IDS.map((locale) => [locale.toLowerCase(), locale]));

export function isUiLocaleId(value: unknown): value is UiLocaleId {
  return typeof value === 'string' && (UI_LOCALE_IDS as readonly string[]).includes(value);
}

function localeRegion(locale: string, maximize = false): string | null {
  try {
    const parsed = new Intl.Locale(locale);
    return (maximize ? parsed.maximize() : parsed).region?.toLocaleUpperCase() ?? null;
  } catch {
    return null;
  }
}

/** Maps a BCP 47 tag, such as a Windows display language, to a bundled UI language. */
export function matchingUiLocale(locale: string): UiLocaleId | null {
  const normalized = locale.trim().replaceAll('_', '-').toLocaleLowerCase();
  const exact = localeIds.get(normalized);
  if (exact) return exact;

  const language = normalized.split('-')[0] ?? '';
  if (language === 'zh') {
    return isSimplifiedChineseLocale(normalized) ? localeIds.get('zh-hans') ?? null : null;
  }
  if (language === 'es') {
    const spanishLocale = LATIN_AMERICAN_SPANISH_REGIONS.has(localeRegion(normalized) ?? '')
      ? 'es-419'
      : 'es-es';
    return localeIds.get(spanishLocale) ?? null;
  }
  if (language === 'pt') {
    const portugueseRegion = localeRegion(normalized) ?? localeRegion(normalized, true);
    return portugueseRegion === 'BR' ? localeIds.get('pt-br') ?? null : null;
  }
  return localeIds.get(language) ?? null;
}

/** Follows the Windows display language until the user picks a bundled language. */
export const SYSTEM_UI_LOCALE = 'system';
export type UiLocalePreference = typeof SYSTEM_UI_LOCALE | UiLocaleId;

/** Keeps a saved language only while it maps to a bundled catalog. */
export function normalizeUiLocalePreference(value: unknown): UiLocalePreference {
  if (value === SYSTEM_UI_LOCALE || typeof value !== 'string') return SYSTEM_UI_LOCALE;
  return matchingUiLocale(value) ?? SYSTEM_UI_LOCALE;
}