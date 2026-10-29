import { describe, expect, it } from 'vitest';
import { TRAY_BATTERY_ICON_SIZE, createTrayBatteryIconBuffer } from './tray-icon-bitmap';

function pixel(buffer: Buffer, x: number, y: number): number[] {
  const offset = ((y * TRAY_BATTERY_ICON_SIZE) + x) * 4;
  return [...buffer.subarray(offset, offset + 4)];
}

function inkBounds(buffer: Buffer): { left: number; top: number; right: number; bottom: number } {
  let left = TRAY_BATTERY_ICON_SIZE;
  let top = TRAY_BATTERY_ICON_SIZE;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < TRAY_BATTERY_ICON_SIZE; y += 1) {
    for (let x = 0; x < TRAY_BATTERY_ICON_SIZE; x += 1) {
      if (pixel(buffer, x, y)[3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return { left, top, right, bottom };
}

describe('tray battery icon bitmap', () => {
  it('uses the full digital numeral height for 100 percent', () => {
    const buffer = createTrayBatteryIconBuffer(100, false);
    expect(pixel(buffer, 13, 2)[3]).toBeGreaterThan(0);
    expect(pixel(buffer, 13, 29)[3]).toBeGreaterThan(0);
  });

  it('fills the bitmap without clipping the shadow for one, two and three digits', () => {
    for (const percent of [8, 88, 100]) {
      const bounds = inkBounds(createTrayBatteryIconBuffer(percent, false));
      expect(bounds.top).toBe(2);
      expect(bounds.bottom).toBe(30);
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThan(TRAY_BATTERY_ICON_SIZE);
    }
  });

  it('draws white on battery and green on external power, over a dark shadow', () => {
    // BGRA: the top bar of the "8" in 8% starts at (8 + 3, 2).
    expect(pixel(createTrayBatteryIconBuffer(8, false), 11, 2)).toEqual([255, 248, 245, 255]);
    expect(pixel(createTrayBatteryIconBuffer(8, true), 11, 2)).toEqual([125, 215, 57, 255]);
    // The shadow's bottom bar shows below the white one.
    expect(pixel(createTrayBatteryIconBuffer(8, false), 21, 30)).toEqual([0, 0, 0, 180]);
  });

  it('clamps and rounds out-of-range percentages', () => {
    expect(createTrayBatteryIconBuffer(140, false)).toEqual(createTrayBatteryIconBuffer(100, false));
    expect(createTrayBatteryIconBuffer(-5, false)).toEqual(createTrayBatteryIconBuffer(0, false));
    expect(createTrayBatteryIconBuffer(41.6, false)).toEqual(createTrayBatteryIconBuffer(42, false));
  });
});
