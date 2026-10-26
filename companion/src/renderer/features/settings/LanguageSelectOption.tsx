import { IconAi } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { isAiTranslatedUiLocale } from '../../common/localization';

export function renderLanguageOption(label: string, locale: string): ReactNode {
  const aiTranslated = isAiTranslatedUiLocale(locale);
  return (
    <span
      className="settings-language-option"
      data-ai-translated={aiTranslated ? 'true' : undefined}
    >
      <span>{label}</span>
      {aiTranslated && (
        <IconAi aria-hidden="true" focusable="false" title="AI-translated" />
      )}
    </span>
  );
}

export function createLanguageOptionAriaLabel(aiTranslatedLabel: string) {
  return (label: string, locale: string): string => (
    isAiTranslatedUiLocale(locale) ? `${label}, ${aiTranslatedLabel}` : label
  );
}
