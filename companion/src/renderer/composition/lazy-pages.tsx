import type { ComponentProps } from 'react';
import type { ButtonRemappingPageProps } from '../features/button-remapping/ButtonRemappingPage';
import type { ChordsPageProps } from '../features/chords/ChordsPage';
import type { DevicesPageProps } from '../features/devices/DevicesPage';
import type { SettingsPage } from '../features/settings/SettingsPage';
import type { StickDeadzonesPageProps } from '../features/stick-deadzones/StickDeadzonesPage';
import { lazyPage, pageShell } from './lazy-page';

// Pages outside the everyday Controller pages are separate chunks loaded on
// first visit, keeping their code out of the main entry. Each placeholder is
// an empty tab panel with the page's classes, so the first visit does not
// shift the layout. App imports these pages' controllers and dialogs from
// their own modules, never from the feature index, so the pages stay split.
export const LazyDevicesPage = lazyPage<DevicesPageProps>(
  () => import('../features/devices/DevicesPage').then((module) => module.DevicesPage),
  pageShell('devices-page', 'control-panel-devices')
);
export const LazyStickDeadzonesPage = lazyPage<StickDeadzonesPageProps>(
  () => import('../features/stick-deadzones/StickDeadzonesPage').then((module) => module.StickDeadzonesPage),
  pageShell('deadzones-page', 'control-panel-deadzones')
);
export const LazyButtonRemappingPage = lazyPage<ButtonRemappingPageProps>(
  () => import('../features/button-remapping/ButtonRemappingPage').then((module) => module.ButtonRemappingPage),
  pageShell('remapping-page', 'control-panel-remapping')
);
export const LazyChordsPage = lazyPage<ChordsPageProps>(
  () => import('../features/chords/ChordsPage').then((module) => module.ChordsPage),
  pageShell('chords-page', 'control-panel-chords')
);
export const LazySettingsPage = lazyPage<ComponentProps<typeof SettingsPage>>(
  () => import('../features/settings/SettingsPage').then((module) => module.SettingsPage),
  pageShell('settings-page', 'control-panel-settings')
);
