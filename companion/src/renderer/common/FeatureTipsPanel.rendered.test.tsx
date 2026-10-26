// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FeatureTipsPanel, type FeatureTipsPanelProps } from './FeatureTipsPanel';
import { ProfileSaveStatus } from './ProfileSaveStatus';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

function render(element: React.ReactElement) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(element));
  return host;
}

function tipTitles(props: FeatureTipsPanelProps) {
  const host = render(<FeatureTipsPanel {...props} />);
  const titles = [...host.querySelectorAll('.feature-help-copy strong')].map((title) => title.textContent);
  act(() => root?.unmount());
  root = null;
  return titles;
}

describe('FeatureTipsPanel', () => {
  it('chooses the tips for each page', () => {
    expect(tipTitles({ tab: 'deadzones' })).toEqual(['Tune Each Stick', 'Keep It Low']);
    expect(tipTitles({ tab: 'haptics' })).toEqual(['Feature Tiles', 'Unavailable', 'Green Icon', 'Tests']);
    expect(tipTitles({ tab: 'haptics', audioHapticsOpen: true }))
      .toEqual(['Feature Tiles', 'Unavailable', 'Audio Haptics', 'Mix / Replace']);
    expect(tipTitles({ tab: 'audio' })).toEqual(['Feature Tiles', 'Unavailable', 'Headphones', 'Tests']);
    expect(tipTitles({ tab: 'triggers', triggerLabOpen: true }))
      .toEqual(['Feature Tiles', 'Unavailable', 'Lab Override', 'Linked / Split']);
    expect(tipTitles({ tab: 'lighting' })).toEqual(['Feature Tiles', 'Unavailable', 'Green Icon', 'Custom Color']);
  });

  it('turns the example tiles on and off', () => {
    const host = render(<FeatureTipsPanel tab="triggers" triggerLabOpen />);
    const tile = host.querySelector<HTMLButtonElement>('[aria-label="Toggle feature tile example"]')!;
    act(() => tile.click());
    expect(tile.getAttribute('aria-pressed')).toBe('true');
    const link = host.querySelector<HTMLButtonElement>('[aria-label="Toggle Linked Split tip example"]')!;
    expect(link.getAttribute('aria-pressed')).toBe('true');
    act(() => link.click());
    expect(link.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the power-saving tip as a green tile that opens its setting', () => {
    const onSettingsFocusRequest = vi.fn();
    const host = render(<FeatureTipsPanel tab="haptics" onSettingsFocusRequest={onSettingsFocusRequest} />);
    const greenIcon = host.querySelector<HTMLButtonElement>('[aria-label="Open Controller Power Saving settings"]')!;
    expect(greenIcon.classList.contains('success')).toBe(true);
    act(() => greenIcon.click());
    expect(onSettingsFocusRequest).toHaveBeenCalledWith('controller-power-saving');
  });
});

describe('ProfileSaveStatus', () => {
  it('draws an outlined and filled check beside the autosave message', () => {
    const host = render(<ProfileSaveStatus />);
    expect(host.querySelector('.autosave-check-icon .autosave-check-outline')).not.toBeNull();
    expect(host.querySelector('.autosave-check-icon .autosave-check-fill')).not.toBeNull();
    expect(host.textContent).toBe('Changes Are Automatically Saved');
  });
});
