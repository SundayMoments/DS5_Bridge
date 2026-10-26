import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const companionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererRoot = path.join(companionRoot, 'src', 'renderer');
const localesRoot = path.join(rendererRoot, 'common', 'localization', 'locales');
const masterPath = path.join(localesRoot, 'master.en.json');
const checkOnly = process.argv.includes('--check');

/**
 * Renderer modules whose copy is cataloged. Legacy 1.x page code in App.tsx is
 * outside these roots until it moves into a feature module; moving it in makes
 * its copy part of the master, and `localize:check` then lists every message
 * the complete catalogs still need.
 */
const LOCALIZED_SOURCE_ROOTS = ['components', 'common', 'composition', 'features'];
// Individual renderer modules outside those roots whose copy is already cataloged.
const LOCALIZED_SOURCE_FILES = ['ui-themes.ts'];
const excludedDirectories = new Set(['common/localization']);

const completeCatalogs = new Map([
  ['es-419.json', 'es-419'],
  ['es-ES.json', 'es-ES'],
  ['pt-BR.json', 'pt-BR'],
  ['it.json', 'it'],
  ['fr.json', 'fr'],
  ['pl.json', 'pl'],
  ['ko.json', 'ko'],
  ['zh-Hans.json', 'zh-Hans']
]);
// Brand, product, and hardware names that stay in English in every catalog.
const allowedSourceIdenticalPhrases = [
  /^DS5 Bridge$/,
  /^Kitsune Input$/,
  /^(?:DualSense|DualSense Edge|DualShock 4|Pico LED|Pico 2 W|Ko-fi|GitHub|Discord)$/,
  /^(?:Bubble Gum|Kiwi|Pomegranate)$/,
  // USB vendor and product IDs are written the same way in every language.
  /^VID \/ PID$/,
  // Keyboard keys keep the legends printed on them.
  /^(?:Caps Lock|Num Lock|Page Down|Page Up|Print Screen|Scroll Lock)$/,
  /^\{\{0\}\}%$/
];

const visibleProperties = new Set([
  'alt', 'aria-description', 'aria-label', 'ariaDescription', 'ariaLabel', 'caption',
  'description', 'detail', 'emptyLabel', 'emptyMessage', 'error', 'heading', 'helpText', 'hint',
  'keywords', 'label', 'message', 'name', 'placeholder', 'statusText', 'subheading', 'summary',
  'subtitle', 'text', 'title', 'tooltip', 'unavailableReason', 'warning'
]);
const visibleVariable = /(caption|copy|description|empty|error|heading|hint|label|message|name|placeholder|status|summary|text|title|tooltip|warning)/i;
const visiblePropertySuffix = /(caption|copy|description|empty|error|heading|hint|label|message|placeholder|status|summary|text|title|tooltip|warning)$/i;
const visibleReturnFunction = /(battery|copy|description|detail|display|error|format|heading|label|message|name|notice|phase|presentation|status|summary|text|title)/i;
const ignoredReturnValues = new Set([
  'accent', 'applying', 'attention', 'closed', 'danger', 'good', 'bad', 'warn', 'info', 'healthy',
  'in', 'low', 'numeric', 'object', 'resize', 'short', 'string', 'transitionend', 'unknown',
  'visibilitychange', 'waiting'
]);
const visibleCall = /^(alert|confirm|notify|showToast|set\w*(Error|Message|Status|Text|Title))$/;
// Messages composed at runtime that the extractor cannot see in source.
const seededMessages = [
  'AI-translated',
  'Use system language'
];

