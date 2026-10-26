import { describe, expect, it } from 'vitest';
import {
  MAIN_WINDOW_BASE_HEIGHT,
  MAIN_WINDOW_BASE_WIDTH,
  fitMainWindowToWorkArea
} from './main-window-sizing';

describe('main window sizing', () => {
  it('renders the base layout at a 1.25 zoom for the default scale', () => {
    expect(fitMainWindowToWorkArea(100, { width: 3840, height: 2160 })).toEqual({
      width: 1400,
      height: 788,
      zoomFactor: 1.25
    });
  });

  it('keeps the legacy 100% window size at the 80% option', () => {
    expect(fitMainWindowToWorkArea(80, { width: 3840, height: 2160 })).toEqual({
      width: MAIN_WINDOW_BASE_WIDTH,
      height: MAIN_WINDOW_BASE_HEIGHT,
      zoomFactor: 1
    });
  });

  it('shrinks the zoom so the window fits a small work area', () => {
    const fitted = fitMainWindowToWorkArea(120, { width: 1366, height: 728 });
    expect(fitted.zoomFactor).toBeCloseTo(728 / MAIN_WINDOW_BASE_HEIGHT, 5);
    expect(fitted.width).toBeLessThanOrEqual(1366);
    expect(fitted.height).toBeLessThanOrEqual(728);
  });

  it('falls back to the preferred zoom without a usable work area', () => {
    expect(fitMainWindowToWorkArea(60, null).zoomFactor).toBeCloseTo(0.75, 5);
    expect(fitMainWindowToWorkArea(60, { width: 0, height: Number.NaN }).zoomFactor).toBeCloseTo(0.75, 5);
  });
});
