// The tray's battery percentage, drawn as seven-segment digits into a 32x32
// BGRA bitmap the tray shows at 2x. Kept apart from main.ts so it can be tested
// without Electron, as in Kitsune Input.

export const TRAY_BATTERY_ICON_SIZE = 32;
export const TRAY_BATTERY_ICON_SCALE_FACTOR = 2;

type TrayIconColor = Readonly<{
  red: number;
  green: number;
  blue: number;
  alpha: number;
}>;

const SHADOW: TrayIconColor = { red: 0, green: 0, blue: 0, alpha: 180 };
const DISCHARGING: TrayIconColor = { red: 245, green: 248, blue: 255, alpha: 255 };
const EXTERNAL_POWER: TrayIconColor = { red: 57, green: 215, blue: 125, alpha: 255 };

const DIGIT_SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg'
};

/** The battery percentage (0-100), white on battery and green on external power. */
export function createTrayBatteryIconBuffer(percent: number, powered: boolean): Buffer {
  const buffer = Buffer.alloc(TRAY_BATTERY_ICON_SIZE * TRAY_BATTERY_ICON_SIZE * 4);
  const text = String(Math.max(0, Math.min(100, Math.round(percent))));
  drawDigitalNumber(buffer, text, SHADOW, 1);
  drawDigitalNumber(buffer, text, powered ? EXTERNAL_POWER : DISCHARGING);
  return buffer;
}

function setPixel(buffer: Buffer, x: number, y: number, color: TrayIconColor): void {
  if (x < 0 || y < 0 || x >= TRAY_BATTERY_ICON_SIZE || y >= TRAY_BATTERY_ICON_SIZE) return;
  const offset = ((y * TRAY_BATTERY_ICON_SIZE) + x) * 4;
  buffer[offset] = color.blue;
  buffer[offset + 1] = color.green;
  buffer[offset + 2] = color.red;
  buffer[offset + 3] = color.alpha;
}

function drawRect(
  buffer: Buffer,
  x: number,
  y: number,
  width: number,
  height: number,
  color: TrayIconColor
): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) setPixel(buffer, column, row, color);
  }
}

function drawDigit(
  buffer: Buffer,
  digit: string,
  x: number,
  y: number,
  width: number,
  height: number,
  thickness: number,
  color: TrayIconColor
): void {
  const segments = DIGIT_SEGMENTS[digit];
  if (!segments) return;
  const middleY = Math.floor((height - thickness) / 2);
  const lowerHeight = height - middleY - (thickness * 2);
  const rects: Record<string, [number, number, number, number]> = {
    a: [x + thickness, y, width - (thickness * 2), thickness],
    b: [x + width - thickness, y + thickness, thickness, middleY - thickness],
    c: [x + width - thickness, y + middleY + thickness, thickness, lowerHeight],
    d: [x + thickness, y + height - thickness, width - (thickness * 2), thickness],
    e: [x, y + middleY + thickness, thickness, lowerHeight],
    f: [x, y + thickness, thickness, middleY - thickness],
    g: [x + thickness, y + middleY, width - (thickness * 2), thickness]
  };
  for (const segment of segments) {
    const [segmentX, segmentY, segmentWidth, segmentHeight] = rects[segment];
    drawRect(buffer, segmentX, segmentY, segmentWidth, segmentHeight, color);
  }
}

// Digits fill the largest safe bounds of the 32-pixel bitmap, leaving room for
// the 1-pixel contrast shadow (Kitsune Input's tray legibility sizes).
function drawDigitalNumber(buffer: Buffer, text: string, color: TrayIconColor, offset = 0): void {
  const digitCount = text.length;
  const digitWidth = digitCount === 1 ? 16 : digitCount === 2 ? 14 : 9;
  const digitHeight = 28;
  const thickness = digitCount === 3 ? 2 : 3;
  const spacing = digitCount === 1 ? 0 : digitCount === 2 ? 2 : 1;
  const totalWidth = (digitCount * digitWidth) + ((digitCount - 1) * spacing);
  const startX = Math.floor((TRAY_BATTERY_ICON_SIZE - totalWidth) / 2) + offset;
  const startY = Math.floor((TRAY_BATTERY_ICON_SIZE - digitHeight) / 2) + offset;
  for (let index = 0; index < text.length; index += 1) {
    drawDigit(buffer, text[index], startX + (index * (digitWidth + spacing)), startY,
      digitWidth, digitHeight, thickness, color);
  }
}