function normalize(value) {
  return value
    .replace(/&apos;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeUiText(value) {
  const text = normalize(value);
  if (!text || text.length > 600 || !/[A-Za-z]/.test(text)) return false;
  if (/^(https?:|mailto:|data:|file:|\.\.?[/\\]|[/\\]|--)/i.test(text)) return false;
  if (/^#[0-9a-f]{3,8}$/i.test(text) || /^\[[^\]]+\]$/.test(text)) return false;
  if (/^[#.a-z0-9_:/@%{}[\]="'-]+$/i.test(text) && /[-_#.[\]{}]/.test(text)) return false;
  return true;
}

function templateText(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return normalize(node.text);
  if (!ts.isTemplateExpression(node)) return null;
  let value = node.head.text;
  node.templateSpans.forEach((span, index) => {
    value += `{{${index}}}${span.literal.text}`;
  });
  return normalize(value);
}

function literalText(node) {
  if (ts.isStringLiteralLike(node)) return normalize(node.text);
  return templateText(node);
}

function addLiteral(messages, node) {
  const value = literalText(node);
  if (value && looksLikeUiText(value)) messages.add(value);
}

function isVisibleProperty(name) {
  return visibleProperties.has(name) || visiblePropertySuffix.test(name);
}

/** `tab === 'settings'` compares an identifier; it is not copy. */
function isComparisonOperand(node) {
  const parent = node.parent;
  return Boolean(parent && ts.isBinaryExpression(parent) && [
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken
  ].includes(parent.operatorToken.kind));
}

/** Class lists are not copy even though `className` ends in "name". */
function isClassNameVariable(name) {
  return /classname$/i.test(name);
}

function addExpressionLiterals(messages, node, predicate = () => true) {
  function visit(current) {
    if (ts.isJsxAttribute(current)) {
      const name = current.name.getText();
      if (isVisibleProperty(name) && current.initializer) {
        if (ts.isStringLiteralLike(current.initializer)) addLiteral(messages, current.initializer);
        else if (ts.isJsxExpression(current.initializer) && current.initializer.expression) {
          visit(current.initializer.expression);
        }
      }
      return;
    }
    if (ts.isStringLiteralLike(current) || ts.isTemplateExpression(current)) {
      const value = literalText(current);
      if (value && predicate(value) && !isComparisonOperand(current)) addLiteral(messages, current);
      if (ts.isTemplateExpression(current)) {
        current.templateSpans.forEach((span) => visit(span.expression));
      }
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return '';
}

function enclosingFunctionName(node) {
  let current = node.parent;
  while (current) {
    if ((ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)
      || ts.isGetAccessorDeclaration(current)) && current.name) {
      return propertyName(current.name);
    }
    if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) && current.parent) {
      if (ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)) {
        return current.parent.name.text;
      }
      if (ts.isPropertyAssignment(current.parent)) return propertyName(current.parent.name);
    }
    current = current.parent;
  }
  return '';
}

function isInsideLiteralSubtree(node) {
  // `data-l10n="off"` marks text that must stay literal, such as brand wordmarks.
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxElement(current)) {
      const attributes = current.openingElement.attributes.properties;
      if (attributes.some((attribute) => ts.isJsxAttribute(attribute)
        && attribute.name.getText() === 'data-l10n'
        && attribute.initializer
        && ts.isStringLiteralLike(attribute.initializer)
        && attribute.initializer.text === 'off')) {
        return true;
      }
    }
  }
  return false;
}

function collectSourceFile(filePath, messages) {
  const source = readFileSync(filePath, 'utf8');
  const kind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, kind);

  function visit(node) {
    if (ts.isJsxText(node)) {
      const value = normalize(node.text);
      if (looksLikeUiText(value) && !isInsideLiteralSubtree(node)) messages.add(value);
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(file);
      if (isVisibleProperty(name) && node.initializer) {
        if (ts.isStringLiteralLike(node.initializer)) addLiteral(messages, node.initializer);
        else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          addExpressionLiterals(messages, node.initializer.expression);
        }
      }
    } else if (ts.isJsxExpression(node) && node.parent && (
      ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)
    ) && node.expression && !isInsideLiteralSubtree(node)) {
      addExpressionLiterals(messages, node.expression);
    } else if (ts.isPropertyAssignment(node) && isVisibleProperty(propertyName(node.name))) {
      addExpressionLiterals(messages, node.initializer);
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && visibleVariable.test(node.name.text) && !isClassNameVariable(node.name.text) && node.initializer) {
      addExpressionLiterals(messages, node.initializer);
    } else if (ts.isReturnStatement(node) && node.expression
      && visibleReturnFunction.test(enclosingFunctionName(node))) {
      addExpressionLiterals(messages, node.expression, (value) => !ignoredReturnValues.has(value));
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && visibleCall.test(node.expression.text)) {
      node.arguments.forEach((argument) => addExpressionLiterals(messages, argument));
    } else if ((ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node))
      && ts.isVariableDeclaration(node.parent)
      && ts.isIdentifier(node.parent.name)
      && /(_OPTIONS|_TABS|_SECTIONS|_ACTIONS|_CHOICES|_LABELS|_CATEGORIES)$/.test(node.parent.name.text)) {
      addExpressionLiterals(messages, node);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
}

function sourceFiles(directory) {
  const files = [];
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory)) {
    const absolute = path.join(directory, entry);
    const relative = path.relative(rendererRoot, absolute).replace(/\\/g, '/');
    if (statSync(absolute).isDirectory()) {
      if (excludedDirectories.has(relative)) continue;
      files.push(...sourceFiles(absolute));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec|stories)\.(ts|tsx)$/.test(entry)) {
      files.push(absolute);
    }
  }
  return files;
}

