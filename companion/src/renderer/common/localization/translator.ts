import type { LocaleCatalog } from './types';
import { isBundledEnglishCatalog, mergedTranslations, onLocaleCatalogEvicted } from './catalogs';

const LOCALIZED_ATTRIBUTES = ['alt', 'aria-description', 'aria-label', 'placeholder', 'title'] as const;

/**
 * Template captures are kept verbatim unless a template lists the values whose
 * own catalog entries should be translated inside it, such as a localized
 * status word. Uncatalogued captures such as user names always stay literal.
 */
const CONTROLLED_TEMPLATE_CAPTURES: Readonly<Record<string, Readonly<Record<number, ReadonlySet<string>>>>> = {};

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function templatePattern(source: string): RegExp {
  const parts = source.split(/\{\{\d+\}\}/g).map(escapePattern);
  return new RegExp(`^${parts.join('(.*?)')}$`, 'u');
}

export interface MessageTranslator {
  readonly translate: (source: string) => string;
  readonly has: (source: string) => boolean;
}

const translatorCache = new WeakMap<LocaleCatalog, MessageTranslator>();
// The dynamically imported JSON module keeps an evicted dictionary reachable, so
// drop its compiled templates explicitly; a later switch back rebuilds them.
onLocaleCatalogEvicted((catalog) => { translatorCache.delete(catalog); });

export function createMessageTranslator(catalog: LocaleCatalog): MessageTranslator {
  const cached = translatorCache.get(catalog);
  if (cached) return cached;
  const messages = mergedTranslations(catalog);
  let templates: Array<{ source: string; pattern: RegExp; literalLength: number }> | undefined;
  function compiledTemplates() {
    // Exact labels need only a dictionary lookup. Defer scanning the entire
    // catalog along with pattern compilation until a template may be needed.
    return templates ??= Object.keys(messages).filter((source) => /\{\{\d+\}\}/.test(source)).map((source) => ({
      source,
      pattern: templatePattern(source),
      literalLength: source.replace(/\{\{\d+\}\}/g, '').length
    })).sort((left, right) => right.literalLength - left.literalLength);
  }

  function translate(source: string): string {
    const normalized = normalize(source);
    const exact = messages[normalized];
    if (exact !== undefined) return exact;
    for (const template of compiledTemplates()) {
      const match = template.pattern.exec(normalized);
      if (!match) continue;
      return messages[template.source].replace(/\{\{(\d+)\}\}/g, (_token, index: string) => {
        const captureIndex = Number.parseInt(index, 10);
        const capture = match[captureIndex + 1] ?? '';
        const normalizedCapture = normalize(capture);
        const allowedValues = CONTROLLED_TEMPLATE_CAPTURES[template.source]?.[captureIndex];
        return allowedValues?.has(normalizedCapture)
          ? messages[normalizedCapture] ?? capture
          : capture;
      });
    }
    return source;
  }

  const translator = {
    translate,
    has: (source: string) => messages[normalize(source)] !== undefined
      || compiledTemplates().some(({ pattern }) => pattern.test(normalize(source)))
  };
  translatorCache.set(catalog, translator);
  return translator;
}

interface TranslationRecord {
  readonly source: string;
  readonly output: string;
}

