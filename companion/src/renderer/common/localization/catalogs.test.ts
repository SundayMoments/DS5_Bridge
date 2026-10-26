/// <reference types="node" />

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import latamSpanish from './locales/es-419.json';
import spainSpanish from './locales/es-ES.json';
import italian from './locales/it.json';
import french from './locales/fr.json';
import korean from './locales/ko.json';
import masterEnglish from './locales/master.en.json';
import polish from './locales/pl.json';
import brazilianPortuguese from './locales/pt-BR.json';
import simplifiedChinese from './locales/zh-Hans.json';
import {
  AI_TRANSLATED_UI_LOCALES,
  DEFAULT_UI_LOCALE,
  SYSTEM_UI_LOCALE,
  UI_LOCALE_OPTIONS,
  isAiTranslatedUiLocale,
  loadedLocaleCatalog,
  loadLocaleCatalog,
  mergedTranslations,
  resolveActiveLocale,
  validLocalePreference
} from './catalogs';
import { createMessageTranslator } from './translator';
import type { LocaleCatalog } from './types';
import { UI_LOCALE_IDS, normalizeUiLocalePreference } from '../../../shared/ui-locale-matching';

const companionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const COMPLETE_CATALOGS: Array<[string, LocaleCatalog]> = [
  ['es-419', latamSpanish as LocaleCatalog],
  ['es-ES', spainSpanish as LocaleCatalog],
  ['pt-BR', brazilianPortuguese as LocaleCatalog],
  ['it', italian as LocaleCatalog],
  ['fr', french as LocaleCatalog],
  ['pl', polish as LocaleCatalog],
  ['ko', korean as LocaleCatalog],
  ['zh-Hans', simplifiedChinese as LocaleCatalog]
];