function masterCatalog() {
  const messages = new Set(seededMessages);
  LOCALIZED_SOURCE_ROOTS
    .flatMap((root) => sourceFiles(path.join(rendererRoot, root)))
    .concat(LOCALIZED_SOURCE_FILES.map((file) => path.join(rendererRoot, file)))
    .sort()
    .forEach((file) => collectSourceFile(file, messages));
  const translations = Object.fromEntries(
    [...messages].sort((left, right) => left.localeCompare(right, 'en')).map((message) => [message, message])
  );
  return {
    $schema: '../../../../../localization-catalog.schema.json',
    meta: { locale: 'en', name: 'English', nativeName: 'English', direction: 'ltr' },
    translations
  };
}

function validateLocaleFiles(master) {
  const known = new Set(Object.keys(master.translations));
  const problems = [];
  if (checkOnly) {
    for (const fileName of completeCatalogs.keys()) {
      if (!existsSync(path.join(localesRoot, fileName))) {
        problems.push(`Required complete catalog is missing: ${fileName}`);
      }
    }
  }
  for (const fileName of readdirSync(localesRoot).filter((name) => name.endsWith('.json') && name !== 'master.en.json')) {
    const catalog = JSON.parse(readFileSync(path.join(localesRoot, fileName), 'utf8'));
    if (typeof catalog.meta?.locale !== 'string'
      || typeof catalog.meta?.name !== 'string'
      || typeof catalog.meta?.nativeName !== 'string'
      || !['ltr', 'rtl'].includes(catalog.meta?.direction)
      || !catalog.translations
      || typeof catalog.translations !== 'object'
      || Array.isArray(catalog.translations)) {
      problems.push(`${fileName} is missing required catalog metadata or translations.`);
      continue;
    }
    const requiredLocale = completeCatalogs.get(fileName);
    if (requiredLocale && catalog.meta.locale !== requiredLocale) {
      problems.push(`${fileName} must declare canonical locale ${requiredLocale}.`);
    }
    for (const key of Object.keys(catalog.translations)) {
      if (!known.has(key)) {
        problems.push(`${fileName} contains an unknown master key: ${key}`);
        continue;
      }
      if (typeof catalog.translations[key] !== 'string') {
        problems.push(`${fileName} has a non-string translation for: ${key}`);
        continue;
      }
      if (checkOnly && requiredLocale && !catalog.translations[key].trim()) {
        problems.push(`${fileName} has an empty translation for: ${key}`);
      }
      const sourceTokens = [...key.matchAll(/\{\{\d+\}\}/g)].map(([token]) => token).sort();
      const translationTokens = [...catalog.translations[key].matchAll(/\{\{\d+\}\}/g)]
        .map(([token]) => token).sort();
      if (sourceTokens.join('|') !== translationTokens.join('|')) {
        problems.push(`${fileName} must preserve template tokens for: ${key}`);
      }
    }
    if (checkOnly && requiredLocale) {
      const missing = [...known].filter((key) => !(key in catalog.translations));
      if (missing.length > 0) {
        problems.push(`${fileName} is missing ${missing.length} master key(s): ${missing.join(' | ')}`);
      }
      const sourceIdentical = [...known]
        .filter((key) => catalog.translations[key] === master.translations[key]);
      const unexpectedSourceIdenticalPhrases = sourceIdentical.filter((key) => (
        /[A-Za-z].*\s+[A-Za-z]/.test(key)
        && !/\s\+\s/.test(key)
        && !allowedSourceIdenticalPhrases.some((pattern) => pattern.test(key))
      ));
      if (unexpectedSourceIdenticalPhrases.length > 0) {
        problems.push(`${fileName} contains untranslated multi-word UI text: ${unexpectedSourceIdenticalPhrases.join(' | ')}`);
      }
      if (known.size > 0 && sourceIdentical.length / known.size > 0.2) {
        problems.push(`${fileName} leaves ${sourceIdentical.length}/${known.size} messages identical to English.`);
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(problems.join('\n'));
  }
}

const output = `${JSON.stringify(masterCatalog(), null, 2)}\n`;
const parsedMaster = JSON.parse(output);

if (checkOnly) {
  validateLocaleFiles(parsedMaster);
  if (!existsSync(masterPath) || readFileSync(masterPath, 'utf8').replace(/\r\n/g, '\n') !== output) {
    console.error('Localization master is stale. Run npm run localize:extract.');
    process.exitCode = 1;
  } else {
    console.log(`Localization master is current (${Object.keys(parsedMaster.translations).length} messages).`);
  }
} else {
  writeFileSync(masterPath, output, 'utf8');
  console.log(`Wrote ${path.relative(companionRoot, masterPath)} (${Object.keys(parsedMaster.translations).length} messages).`);
  validateLocaleFiles(parsedMaster);
}
