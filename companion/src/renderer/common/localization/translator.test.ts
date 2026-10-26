// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import masterEnglish from './locales/master.en.json';
import latamSpanish from './locales/es-419.json';
import spainSpanish from './locales/es-ES.json';
import italian from './locales/it.json';
import french from './locales/fr.json';
import korean from './locales/ko.json';
import polish from './locales/pl.json';
import brazilianPortuguese from './locales/pt-BR.json';
import simplifiedChinese from './locales/zh-Hans.json';
import { createMessageTranslator, localizeDocument } from './translator';
import { loadedLocaleCatalog } from './catalogs';
import type { LocaleCatalog } from './types';

const catalog: LocaleCatalog = {
  meta: { locale: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr' },
  translations: {
    Input: 'Entrada',
    Settings: 'Ajustes',
    'Search settings': 'Buscar ajustes',
    speaker: 'altavoz',
    'Enable controller {{0}}': 'Activa {{0}}',
    '{{0}} actions': '{{0}} acciones'
  }
};

const COMPLETE_CATALOGS = [
  latamSpanish,
  spainSpanish,
  brazilianPortuguese,
  italian,
  french,
  polish,
  korean,
  simplifiedChinese
] as LocaleCatalog[];

describe('renderer localization', () => {
  it('uses an empty English identity catalog that returns every source unchanged', () => {
    const english = loadedLocaleCatalog('en')!;
    const entries = vi.spyOn(Object, 'entries');
    const observer = vi.spyOn(globalThis, 'MutationObserver');
    let stop: (() => void) | undefined;
    try {
      expect(english.meta).toEqual({ locale: 'en', name: 'English', nativeName: 'English', direction: 'ltr' });
      expect(english.translations).toEqual({});
      expect(Object.isFrozen(english.translations)).toBe(true);
      const translator = createMessageTranslator(english);
      for (const source of ['Settings', ' Settings \n', '12 actions', ' Uncatalogued user data \n']) {
        expect(translator.translate(source)).toBe(source);
      }
      stop = localizeDocument(document, english);
      expect(entries.mock.calls.filter(([value]) => value === english.translations)).toHaveLength(0);
      expect(observer).not.toHaveBeenCalled();
      expect(document.documentElement.lang).toBe('en');
    } finally {
      stop?.();
      entries.mockRestore();
      observer.mockRestore();
    }
  });

  it('defers compiling template patterns until the first non-exact translation', () => {
    const freshCatalog = { ...catalog, translations: { ...catalog.translations } };
    const patternCount = Object.keys(freshCatalog.translations)
      .filter((source) => /\{\{\d+\}\}/.test(source)).length;
    const NativeRegExp = globalThis.RegExp;
    const patterns = vi.spyOn(globalThis, 'RegExp').mockImplementation(function (pattern, flags) {
      return new NativeRegExp(pattern, flags);
    });
    try {
      const translator = createMessageTranslator(freshCatalog);
      expect(patterns).not.toHaveBeenCalled();
      expect(translator.translate(' Settings \n')).toBe('Ajustes');
      expect(translator.has('Search settings')).toBe(true);
      expect(patterns).not.toHaveBeenCalled();

      expect(translator.translate('12 actions')).toBe('12 acciones');
      expect(patterns).toHaveBeenCalledTimes(patternCount);
      expect(translator.translate('Uncatalogued user data')).toBe('Uncatalogued user data');
      expect(createMessageTranslator(freshCatalog)).toBe(translator);
      expect(patterns).toHaveBeenCalledTimes(patternCount);
    } finally {
      patterns.mockRestore();
    }
  });

  it('preserves template source ordering and catalog snapshots before first use', () => {
    const translations = {
      'XY{{0}}': 'Prefix {{0}}',
      '{{0}}YX': 'Suffix {{0}}'
    };
    const translator = createMessageTranslator({ ...catalog, translations });
    translations['XY{{0}}'] = 'Edited {{0}}';
    expect(translator.translate('XYYX')).toBe('Prefix YX');
    expect(translator.translate('ValueYX')).toBe('Suffix Value');
  });

  it('keeps template captures literal, including values that have their own entry', () => {
    const translator = createMessageTranslator(catalog);
    expect(translator.translate('12 actions')).toBe('12 acciones');
    expect(translator.translate('Enable controller speaker')).toBe('Activa speaker');
    expect(translator.translate('Settings actions')).toBe('Settings acciones');
    expect(translator.translate('Sunday Macro actions')).toBe('Sunday Macro acciones');
    expect(translator.translate('Uncatalogued user data')).toBe('Uncatalogued user data');
  });

  it.each(COMPLETE_CATALOGS.map((complete) => [complete.meta.locale, complete] as const))(
    'translates every cataloged message in %s',
    (_locale, complete) => {
      const translator = createMessageTranslator(complete);
      const keys = Object.keys(masterEnglish.translations);
      expect(Object.keys(complete.translations).sort()).toEqual([...keys].sort());
      expect(translator.translate('Reload app')).not.toBe('Reload app');
      expect(translator.translate('Use system language')).not.toBe('Use system language');
    }
  );

  it('localizes existing and newly inserted DOM text and accessibility attributes', async () => {
    document.documentElement.innerHTML = '<head><title>Settings</title></head><body><button aria-label="Search settings"> Settings </button><div data-l10n="off" aria-label="DS5 Bridge"><span>Input</span></div></body>';
    const stop = localizeDocument(document, catalog);
    expect(document.documentElement.lang).toBe('es');
    expect(document.title).toBe('Ajustes');
    expect(document.querySelector('button')?.textContent).toBe(' Ajustes ');
    expect(document.querySelector('button')?.getAttribute('aria-label')).toBe('Buscar ajustes');
    expect(document.querySelector('[data-l10n="off"]')?.textContent).toBe('Input');
    expect(document.querySelector('[data-l10n="off"]')?.getAttribute('aria-label')).toBe('DS5 Bridge');

    const status = document.createElement('span');
    status.textContent = '3 actions';
    document.body.append(status);
    await Promise.resolve();
    expect(status.textContent).toBe('3 acciones');

    stop();
    expect(document.title).toBe('Settings');
    expect(document.querySelector('button')?.getAttribute('aria-label')).toBe('Search settings');
  });

  it('keeps English DOM text intact without installing a mutation observer', () => {
    const observer = vi.spyOn(globalThis, 'MutationObserver');
    const originalLanguage = document.documentElement.lang;
    document.body.innerHTML = '<button aria-label="Settings">Settings</button>';
    const stop = localizeDocument(document, masterEnglish as LocaleCatalog);
    expect(document.documentElement.lang).toBe('en');
    expect(document.querySelector('button')?.textContent).toBe('Settings');
    expect(observer).not.toHaveBeenCalled();
    stop();
    expect(document.documentElement.lang).toBe(originalLanguage);
    observer.mockRestore();
  });

  it('still checks external English catalogs before deciding whether to observe the document', () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    document.body.innerHTML = '<button title="Settings">Settings</button>';
    let stop: (() => void) | undefined;
    try {
      stop = localizeDocument(document, {
        meta: masterEnglish.meta as LocaleCatalog['meta'],
        translations: { Settings: 'Preferences' }
      });
      expect(observe).toHaveBeenCalledOnce();
    } finally {
      stop?.();
      observe.mockRestore();
    }
  });

  it('tracks only translated DOM content and still localizes later application edits', async () => {
    document.documentElement.innerHTML = '<head></head><body><section><span id="unchanged" title="Uncatalogued user data">Uncatalogued user data</span><button aria-label="Search settings">Settings</button><div></div></section></body>';
    const unchanged = document.querySelector('#unchanged')!;
    const button = document.querySelector('button')!;
    createMessageTranslator(catalog);
    const writes = vi.spyOn(WeakMap.prototype, 'set');
    const stop = localizeDocument(document, catalog);
    try {
      const trackedNodes = writes.mock.calls.map(([node]) => node).filter((node) => node instanceof Node);
      expect(trackedNodes).toEqual([button, button.firstChild]);
      expect(unchanged.textContent).toBe('Uncatalogued user data');

      unchanged.firstChild!.textContent = 'Settings';
      unchanged.setAttribute('title', 'Search settings');
      await Promise.resolve();
      expect(unchanged.textContent).toBe('Ajustes');
      expect(unchanged.getAttribute('title')).toBe('Buscar ajustes');

      unchanged.firstChild!.textContent = 'Uncatalogued user data';
      unchanged.setAttribute('title', 'Uncatalogued user data');
      await Promise.resolve();
      expect(unchanged.textContent).toBe('Uncatalogued user data');
    } finally {
      stop();
      writes.mockRestore();
    }
  });

  it.each([true, false])('restores detached content for reuse across locales (removal delivered: %s)', async (deliverRemoval) => {
    document.body.innerHTML = '<section><button aria-label="Search settings">Settings</button></section>';
    const section = document.querySelector('section')!;
    const button = section.querySelector('button')!;
    const stop = localizeDocument(document, catalog);
    expect(button.textContent).toBe('Ajustes');
    expect(button.getAttribute('aria-label')).toBe('Buscar ajustes');

    section.remove();
    if (deliverRemoval) {
      await Promise.resolve();
      expect(button.textContent).toBe('Settings');
      expect(button.getAttribute('aria-label')).toBe('Search settings');
    }
    stop();
    expect(button.textContent).toBe('Settings');
    expect(button.getAttribute('aria-label')).toBe('Search settings');

    const stopFrench = localizeDocument(document, {
      meta: { locale: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr' },
      translations: { Settings: 'Réglages', 'Search settings': 'Rechercher les réglages' }
    });
    document.body.append(section);
    await Promise.resolve();
    expect(button.textContent).toBe('Réglages');
    expect(button.getAttribute('aria-label')).toBe('Rechercher les réglages');
    stopFrench();
    expect(button.textContent).toBe('Settings');
  });

  it('keeps moved nodes translated and leaves detached application edits intact', async () => {
    document.body.innerHTML = '<section><button title="Settings">Settings</button></section><aside></aside>';
    const button = document.querySelector('button')!;
    const stop = localizeDocument(document, catalog);
    document.querySelector('aside')!.append(button);
    await Promise.resolve();
    expect(button.textContent).toBe('Ajustes');
    expect(button.getAttribute('title')).toBe('Ajustes');

    button.remove();
    button.firstChild!.textContent = 'Input';
    button.setAttribute('title', 'New user title');
    await Promise.resolve();
    expect(button.textContent).toBe('Input');
    expect(button.getAttribute('title')).toBe('New user title');

    document.body.append(button);
    await Promise.resolve();
    expect(button.textContent).toBe('Entrada');
    expect(button.getAttribute('title')).toBe('New user title');
    stop();
    expect(button.textContent).toBe('Input');
    expect(button.getAttribute('title')).toBe('New user title');
  });
});
