import { uiScalePercentToZoomFactor, type UiScalePercent } from '../shared/types';

/** The renderer layout size in CSS pixels; the zoom factor scales the window around it. */
export const MAIN_WINDOW_BASE_WIDTH = 1120;
export const MAIN_WINDOW_BASE_HEIGHT = 630;

export interface MainWindowPresentation {
  width: number;
  height: number;
  zoomFactor: number;
}

export interface WorkAreaSize {
  width: number;
  height: number;
}

/**
 * Sizes the fixed main window for a UI scale, shrinking the zoom when the
 * preferred size would not fit the display's work area.
 */
export function fitMainWindowToWorkArea(
  uiScalePercent: UiScalePercent,
  workArea: WorkAreaSize | null | undefined
): MainWindowPresentation {
  const preferredZoomFactor = uiScalePercentToZoomFactor(uiScalePercent);
  if (!workArea || !isUsableDimension(workArea.width) || !isUsableDimension(workArea.height)) {
    return presentationAtZoom(preferredZoomFactor);
  }

  const availableWidth = Math.floor(workArea.width);
  const availableHeight = Math.floor(workArea.height);
  const zoomFactor = Math.min(
    preferredZoomFactor,
    availableWidth / MAIN_WINDOW_BASE_WIDTH,
    availableHeight / MAIN_WINDOW_BASE_HEIGHT
  );
  const presentation = presentationAtZoom(zoomFactor);
  return {
    width: Math.min(availableWidth, presentation.width),
    height: Math.min(availableHeight, presentation.height),
    zoomFactor
  };
}

function presentationAtZoom(zoomFactor: number): MainWindowPresentation {
  return {
    width: Math.max(1, Math.round(MAIN_WINDOW_BASE_WIDTH * zoomFactor)),
    height: Math.max(1, Math.round(MAIN_WINDOW_BASE_HEIGHT * zoomFactor)),
    zoomFactor
  };
}

function isUsableDimension(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
