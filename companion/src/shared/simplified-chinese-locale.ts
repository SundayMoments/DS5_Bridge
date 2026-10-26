/** Respect an explicit script before inferring it from a region or bare `zh`. */
export function isSimplifiedChineseLocale(locale: string): boolean {
  try {
    const parsed = new Intl.Locale(locale.trim().replaceAll('_', '-'));
    return parsed.language === 'zh' && parsed.maximize().script === 'Hans';
  } catch {
    return false;
  }
}
