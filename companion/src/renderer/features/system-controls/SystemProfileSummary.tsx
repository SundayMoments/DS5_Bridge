import {
  IconAdjustmentsHorizontal as Settings2,
  IconBulb,
  IconSparkles as Sparkles,
  IconVolume as Volume2
} from '@tabler/icons-react';
import type { ControllerProfileSettings } from '@shared/protocol';
import { CONTROLLER_POWER_SAVING_CAP_PERCENT } from '../../common/controller-power-saving';
import { lightbarColorLabel } from '../controller-lighting/model';
import { POLLING_RATE_OPTIONS, enabledLabel, muteButtonSummary, optionLabel, percentLabel } from './model';

/** The selected profile's settings at a glance, under the System cards. */
export function SystemProfileSummary({
  settings,
  powerSavingActive
}: {
  settings: ControllerProfileSettings;
  powerSavingActive: boolean;
}) {
  const ecoValueClass = (active: boolean) => (active ? ' eco-limited' : '');
  const effectiveEcoPercent = (value: number) => percentLabel(Math.min(value, CONTROLLER_POWER_SAVING_CAP_PERCENT));
  const hapticsEcoLimited = powerSavingActive
    && settings.hapticsEnabled
    && settings.hapticsGainPercent > 0;
  const rumbleEcoLimited = powerSavingActive
    && settings.classicRumbleEnabled
    && settings.classicRumbleGainPercent > 0;
  const triggersEcoLimited = powerSavingActive
    && settings.adaptiveTriggersEnabled
    && settings.triggerEffectIntensityPercent > 0;
  const lightbarEcoLimited = powerSavingActive
    && settings.lightbarEnabled
    && settings.lightbarBrightnessPercent > 0;

  return (
    <div className="system-profile-summary" aria-label="Current profile settings">
      <div className="system-profile-summary-group">
        <div className="system-profile-summary-heading">
          <Volume2 size={15} />
          <h3>Audio</h3>
        </div>
        <dl>
          <div><dt>Speaker</dt><dd>{settings.speakerEnabled ? percentLabel(settings.speakerVolumePercent) : 'Off'}</dd></div>
          <div><dt>Mic</dt><dd>{settings.micMuted ? 'Muted' : percentLabel(settings.micVolumePercent)}</dd></div>
          <div><dt>Pass-through</dt><dd>{enabledLabel(settings.duplexMicEnabled)}</dd></div>
        </dl>
      </div>

      <div className="system-profile-summary-group">
        <div className="system-profile-summary-heading">
          <Sparkles size={15} />
          <h3>Feel</h3>
        </div>
        <dl>
          <div><dt>Haptics</dt><dd className={ecoValueClass(hapticsEcoLimited)}>{settings.hapticsEnabled ? (hapticsEcoLimited ? effectiveEcoPercent(settings.hapticsGainPercent) : percentLabel(settings.hapticsGainPercent)) : 'Off'}</dd></div>
          <div><dt>Rumble</dt><dd className={ecoValueClass(rumbleEcoLimited)}>{settings.classicRumbleEnabled ? (rumbleEcoLimited ? effectiveEcoPercent(settings.classicRumbleGainPercent) : percentLabel(settings.classicRumbleGainPercent)) : 'Off'}</dd></div>
          <div><dt>Triggers</dt><dd className={ecoValueClass(triggersEcoLimited)}>{settings.adaptiveTriggersEnabled ? (triggersEcoLimited ? effectiveEcoPercent(settings.triggerEffectIntensityPercent) : percentLabel(settings.triggerEffectIntensityPercent)) : 'Off'}</dd></div>
          <div><dt>Stick DZ</dt><dd>{`${settings.leftStickRadialDeadzonePercent}% / ${settings.rightStickRadialDeadzonePercent}%`}</dd></div>
        </dl>
      </div>

      <div className="system-profile-summary-group">
        <div className="system-profile-summary-heading">
          <IconBulb size={15} />
          <h3>Lighting</h3>
        </div>
        <dl>
          <div><dt>Lightbar</dt><dd className={ecoValueClass(lightbarEcoLimited)}>{settings.lightbarEnabled ? (lightbarEcoLimited ? effectiveEcoPercent(settings.lightbarBrightnessPercent) : percentLabel(settings.lightbarBrightnessPercent)) : 'Off'}</dd></div>
          <div><dt>Color</dt><dd>{lightbarColorLabel(settings.lightbarColor)}</dd></div>
          <div><dt>Override</dt><dd>{enabledLabel(settings.lightbarOverrideEnabled)}</dd></div>
        </dl>
      </div>

      <div className="system-profile-summary-group">
        <div className="system-profile-summary-heading">
          <Settings2 size={15} />
          <h3>System</h3>
        </div>
        <dl>
          <div><dt>Mute</dt><dd>{muteButtonSummary(settings)}</dd></div>
          <div><dt>Polling</dt><dd>{optionLabel(POLLING_RATE_OPTIONS, settings.pollingRateMode)}</dd></div>
          <div><dt>Edge Profiles</dt><dd>{settings.edgeProfileSwitchingBlocked ? 'Blocked' : 'Available'}</dd></div>
          <div><dt>Power Save</dt><dd>{enabledLabel(settings.controllerPowerSavingEnabled)}</dd></div>
        </dl>
      </div>
    </div>
  );
}
