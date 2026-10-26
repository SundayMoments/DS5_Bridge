// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ChordAssignment, ChordFunction } from '@shared/protocol';
import {
  buttonByText,
  chooseOption,
  click,
  fixtureSnapshot,
  installBridgeMock,
  installDomStubs,
  openPage,
  renderApp,
  unmountApp
} from '../../test-support/app-harness';

beforeAll(installDomStubs);
afterEach(unmountApp);

const taskManager: ChordFunction = { id: 'task-manager', name: 'Task Manager', type: 'keyboard', keys: ['Ctrl', 'Shift', 'Esc'] };
const playPause: ChordFunction = { id: 'play', name: 'Play', type: 'media', action: 'play-pause' };

function chordSettings(assignments: ChordAssignment[] = [], extra: Record<string, unknown> = {}) {
  return { chordFunctions: [taskManager, playPause], chordAssignments: assignments, ...extra };
}

function optionLabels(selectLabel: string): string[] {
  return [...document.querySelectorAll(`[role="listbox"][aria-label="${selectLabel}"] [role="option"]`)]
    .map((option) => option.getAttribute('aria-label') ?? '');
}

describe('Chords page', () => {
  it('creates a function and saves the chord configuration', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ settings: chordSettings() }));
    const host = await renderApp();
    const page = await openPage(host, 'chords');

    expect(page.querySelector('h2')?.textContent).toBe('Chords');
    await click(page.querySelector('[aria-label="New Function"]'));
    const [functions] = bridge.fn('setChordConfiguration').mock.lastCall as [ChordFunction[], ChordAssignment[]];
    expect(functions.map((func) => func.name)).toEqual(['Task Manager', 'Play', 'Function 3']);
  });

  it('adds a chord from a draft row once a button is chosen', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ settings: chordSettings() }));
    const host = await renderApp();
    const page = await openPage(host, 'chords');

    await click(buttonByText(page, /New Chord/));
    await chooseOption(page, 'Chord button', 'Options');
    const [, assignments] = bridge.fn('setChordConfiguration').mock.lastCall as [ChordFunction[], ChordAssignment[]];
    expect(assignments).toEqual([expect.objectContaining({ starter: 'ps', button: 'options', functionId: 'task-manager' })]);
  });

  it('offers the mute starter only while the mute button is a chord starter', async () => {
    installBridgeMock(fixtureSnapshot({ settings: chordSettings() }));
    let host = await renderApp();
    let page = await openPage(host, 'chords');
    expect(page.querySelector('.chords-assignment-card p')?.textContent).toBe('Pair PS, LFN, or RFN with a button.');
    await click(buttonByText(page, /New Chord/));
    await click(page.querySelector('button.custom-select-button[aria-label="Chord starter"]'));
    expect(optionLabels('Chord starter')).not.toContain('Mute Button');
    unmountApp();

    installBridgeMock(fixtureSnapshot({ settings: chordSettings([], { muteButtonMode: 'chord' }) }));
    host = await renderApp();
    page = await openPage(host, 'chords');
    expect(page.querySelector('.chords-assignment-card p')?.textContent).toBe('Pair PS, LFN, RFN, or Mute with a button.');
    await click(buttonByText(page, /New Chord/));
    await click(page.querySelector('button.custom-select-button[aria-label="Chord starter"]'));
    expect(optionLabels('Chord starter')).toContain('Mute Button');
    unmountApp();

    installBridgeMock(fixtureSnapshot({
      settings: chordSettings([], { muteButtonMode: 'keyboard', muteKeyboardChordStarterEnabled: true })
    }));
    host = await renderApp();
    page = await openPage(host, 'chords');
    expect(page.querySelector('.chords-assignment-card p')?.textContent).toBe('Pair PS, LFN, RFN, or Mute with a button.');
  });

  it('flags a mute chord that cannot fire and shadowed or duplicate chords', async () => {
    installBridgeMock(fixtureSnapshot({
      settings: chordSettings([
        { id: 'a', kind: 'chord', starter: 'mute', button: 'cross', functionId: 'play' },
        { id: 'b', kind: 'chord', starter: 'ps', button: 'triangle', functionId: 'play' }
      ], { sleepKeybindEnabled: true })
    }));
    const host = await renderApp();
    const page = await openPage(host, 'chords');
    const badge = page.querySelector('.chords-conflict-badge');
    expect(badge?.getAttribute('title')).toBe('Duplicate, inactive, or shortcut-shadowed chord bindings');
    expect(badge?.textContent).toBe('2xConflicts');
    expect(page.querySelector('.chords-assignment-row.mute-starter-inactive')).not.toBeNull();
  });

  it('keeps the Edge face buttons off LFN and RFN unless profile switching is blocked', async () => {
    installBridgeMock(fixtureSnapshot({ settings: chordSettings() }));
    let host = await renderApp();
    let page = await openPage(host, 'chords');
    await click(buttonByText(page, /New Chord/));
    await chooseOption(page, 'Chord starter', 'LFN');
    await click(page.querySelector('button.custom-select-button[aria-label="Chord button"]'));
    expect(optionLabels('Chord button')).not.toContain('Triangle');
    unmountApp();

    installBridgeMock(fixtureSnapshot({ settings: chordSettings([], { edgeProfileSwitchingBlocked: true }) }));
    host = await renderApp();
    page = await openPage(host, 'chords');
    await click(buttonByText(page, /New Chord/));
    await chooseOption(page, 'Chord starter', 'LFN');
    await click(page.querySelector('button.custom-select-button[aria-label="Chord button"]'));
    expect(optionLabels('Chord button')).toContain('Triangle');
  });

  it('renames a function through its dialog', async () => {
    const bridge = installBridgeMock(fixtureSnapshot({ settings: chordSettings() }));
    const host = await renderApp();
    const page = await openPage(host, 'chords');
    await click(page.querySelector('button.custom-select-button[aria-label="Chord function"]'));
    await click(document.querySelector('.chords-function-menu-actions button[title="Rename"]'));
    const dialog = host.querySelector('form[role="dialog"][aria-label="Chord function"]')!;
    const input = dialog.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Taskmgr');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });
    const [functions] = bridge.fn('setChordConfiguration').mock.lastCall as [ChordFunction[], ChordAssignment[]];
    expect(functions[0]?.name).toBe('Taskmgr');
  });
});
