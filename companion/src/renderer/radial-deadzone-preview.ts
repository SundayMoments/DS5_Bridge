import { normalizeRadialDeadzonePercent } from '../shared/protocol';

export interface StickPreviewPosition {
  x: number;
  y: number;
}

export interface RadialDeadzonePreview {
  physical: StickPreviewPosition;
  output: StickPreviewPosition;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function analogByteToUnit(value: number): number {
  const byte = clamp(Math.round(Number.isFinite(value) ? value : 128), 0, 255);
  return byte >= 128 ? (byte - 128) / 127 : (byte - 128) / 128;
}

export function radialDeadzonePreview(
  rawX: number,
  rawY: number,
  deadzonePercent: number
): RadialDeadzonePreview {
  const x = analogByteToUnit(rawX);
  const y = analogByteToUnit(rawY);
  const physical = { x, y };
  const magnitude = Math.min(1, Math.hypot(x, y));
  const deadzone = normalizeRadialDeadzonePercent(deadzonePercent) / 100;
  if (deadzone === 0) {
    return { physical, output: physical };
  }
  if (magnitude <= deadzone) {
    return { physical, output: { x: 0, y: 0 } };
  }

  const outputMagnitude = clamp(
    (magnitude - deadzone) / Math.max(0.0001, 1 - deadzone),
    0,
    1
  );
  const scale = outputMagnitude / magnitude;
  return {
    physical,
    output: {
      x: clamp(x * scale, -1, 1),
      y: clamp(y * scale, -1, 1)
    }
  };
}

export function stickPositionPercent(position: StickPreviewPosition): { left: string; top: string } {
  return {
    left: `${(clamp(position.x, -1, 1) + 1) * 50}%`,
    top: `${(clamp(position.y, -1, 1) + 1) * 50}%`
  };
}
