const BRIDGE_AUDIO_LABEL_PATTERNS = [
  /\bds5\b/i,
  /\bdual\s*sense\b/i,
  /\bwireless controller\b/i,
  /\bxbox 360 controller for windows\b/i,
  /\bds5 bridge\b/i
];

export function normalizeAudioDeviceLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/^\s*\d+\s*-\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isBridgeAudioDeviceLabel(label: string): boolean {
  const normalizedLabel = normalizeAudioDeviceLabel(label);
  return BRIDGE_AUDIO_LABEL_PATTERNS.some((pattern) => pattern.test(normalizedLabel));
}

export function bridgeAudioOutputLabelScore(rawLabel: string): number {
  const label = normalizeAudioDeviceLabel(rawLabel);
  let score = 1;
  if (label.includes('dualsense') || label.includes('dual sense')) score += 4;
  if (label.includes('wireless controller')) score += 3;
  if (label.includes('xbox 360 controller for windows')) score += 4;
  if (label.includes('speaker') || label.includes('headphone') || label.includes('headset')) score += 2;
  if (label.includes('microphone') || label.includes('mic')) score -= 4;
  if (label.includes('ds5') || label.includes('bridge')) score += 1;
  return score;
}

export function bridgeAudioInputLabelScore(rawLabel: string): number {
  const label = normalizeAudioDeviceLabel(rawLabel);
  let score = 1;
  if (label.includes('dualsense') || label.includes('dual sense')) score += 4;
  if (label.includes('wireless controller')) score += 3;
  if (label.includes('xbox 360 controller for windows')) score += 4;
  if (label.includes('microphone') || label.includes('mic')) score += 2;
  if (label.includes('speaker') || label.includes('headphone')) score -= 4;
  if (label.includes('ds5') || label.includes('bridge')) score += 1;
  return score;
}