export function localizeDocument(document: Document, catalog: LocaleCatalog): () => void {
  const originalLanguage = document.documentElement.lang;
  const originalDirection = document.documentElement.dir;
  document.documentElement.lang = catalog.meta.locale;
  document.documentElement.dir = catalog.meta.direction;
  if (catalog.meta.locale === 'en'
    && (isBundledEnglishCatalog(catalog)
      || Object.entries(catalog.translations).every(([source, translation]) => source === translation))) {
    // English UI text is already authored in the document. Avoid walking and
    // observing every subsequent React mutation when there is nothing to change.
    return () => {
      document.documentElement.lang = originalLanguage;
      document.documentElement.dir = originalDirection;
    };
  }
  const translator = createMessageTranslator(catalog);
  const textRecords = new WeakMap<Text, TranslationRecord>();
  const attributeRecords = new WeakMap<Element, Map<string, TranslationRecord>>();

  function excluded(node: Node): boolean {
    const parent = node instanceof Element ? node : node.parentElement;
    return Boolean(parent?.closest('script, style, code, pre, kbd, samp, [data-l10n="off"]'));
  }

  function translateText(node: Text): void {
    if (excluded(node) || !normalize(node.data)) return;
    const previous = textRecords.get(node);
    const source = previous && node.data === previous.output ? previous.source : node.data;
    const leading = source.match(/^\s*/)?.[0] ?? '';
    const trailing = source.match(/\s*$/)?.[0] ?? '';
    const translated = translator.translate(source);
    const output = translated === source ? source : `${leading}${translated}${trailing}`;
    if (output === source) textRecords.delete(node);
    else if (previous?.source !== source || previous.output !== output) textRecords.set(node, { source, output });
    if (node.data !== output) node.data = output;
  }

  function translateAttributes(element: Element): void {
    if (excluded(element)) return;
    let records = attributeRecords.get(element);
    for (const attribute of LOCALIZED_ATTRIBUTES) {
      const current = element.getAttribute(attribute);
      if (current === null) continue;
      const previous = records?.get(attribute);
      const source = previous && current === previous.output ? previous.source : current;
      const output = translator.translate(source);
      if (output === source) records?.delete(attribute);
      else if (previous?.source !== source || previous.output !== output) {
        records ??= new Map<string, TranslationRecord>();
        records.set(attribute, { source, output });
      }
      if (current !== output) element.setAttribute(attribute, output);
    }
    if (records?.size) attributeRecords.set(element, records);
    else attributeRecords.delete(element);
  }

  function translateTree(root: Node): void {
    if (root instanceof Text) {
      translateText(root);
      return;
    }
    if (root instanceof Element) translateAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      if (current instanceof Text) translateText(current);
      else if (current instanceof Element) translateAttributes(current);
      current = walker.nextNode();
    }
  }

  function restoreNode(node: Node): void {
    if (node instanceof Text) {
      const record = textRecords.get(node);
      if (record && node.data === record.output) node.data = record.source;
    } else if (node instanceof Element) {
      for (const [attribute, record] of attributeRecords.get(node) ?? []) {
        if (node.getAttribute(attribute) === record.output) {
          node.setAttribute(attribute, record.source);
        }
      }
    }
  }

  function restoreTree(root: Node): void {
    restoreNode(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      restoreNode(current);
      current = walker.nextNode();
    }
  }

  const belongsToDocument = (node: Node) => document.documentElement.contains(node);

  translateTree(document.documentElement);

  const observer = new MutationObserver((mutations) => {
    // Removed dialogs and list rows must not remain owned by the translator.
    // Restore detached trees so they can also be reused after a locale switch.
    // Nodes moved within this document remain translated throughout the move.
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (!belongsToDocument(node)) restoreTree(node);
      }
    }
    for (const mutation of mutations) {
      if (!belongsToDocument(mutation.target)) continue;
      if (mutation.type === 'characterData') translateText(mutation.target as Text);
      else if (mutation.type === 'attributes') translateAttributes(mutation.target as Element);
      else mutation.addedNodes.forEach((node) => {
        if (belongsToDocument(node)) translateTree(node);
      });
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [...LOCALIZED_ATTRIBUTES],
    characterData: true,
    childList: true,
    subtree: true
  });
  return () => {
    const pendingMutations = observer.takeRecords();
    observer.disconnect();
    // A locale can change before the observer delivers a removal.
    for (const mutation of pendingMutations) {
      for (const node of mutation.removedNodes) {
        if (!belongsToDocument(node)) restoreTree(node);
      }
    }
    restoreTree(document.documentElement);
    document.documentElement.lang = originalLanguage;
    document.documentElement.dir = originalDirection;
  };
}
