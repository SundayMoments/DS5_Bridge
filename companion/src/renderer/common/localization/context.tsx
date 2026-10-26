import { createContext, useContext } from 'react';
import { DEFAULT_UI_LOCALE, SYSTEM_UI_LOCALE, UI_LOCALE_OPTIONS } from './catalogs';
import type { LocaleDirection, UiLocalePreference } from './types';

export interface LocalizationContextValue {
  readonly locale: string;
  readonly direction: LocaleDirection;
  readonly preference: UiLocalePreference;
  readonly options: Array<[string, UiLocalePreference]>;
  readonly translate: (source: string) => string;
  readonly setPreference: (preference: UiLocalePreference) => void;
}

const defaultValue: LocalizationContextValue = {
  locale: DEFAULT_UI_LOCALE,
  direction: 'ltr',
  preference: SYSTEM_UI_LOCALE,
  options: UI_LOCALE_OPTIONS,
  translate: (source) => source,
  setPreference: () => undefined
};

export const LocalizationContext = createContext<LocalizationContextValue>(defaultValue);

export function useLocalization(): LocalizationContextValue {
  return useContext(LocalizationContext);
}
