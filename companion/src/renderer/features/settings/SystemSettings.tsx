import {
  IconBrandDiscord,
  IconBrandGithub,
  IconChevronRight,
  IconRadioactive,
  IconUpload,
  IconUsb
} from '@tabler/icons-react';
import { KITSUNE_INPUT_PURCHASE_URL, KITSUNE_INPUT_URL, KitsuneInputSupportCard } from '../kitsune-promotion';
import { SearchableSetting, type SettingsCategoryProps } from './SettingsCategoryContentSupport';
import { LastRestartRow } from './LastRestartRow';

export const DS5_BRIDGE_GITHUB_URL = 'https://github.com/SundayMoments';
export const DS5_BRIDGE_DISCORD_URL = 'https://discord.gg/By5jhh73wr';

export function FirmwareSettings({ model, actions, matchingSettingIds }: SettingsCategoryProps) {
  const { pendingAction } = model;
  return <>
    <h3 className="settings-menu-section-label">Bridge Firmware</h3>
    <SearchableSetting id="pico-tools" matchingSettingIds={matchingSettingIds}>
      <div className="settings-menu-row pico-firmware-row">
        <div className="pico-firmware-header">
          <div className="settings-menu-copy pico-firmware-copy">
            <strong>Firmware Tools</strong>
            <span>Mount reboots the Pico into UF2 mode. Flash copies a selected firmware UF2. Nuke wipes flash with Pico Universal Flash Nuke.</span>
            {model.picoFirmware.message ? (
              <span className="pico-firmware-message good" role="status">{model.picoFirmware.message}</span>
            ) : null}
            {model.picoFirmware.error ? (
              <span className="pico-firmware-message bad" role="alert">{model.picoFirmware.error}</span>
            ) : null}
          </div>
          <div className="pico-firmware-actions">
            <button type="button" className="heading-action danger" disabled={model.busy} onClick={actions.nukePicoFlash}>
              <IconRadioactive size={14} />
              {pendingAction === 'pico-firmware-nuke' ? 'Nuking…' : 'Nuke'}
            </button>
            <div className="pico-firmware-dual-action" role="group" aria-label="Pico firmware bootloader actions">
              <button type="button" className="heading-action" disabled={model.busy} onClick={actions.mountPicoBootloader}>
                <IconUsb size={14} />
                {pendingAction === 'pico-firmware-mount' ? 'Mounting…' : 'Mount'}
              </button>
              <button type="button" className="heading-action" disabled={model.busy} onClick={actions.flashPicoFirmware}>
                <IconUpload size={14} />
                {pendingAction === 'pico-firmware-flash' ? 'Flashing…' : 'Flash'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </SearchableSetting>
    {model.bridgeHealth.resetEvidence ? (
      <SearchableSetting id="last-restart" matchingSettingIds={matchingSettingIds}>
        <LastRestartRow evidence={model.bridgeHealth.resetEvidence} firmwareVersion={model.bridgeHealth.firmwareVersion} />
      </SearchableSetting>
    ) : null}
  </>;
}

export function AboutSettings({ model, actions, matchingSettingIds }: SettingsCategoryProps) {
  const firmwareVersion = model.bridgeHealth.firmwareVersion;
  const versionText = firmwareVersion
    ? `App v${model.appVersion} · Firmware v${firmwareVersion}`
    : `App v${model.appVersion} · Firmware not connected`;
  return <>
    <h3 className="settings-menu-section-label">Help &amp; About</h3>
    {model.appVersion ? (
      <SearchableSetting id="version" matchingSettingIds={matchingSettingIds}>
        <div className="settings-menu-row">
          <div className="settings-menu-copy">
            <strong>Version</strong>
            <span>{versionText}</span>
          </div>
        </div>
      </SearchableSetting>
    ) : null}
    <SearchableSetting id="kitsune-input" matchingSettingIds={matchingSettingIds}>
      <KitsuneInputSupportCard
        onGet={() => actions.openExternal(KITSUNE_INPUT_PURCHASE_URL)}
        onLearnMore={() => actions.openExternal(KITSUNE_INPUT_URL)}
      />
    </SearchableSetting>
    <SearchableSetting id="discord" matchingSettingIds={matchingSettingIds}>
      <button type="button" className="settings-menu-link-row" onClick={() => actions.openExternal(DS5_BRIDGE_DISCORD_URL)}>
        <span className="settings-menu-link-icon" aria-hidden="true"><IconBrandDiscord size={18} /></span>
        <span className="settings-menu-link-copy">
          <strong>Discord</strong>
          <span>Official DS5 Bridge Discord</span>
        </span>
        <IconChevronRight className="settings-menu-link-chevron" size={16} aria-hidden="true" />
      </button>
    </SearchableSetting>
    <SearchableSetting id="github" matchingSettingIds={matchingSettingIds}>
      <button type="button" className="settings-menu-link-row" onClick={() => actions.openExternal(DS5_BRIDGE_GITHUB_URL)}>
        <span className="settings-menu-link-icon" aria-hidden="true"><IconBrandGithub size={18} /></span>
        <span className="settings-menu-link-copy">
          <strong>GitHub</strong>
          <span>SundayMoments</span>
        </span>
        <IconChevronRight className="settings-menu-link-chevron" size={16} aria-hidden="true" />
      </button>
    </SearchableSetting>
  </>;
}
