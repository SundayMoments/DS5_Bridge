import { describe, expect, it } from 'vitest';
import {
  analogByteToUnit,
  radialDeadzonePreview,
  stickPositionPercent
} from './radial-deadzone-preview';

describe('radial deadzone preview', () => {
  it('maps asymmetric controller bytes to the complete unit range', () => {
    expect(analogByteToUnit(0)).toBe(-1);
    expect(analogByteToUnit(128)).toBe(0);
    expect(analogByteToUnit(255)).toBe(1);
  });

  it('keeps physical movement visible while output is centered inside the deadzone', () => {
    const preview = radialDeadzonePreview(140, 128, 14);

    expect(preview.physical.x).toBeGreaterThan(0);
    expect(preview.output).toEqual({ x: 0, y: 0 });
  });

  it('expands movement outside the deadzone using the firmware formula', () => {
    const preview = radialDeadzonePreview(192, 128, 20);
    const expectedMagnitude = (preview.physical.x - 0.2) / 0.8;

    expect(preview.output.x).toBeCloseTo(expectedMagnitude, 6);
    expect(preview.output.y).toBe(0);
  });

  it('preserves full cardinal travel and diagonal direction', () => {
    expect(radialDeadzonePreview(255, 128, 50).output).toEqual({ x: 1, y: 0 });
    const diagonal = radialDeadzonePreview(200, 200, 20);
    expect(diagonal.output.x).toBeCloseTo(diagonal.output.y, 6);
  });

  it('maps unit coordinates into the circular field', () => {
    expect(stickPositionPercent({ x: -1, y: 1 })).toEqual({ left: '0%', top: '100%' });
    expect(stickPositionPercent({ x: 0, y: 0 })).toEqual({ left: '50%', top: '50%' });
  });
});