describe('localization catalogs', () => {
  it('keeps the generated master current and every shipped catalog complete', () => {
    const result = spawnSync(process.execPath, ['scripts/generate-localization-master.mjs', '--check'], {
      cwd: companionRoot,
      encoding: 'utf8'
    });
    expect(`${result.stdout}${result.stderr}`).toContain('Localization master is current');
    expect(result.status).toBe(0);
  });

  it('loads only requested translated dictionaries and shares concurrent requests', async () => {
    expect(loadedLocaleCatalog('en')?.meta.locale).toBe('en');
    expect(loadedLocaleCatalog('es-419')).toBeNull();
    expect(loadedLocaleCatalog('ko')).toBeNull();
    const first = loadLocaleCatalog('es-MX');
    expect(loadLocaleCatalog('ES_419')).toBe(first);
    const loaded = await first;
    expect(loaded).toEqual(latamSpanish);
    expect(loadedLocaleCatalog('es-419')).toBe(loaded);
    expect(await loadLocaleCatalog('es-419')).toBe(loaded);
    expect(loadedLocaleCatalog('ko')).toBeNull();
  });

  it.each(COMPLETE_CATALOGS)('loads the complete %s catalog behind its language option', async (locale, catalog) => {
    const loaded = await loadLocaleCatalog(locale);
    expect(loaded).toEqual(catalog);
    expect(mergedTranslations(loaded)).toBe(loaded.translations);
    // Complete catalogs cover every master source, so dropping the English merge loses nothing.
    expect(Object.keys(loaded.translations).sort()).toEqual(Object.keys(masterEnglish.translations).sort());
    expect(UI_LOCALE_OPTIONS).toContainEqual([catalog.meta.nativeName, locale]);
  });

  it('falls back to the English source for messages an external catalog omits', () => {
    const translations = { Settings: 'External settings', 'External {{0}}': 'Outside {{0}}' };
    const external = { meta: french.meta, translations } as LocaleCatalog;
    const merged = mergedTranslations(external);
    expect(merged).toEqual({ Settings: 'External settings', 'External {{0}}': 'Outside {{0}}' });
    translations.Settings = 'Edited external settings';
    expect(merged.Settings).toBe('External settings');
    const translator = createMessageTranslator(external);
    expect(translator.translate('Settings')).toBe('Edited external settings');
    expect(translator.translate('Uncatalogued label')).toBe('Uncatalogued label');
    expect(translator.translate('External 4')).toBe('Outside 4');
  });

  it('keeps English as an empty identity catalog and evicts the previous locale on switch', async () => {
    const english = loadedLocaleCatalog('en')!;
    expect(english.translations).toEqual({});
    expect(mergedTranslations(english)).toBe(english.translations);
    const italianCatalog = await loadLocaleCatalog('it');
    expect(loadedLocaleCatalog('it')).toBe(italianCatalog);
    const frenchCatalog = await loadLocaleCatalog('fr');
    expect(loadedLocaleCatalog('fr')).toBe(frenchCatalog);
    expect(loadedLocaleCatalog('it')).toBeNull();
    // A switch back to English needs no load and releases the French dictionary.
    expect(loadedLocaleCatalog('en')).toBe(english);
    expect(loadedLocaleCatalog('fr')).toBeNull();
    expect(await loadLocaleCatalog('fr')).toBe(frenchCatalog);
  });

  it('offers system selection and the canonical English catalog', () => {
    expect(UI_LOCALE_OPTIONS).toContainEqual(['Use system language', SYSTEM_UI_LOCALE]);
    expect(UI_LOCALE_OPTIONS).toContainEqual(['English', DEFAULT_UI_LOCALE]);
  });

  it('offers the same languages that companion settings accept', () => {
    const offered = UI_LOCALE_OPTIONS.map(([, locale]) => locale).filter((locale) => locale !== SYSTEM_UI_LOCALE);
    expect([...offered].sort()).toEqual([...UI_LOCALE_IDS].sort());
    for (const locale of offered) {
      expect(normalizeUiLocalePreference(locale)).toBe(locale);
    }
    expect(normalizeUiLocalePreference('missing')).toBe(SYSTEM_UI_LOCALE);
    expect(normalizeUiLocalePreference(42)).toBe(SYSTEM_UI_LOCALE);
  });

  it('falls back unsupported preferences and system locales to English', () => {
    expect(validLocalePreference('missing')).toBe(SYSTEM_UI_LOCALE);
    expect(validLocalePreference('EN-us')).toBe(DEFAULT_UI_LOCALE);
    expect(resolveActiveLocale(SYSTEM_UI_LOCALE, ['zz-ZZ']).locale)
      .toBe(DEFAULT_UI_LOCALE);
  });

  it('offers the platform-aligned AI-translated locales', () => {
    expect(UI_LOCALE_OPTIONS).toEqual(expect.arrayContaining([
      ['Español (Latinoamérica)', 'es-419'],
      ['Español (España)', 'es-ES'],
      ['Português (Brasil)', 'pt-BR'],
      ['Italiano', 'it'],
      ['Français', 'fr'],
      ['Polski', 'pl'],
      ['한국어', 'ko'],
      ['简体中文', 'zh-Hans']
    ]));
    expect(AI_TRANSLATED_UI_LOCALES).toEqual(['es-419', 'es-ES', 'pt-BR', 'it', 'fr', 'pl', 'ko', 'zh-Hans']);
    for (const locale of AI_TRANSLATED_UI_LOCALES) {
      expect(isAiTranslatedUiLocale(locale)).toBe(true);
    }
    expect(isAiTranslatedUiLocale(DEFAULT_UI_LOCALE)).toBe(false);
    expect(isAiTranslatedUiLocale(SYSTEM_UI_LOCALE)).toBe(false);
  });

  it('routes regional system locales without crossing dialects', () => {
    for (const locale of ['es-419', 'es-MX', 'es-AR', 'es-CL', 'es-US']) {
      expect(resolveActiveLocale(SYSTEM_UI_LOCALE, [locale]).locale).toBe('es-419');
    }
    for (const locale of ['es', 'es-ES', 'es-GQ']) {
      expect(resolveActiveLocale(SYSTEM_UI_LOCALE, [locale]).locale).toBe('es-ES');
    }
    expect(validLocalePreference('ES_mx')).toBe('es-419');
    expect(validLocalePreference('PT_br')).toBe('pt-BR');
    expect(resolveActiveLocale(SYSTEM_UI_LOCALE, ['pt']).locale).toBe('pt-BR');
    expect(resolveActiveLocale(SYSTEM_UI_LOCALE, ['it-IT']).locale).toBe('it');
    expect(resolveActiveLocale(SYSTEM_UI_LOCALE, ['fr-FR']).locale).toBe('fr');
    expect(resolveActiveLocale(SYSTEM_UI_LOCALE, ['pl-PL']).locale).toBe('pl');
    expect(resolveActiveLocale(SYSTEM_UI_LOCALE, ['ko-KR']).locale).toBe('ko');
    expect(validLocalePreference('KO_kr')).toBe('ko');
    expect(resolveActiveLocale(SYSTEM_UI_LOCALE, ['pt-PT']).locale).toBe(DEFAULT_UI_LOCALE);
  });

  it.each(COMPLETE_CATALOGS)('%s is complete, ordered, and non-empty', (locale, catalog) => {
    const masterKeys = Object.keys(masterEnglish.translations);
    expect(catalog.meta.locale).toBe(locale);
    expect(Object.keys(catalog.translations)).toEqual(masterKeys);
    expect(masterKeys.every((key) => catalog.translations[key]?.trim())).toBe(true);
  });

  it.each(COMPLETE_CATALOGS)('%s preserves every template token', (_locale, catalog) => {
    for (const [source, translation] of Object.entries(catalog.translations)) {
      const tokens = (value: string) => [...value.matchAll(/\{\{\d+\}\}/g)].map(([token]) => token).sort();
      expect(tokens(translation), source).toEqual(tokens(source));
    }
  });

  it('resolves Simplified Chinese aliases while respecting Traditional Chinese preferences', async () => {
    for (const locale of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-CN', 'zh-Hans-TW', ' ZH_cn ']) {
      expect(validLocalePreference(locale)).toBe('zh-Hans');
      expect(resolveActiveLocale(SYSTEM_UI_LOCALE, [locale]).locale).toBe('zh-Hans');
      expect(await loadLocaleCatalog(locale)).toEqual(simplifiedChinese);
    }
    for (const locale of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-CN', 'zh-Invalid!']) {
      expect(validLocalePreference(locale)).toBe(SYSTEM_UI_LOCALE);
      expect(resolveActiveLocale(SYSTEM_UI_LOCALE, [locale]).locale).toBe(DEFAULT_UI_LOCALE);
    }
    expect(resolveActiveLocale(SYSTEM_UI_LOCALE, ['zh-Hant', 'zh-SG']).locale).toBe('zh-Hans');
    expect(resolveActiveLocale('zh-Hans', ['en-US']).locale).toBe('zh-Hans');
  });
});
