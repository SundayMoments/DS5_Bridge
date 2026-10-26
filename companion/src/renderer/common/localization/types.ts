export type LocaleDirection = 'ltr' | 'rtl';
export type UiLocalePreference = string;

export interface LocaleCatalog {
  readonly meta: {
    readonly locale: string;
    readonly name: string;
    readonly nativeName: string;
    readonly direction: LocaleDirection;
  };
  readonly translations: Readonly<Record<string, string>>;
}

export interface ActiveLocale {
  readonly locale: string;
  readonly preference: UiLocalePreference;
}
