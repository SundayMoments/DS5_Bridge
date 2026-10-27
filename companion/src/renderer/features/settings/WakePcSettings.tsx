import { ToggleRow } from './SettingsToggleRow';
import {
  SearchableSetting,
  SettingsBridgeNotice,
  settingsUnsupportedMessage,
  type SettingsCategoryProps
} from './SettingsCategoryContentSupport';
import { WakeOnLanSettings } from './WakeOnLanSettings';
import './wake-pc-settings.css';

export function WakePcSettings({ model, actions, active, matchingSettingIds }: SettingsCategoryProps) {
  const wakeOnLanMatched = !matchingSettingIds || matchingSettingIds.has('wake-on-lan');

  return <>
    <h3 className="settings-menu-section-label">Wake PC</h3>
    <SettingsBridgeNotice model={model} ids={['remote-wake', 'wake-on-lan']} matchingSettingIds={matchingSettingIds} />
    {wakeOnLanMatched ? (
      <p className="wake-pc-intro">
        When this PC sleeps or shuts down, turning on your controller wakes it. The bridge tries USB wake first, then sends a Wake-on-LAN packet over your Wi-Fi. Enable Wake on Magic Packet for the PC’s Ethernet adapter in Windows Device Manager.
      </p>
    ) : null}
    <SearchableSetting id="remote-wake" matchingSettingIds={matchingSettingIds}>
      <ToggleRow
        label="Wake PC on Controller"
        description="Wake through USB when a controller reconnects. Requires Windows wake permission and DualSense, DualSense Edge, or DS4 mode."
        checked={model.settings.wakeOnConnectEnabled}
        disabled={!model.connected || !model.support.wakeOnConnect || model.busy}
        unavailableReason={settingsUnsupportedMessage(model, model.support.wakeOnConnect)}
        onToggle={actions.toggleWakeOnConnect}
      />
    </SearchableSetting>
    {/* Mounted through searches, so a running test and its draft survive a query that hides it. */}
    <WakeOnLanSettings
      active={active}
      connected={model.connected}
      connectionKey={model.wakeOnLan.connectionKey}
      controllerConnected={model.wakeOnLan.controllerConnected}
      firmwareUpdateRequired={model.wakeOnLan.firmwareUpdateRequired}
      api={actions.wakeOnLan}
      searchMatch={Boolean(matchingSettingIds?.has('wake-on-lan'))}
      hidden={!wakeOnLanMatched}
    />
  </>;
}
