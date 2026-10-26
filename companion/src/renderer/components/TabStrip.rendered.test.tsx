// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TabStrip } from './TabStrip';

type Tab = 'audio' | 'haptics' | 'lighting';
const TABS = [
  { id: 'audio', label: 'Audio' },
  { id: 'haptics', label: 'Haptics' },
  { id: 'lighting', label: 'Lighting' }
] as const;

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

function Harness() {
  const [active, setActive] = useState<Tab>('audio');
  return <TabStrip<Tab> activeTab={active} tabs={TABS} ariaLabel="Studio sections" idPrefix="studio" onSelect={setActive} />;
}

function render() {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<Harness />));
  return host;
}

describe('TabStrip', () => {
  it('exposes one selected tab with roving tab index and panel references', () => {
    const host = render();
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(host.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe('Studio sections');
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs[1]?.getAttribute('aria-controls')).toBe('studio-panel-haptics');
  });

  it('moves selection and focus with arrow, Home, and End keys', () => {
    const host = render();
    const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    act(() => tabs()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(tabs()[2]?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs()[2]);
    act(() => tabs()[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
    expect(tabs()[0]?.classList.contains('active')).toBe(true);
    act(() => tabs()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(tabs()[2]?.classList.contains('active')).toBe(true);
  });
});
