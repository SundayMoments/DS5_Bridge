/// <reference types="node" />

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RENDERER_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT_PATTERN = /^@import\s+'([^']+)';\s*$/gm;

export interface StyleModule {
  /** Path relative to `src/renderer`, with forward slashes. */
  readonly path: string;
  readonly source: string;
}

function expandModules(file: string, seen: Set<string>): StyleModule[] {
  const absolute = path.resolve(RENDERER_DIRECTORY, file);
  if (seen.has(absolute)) return [];
  seen.add(absolute);
  const source = readFileSync(absolute, 'utf8');
  const modules: StyleModule[] = [];
  let ownSource = source;
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const imported = path.relative(RENDERER_DIRECTORY, path.resolve(path.dirname(absolute), match[1] ?? ''));
    modules.push(...expandModules(imported, seen));
    ownSource = ownSource.replace(match[0], '');
  }
  if (ownSource.trim()) {
    modules.push({ path: path.relative(RENDERER_DIRECTORY, absolute).replaceAll('\\', '/'), source: ownSource });
  }
  return modules;
}

/** Every stylesheet reachable from an entry, in cascade order. */
export function rendererStyleModules(entry = 'styles.css'): StyleModule[] {
  return expandModules(entry, new Set());
}

/** The stylesheet cascade as one source, as the browser applies it. */
export function rendererStyles(entry = 'styles.css'): string {
  return rendererStyleModules(entry).map((module) => module.source).join('\n');
}

/** A single stylesheet module by its path relative to `src/renderer`. */
export function rendererStyleModule(modulePath: string): string {
  return readFileSync(path.resolve(RENDERER_DIRECTORY, modulePath), 'utf8');
}

/** Finds the first CSS block for a selector, optionally the first containing some text. */
export function cssBlockIn(styles: string, selector: string, requiredText?: string): string {
  const normalizedRequiredText = requiredText?.replace(/\s+/g, ' ').trim();
  let searchFrom = 0;
  while (searchFrom < styles.length) {
    const selectorIndex = styles.indexOf(selector, searchFrom);
    if (selectorIndex === -1) break;
    const blockStart = styles.indexOf('{', selectorIndex);
    const blockEnd = styles.indexOf('}', blockStart);
    if (blockStart === -1 || blockEnd === -1) break;
    const block = styles.slice(blockStart + 1, blockEnd);
    const normalizedBlock = block.replace(/\s+/g, ' ').trim();
    if (!normalizedRequiredText || normalizedBlock.includes(normalizedRequiredText)) {
      return block;
    }
    searchFrom = blockEnd + 1;
  }
  throw new Error(requiredText
    ? `Missing CSS block for ${selector} containing ${requiredText}`
    : `Missing CSS block for ${selector}`);
}
