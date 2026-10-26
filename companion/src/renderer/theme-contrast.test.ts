/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UI_THEME_PRESETS } from '../shared/ui-theme';

const palettes = readFileSync(new URL('./styles/theme-palettes.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tokens = readFileSync(new URL('./styles/theme-tokens.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ds5 = readFileSync(new URL('./styles/theme-ds5.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function declarations(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map((match) => [match[1]!, match[2]!]));
}

function contrast(a: string, b: string): number {
  function luminance(hex: string) {
    const [r, g, bl] = hex.slice(1).match(/../g)!.map((value) => {
      const channel = parseInt(value, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  }
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

describe.each(UI_THEME_PRESETS)('%s theme readability', (theme) => {
  const start = palettes.indexOf(`.theme-option[data-theme-preview="${theme}"]`);
  const palette = declarations(palettes.slice(start, palettes.indexOf('}', start)));
  const shared = declarations(tokens.slice(tokens.indexOf(':root,\n.shell {'), tokens.indexOf('/* Text-only')));
  const defaultStates = declarations(tokens.slice(tokens.indexOf(':root,\n.shell {'), tokens.indexOf(':root:is(')));
  const states = ['light', 'bubble-gum'].includes(theme) ? shared : defaultStates;

  function check(foreground: string, background: string, minimum: number, label: string) {
    expect(foreground, `${label} foreground exists`).toBeTruthy();
    expect(background, `${label} background exists`).toBeTruthy();
    expect(contrast(foreground, background), label).toBeGreaterThanOrEqual(minimum);
  }

  it('defines every palette primitive', () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(Object.keys(palette).sort()).toEqual([
      'palette-accent', 'palette-accent-fill', 'palette-border', 'palette-canvas', 'palette-control',
      'palette-control-border', 'palette-hover', 'palette-muted', 'palette-on-accent', 'palette-raised',
      'palette-secondary', 'palette-sidebar', 'palette-surface', 'palette-text'
    ]);
  });

  it('keeps ordinary, secondary, muted, and accent copy readable on every content surface', () => {
    for (const surface of ['canvas', 'sidebar', 'surface', 'raised', 'control', 'hover']) {
      for (const text of ['text', 'secondary', 'muted']) {
        // Alternative themes need clear everyday labels, beyond the basic
        // threshold. Muted hover copy stays quieter; DS5 dark is a fixed reference.
        const minimum = theme === 'dark' || (text === 'muted' && surface === 'hover') ? 4.5 : 7;
        check(palette[`palette-${text}`]!, palette[`palette-${surface}`]!, minimum, `${text} on ${surface}`);
      }
      check(palette['palette-accent']!, palette[`palette-${surface}`]!, 4.5, `accent on ${surface}`);
    }
  });

  it('keeps primary actions and meaningful control boundaries distinct', () => {
    check(palette['palette-on-accent']!, palette['palette-accent-fill']!, 4.5, 'primary action text');
    if (theme === 'dark') {
      // The DS5 brand reference keeps its quiet translucent borders; do not
      // recolor it to satisfy the stricter alternative-palette targets.
      expect(palette['palette-control-border']).toBe('#2c3a4c');
      return;
    }
    for (const surface of ['canvas', 'surface', 'control']) {
      check(palette['palette-control-border']!, palette[`palette-${surface}`]!, 3, `control boundary on ${surface}`);
    }
  });

  it('preserves success, warning, error, and information text independently of the accent', () => {
    for (const state of ['success', 'warning', 'danger', 'info']) {
      for (const surface of ['canvas', 'surface', 'control']) {
        check(states[state]!, palette[`palette-${surface}`]!, 4.5, `${state} on ${surface}`);
      }
      check(states[`${state}-selected-text`]!, states[`${state}-selected`]!, 4.5, `${state} action`);
    }
  });
});

it('preserves the DS5 dark theme as the brand reference independently of the other palettes', () => {
  const reference = Object.fromEntries(
    [...ds5.slice(0, ds5.indexOf('}')).matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]])
  );
  expect(ds5).toContain(':root:not([data-theme]),\n:root[data-theme="dark"],\n.shell[data-theme="dark"] {');
  expect(reference).toMatchObject({
    'theme-color-scheme': 'dark',
    'app-bg-flat': '#070b12',
    'window-bar-bg-flat': '#050b13',
    'sidebar-bg': '#050b13',
    'bridge-mark-primary': '#ffffff',
    'bridge-mark-secondary': '#046fff',
    'text-primary': '#f7f9ff',
    'text-strong': '#ffffff',
    'text-secondary': '#c1cadd',
    'text-muted': '#9fb1c9',
    accent: '#287cff',
    'accent-strong': '#3d9bff',
    'accent-text': '#ffffff',
    'accent-selected': 'rgba(40, 124, 255, 0.82)',
    success: '#55d76c',
    warning: '#ffd36a',
    danger: '#ff7f93',
    info: '#c6d8f6',
    'shadow-menu': '0 24px 70px rgba(0, 0, 0, 0.52)'
  });
});
