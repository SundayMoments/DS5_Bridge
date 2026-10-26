/** Ticks under a 0–100% slider, every 10%. */
export const PERCENT_SLIDER_TICKS = Array.from({ length: 11 }, (_, index) => index * 10);

/** Marks the ends and midpoint of a slider's tick row. */
export function sliderTickClass(value: number, max: number): string | undefined {
  if (value === 0 || value === max) {
    return 'milestone endpoint';
  }
  if (value === max / 2) {
    return 'milestone';
  }
  return undefined;
}
