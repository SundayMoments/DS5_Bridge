import type { HostPersonaMode } from '@shared/protocol';

/** The controller the bridge presents to the PC. Product names stay in English. */
export const HOST_PERSONA_OPTIONS: Array<[string, HostPersonaMode]> = [
  ['DualSense', 'dualsense'],
  ['DualSense Edge', 'dualsense-edge'],
  ['DualShock 4', 'ds4'],
  ['Xbox', 'xbox']
];

/** Abbreviations on the Overview persona buttons. */
export const HOST_PERSONA_ABBREVIATIONS: Record<HostPersonaMode, string> = {
  dualsense: 'DS',
  'dualsense-edge': 'DSE',
  ds4: 'DS4',
  xbox: 'XBOX'
};
