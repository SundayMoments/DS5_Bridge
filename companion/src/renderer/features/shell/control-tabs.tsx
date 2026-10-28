import {
  type TablerIcon,
  IconBluetooth,
  IconBulb,
  IconCpu,
  IconDeviceAudioTape,
  IconDeviceGamepad2,
  IconDeviceGamepad3,
  IconFlask2,
  IconLayoutDashboard,
  IconReplace,
  IconSettings,
  IconSparkles,
  IconTool,
  IconViewfinder,
  IconVolume
} from '@tabler/icons-react';

export type ControlTab =
  | 'overview'
  | 'devices'
  | 'dualsense'
  | 'audio'
  | 'haptics'
  | 'audio-haptics'
  | 'triggers'
  | 'trigger-lab'
  | 'lighting'
  | 'deadzones'
  | 'remapping'
  | 'chords'
  | 'system'
  | 'settings';

export type ControlTabDefinition = Readonly<{
  id: ControlTab;
  label: string;
  Icon: TablerIcon;
}>;

export type ControlTabGroupId = 'controller' | 'input' | 'tools';

export type ControlTabGroupDefinition = Readonly<{
  id: ControlTabGroupId;
  label: string;
  Icon: TablerIcon;
  tabs: readonly ControlTabDefinition[];
}>;

export const CONTROL_TAB_DEFINITIONS = {
  overview: { id: 'overview', label: 'Overview', Icon: IconLayoutDashboard },
  devices: { id: 'devices', label: 'Devices', Icon: IconBluetooth },
  dualsense: { id: 'dualsense', label: 'DualSense', Icon: IconDeviceGamepad2 },
  audio: { id: 'audio', label: 'Audio', Icon: IconVolume },
  haptics: { id: 'haptics', label: 'Haptics', Icon: IconSparkles },
  'audio-haptics': { id: 'audio-haptics', label: 'Audio Haptics', Icon: IconDeviceAudioTape },
  triggers: { id: 'triggers', label: 'Adaptive Triggers', Icon: IconDeviceGamepad2 },
  'trigger-lab': { id: 'trigger-lab', label: 'Trigger Lab', Icon: IconFlask2 },
  lighting: { id: 'lighting', label: 'Lighting', Icon: IconBulb },
  deadzones: { id: 'deadzones', label: 'Stick Deadzones', Icon: IconViewfinder },
  remapping: { id: 'remapping', label: 'Button Remapping', Icon: IconDeviceGamepad3 },
  chords: { id: 'chords', label: 'Chords', Icon: IconReplace },
  system: { id: 'system', label: 'System', Icon: IconCpu },
  settings: { id: 'settings', label: 'Settings', Icon: IconSettings }
} satisfies Record<ControlTab, ControlTabDefinition>;

export const CONTROL_TAB_GROUPS: readonly ControlTabGroupDefinition[] = [
  {
    id: 'controller',
    label: 'Controller',
    Icon: IconDeviceGamepad3,
    tabs: [
      CONTROL_TAB_DEFINITIONS.devices,
      CONTROL_TAB_DEFINITIONS.dualsense
    ]
  },
  {
    id: 'input',
    label: 'Input',
    Icon: IconReplace,
    tabs: [
      CONTROL_TAB_DEFINITIONS.deadzones,
      CONTROL_TAB_DEFINITIONS.remapping,
      CONTROL_TAB_DEFINITIONS.chords
    ]
  },
  {
    // Like Kitsune Input's Tools group: the labs and the bridge's System page.
    id: 'tools',
    label: 'Tools',
    Icon: IconTool,
    tabs: [
      CONTROL_TAB_DEFINITIONS['audio-haptics'],
      CONTROL_TAB_DEFINITIONS['trigger-lab'],
      CONTROL_TAB_DEFINITIONS.system
    ]
  }
];

export const CONTROL_TABS: readonly ControlTabDefinition[] = [
  CONTROL_TAB_DEFINITIONS.overview,
  ...CONTROL_TAB_GROUPS.flatMap(({ tabs }) => tabs),
  CONTROL_TAB_DEFINITIONS.settings
];

/**
 * The sections of the DualSense tab, like Kitsune Input's Controller Studio:
 * one sidebar entry, with a strip above each page to move between them. Each
 * section keeps its own tab ID, so links into Audio or Haptics still work.
 */
export const DUALSENSE_SECTIONS = ['audio', 'haptics', 'triggers', 'lighting'] as const satisfies readonly ControlTab[];
export type DualSenseSection = typeof DUALSENSE_SECTIONS[number];

export function isDualSenseSection(tab: ControlTab): tab is DualSenseSection {
  return (DUALSENSE_SECTIONS as readonly ControlTab[]).includes(tab);
}

/** The sidebar entry that shows as current for a page: DualSense for its sections. */
export function sidebarTabFor(tab: ControlTab): ControlTab {
  return isDualSenseSection(tab) ? 'dualsense' : tab;
}

export function controlTabGroupFor(tab: ControlTab): ControlTabGroupDefinition | null {
  const sidebarTab = sidebarTabFor(tab);
  return CONTROL_TAB_GROUPS.find(({ tabs }) => tabs.some(({ id }) => id === sidebarTab)) ?? null;
}

/** Audio Haptics and Trigger Lab reuse the Haptics and Triggers panels. */
export function controlPanelIdFor(tab: ControlTab): string {
  if (tab === 'audio-haptics') return 'control-panel-haptics';
  if (tab === 'trigger-lab') return 'control-panel-triggers';
  return `control-panel-${tab}`;
}
