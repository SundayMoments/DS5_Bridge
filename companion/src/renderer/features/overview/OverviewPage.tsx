import type { CSSProperties } from 'react';
import {
  IconActivity as Activity,
  IconAdjustmentsSpark,
  IconBatteryEco,
  IconBell as Bell,
  IconBinary,
  IconBluetooth,
  IconBolt as Zap,
  IconBrandXbox,
  IconDeviceGamepad2,
  IconVolume as Volume2,
  IconZzz
} from '@tabler/icons-react';
import type { BridgeSnapshot } from '@shared/types';
import playStationLogoUrl from '@product-assets/brand/playstation-logo.svg';
import dpadDownGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Down.svg';
import dpadUpGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Up.svg';
import psHomeGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/Home.svg';
import triangleGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/Triangle.svg';
import { CONTROLLER_POWER_SAVING_CAP_PERCENT } from '../../common/controller-power-saving';
import { HOST_PERSONA_ABBREVIATIONS, HOST_PERSONA_OPTIONS } from '../../common/host-persona';
import { PERCENT_SLIDER_TICKS } from '../../common/slider-ticks';
import type { ControllerAudioController } from '../controller-audio';
import { MIC_VOLUME_STEP, SPEAKER_VOLUME_STEP, snapMicVolume, snapSpeakerVolume } from '../controller-audio/model';
import type { ControllerFeedbackController } from '../controller-feedback/use-controller-feedback-controller';
import { HAPTICS_STEP, snapHapticsValue } from '../controller-feedback/model';
import type { ControllerLightingController } from '../controller-lighting';
import { LIGHTBAR_BRIGHTNESS_STEP, snapLightbarBrightness } from '../controller-lighting/model';
import type { SettingsFocusTarget } from '../settings/settings-navigation';
import type { ControlTab } from '../shell/control-tabs';
import type { ShellNotificationFocusTarget } from '../shell/ShellNotifications';
import type { SystemController } from '../system-controls/use-system-controller';
import { overviewStatus } from './model';
import { OverviewRangeRow } from './OverviewRangeRow';
import type { OverviewController } from './use-overview-controller';

export interface OverviewPageProps {
  readonly active: boolean;
  readonly snapshot: BridgeSnapshot;
  readonly connected: boolean;
  readonly pendingAction: string | null;
  readonly overview: OverviewController;
  readonly feedback: ControllerFeedbackController;
  readonly audio: ControllerAudioController;
  readonly lighting: ControllerLightingController;
  readonly system: SystemController;
  readonly onOpenPage: (tab: ControlTab) => void;
  readonly onSettingsFocusRequest: (target: SettingsFocusTarget) => void;
  readonly onNotificationFocusRequest: (target: ShellNotificationFocusTarget) => void;
}

/** Status cards, quick actions and sliders, and the active settings summary. */
export function OverviewPage({
  active,
  snapshot,
  connected,
  pendingAction,
  overview,
  feedback,
  audio,
  lighting,
  system,
  onOpenPage,
  onSettingsFocusRequest,
  onNotificationFocusRequest
}: OverviewPageProps) {
  const { controllerPowerSavingActive } = feedback;
  const status = overviewStatus(snapshot, { controllerPowerSavingActive });
  const speakerVolumeSupported = Boolean(snapshot.status?.firmwareFlags.speakerVolumeControl);
  const lightbarSupported = Boolean(snapshot.status?.firmwareFlags.lightbarControl);
  const lightbarSliderMax = controllerPowerSavingActive ? CONTROLLER_POWER_SAVING_CAP_PERCENT : 100;

  return (
    <div
      className={`control-page overview-page ${active ? 'active' : ''}`}
      role="tabpanel"
      id="control-panel-overview"
      aria-labelledby="control-tab-overview"
      aria-hidden={!active}
    >
      <div className="feature-heading overview-heading">
        <div>
          <h2>Overview</h2>
          <p>At-a-glance status of your controller and active settings.</p>
        </div>
        <span className={`overview-health health-label ${status.healthTone}`} title={status.healthTitle}>
          <span className={`dot ${status.healthTone}`} />
          {status.healthLabel}
        </span>
      </div>

      <div className="overview-card-grid">
        <button className="overview-card" type="button" onClick={() => onOpenPage('system')}>
          <div className="overview-card-title">
            <span className="feature-icon overview-icon"><Activity size={19} /></span>
            <h3>Connection</h3>
          </div>
          <div className="overview-fields">
            <div>
              <span>USB</span>
              <strong className={status.connectionStatus === 'Stable' ? 'success-value' : ''}>
                {status.connectionStatus}
              </strong>
            </div>
            <div>
              <span>Polling Rate</span>
              <strong>{status.pollingRateLabel}</strong>
            </div>
          </div>
        </button>

        <button className="overview-card" type="button" onClick={() => onOpenPage('audio')}>
          <div className="overview-card-title">
            <span className="feature-icon overview-icon"><IconBinary size={26} /></span>
            <h3>Audio Path</h3>
          </div>
          <div className="overview-fields">
            <div>
              <span>Route</span>
              <strong className={connected ? 'success-value' : ''}>{status.audioRouteLabel}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{status.audioPathStatus}</strong>
            </div>
          </div>
        </button>

        <button className="overview-card" type="button" onClick={() => onOpenPage('audio')}>
          <div className="overview-card-title">
            <span className="feature-icon overview-icon"><Volume2 size={19} /></span>
            <h3>Audio</h3>
          </div>
          <div className="overview-fields">
            <div>
              <span>Route</span>
              <strong>{status.audioOutputLabel}</strong>
            </div>
            <div>
              <span>Volume</span>
              <strong>{`${audio.speakerVolumeValue}%`}</strong>
            </div>
          </div>
        </button>

        <button className="overview-card" type="button" onClick={() => onOpenPage('system')}>
          <div className="overview-card-title">
            <span className="feature-icon overview-icon"><IconBluetooth size={19} /></span>
            <h3>Wireless</h3>
          </div>
          <div className="overview-fields">
            <div>
              <span>Signal</span>
              <strong className={`signal-value ${status.signalTone}`} title={status.signalTitle}>
                {status.signalLabel}
              </strong>
            </div>
            <div>
              <span>Firmware</span>
              <strong>{status.firmwareLabel}</strong>
            </div>
          </div>
        </button>
      </div>

      <div className="overview-control-grid">
        <section className="overview-control-panel overview-quick-actions" aria-label="Quick actions">
          <div className="overview-panel-heading">
            <span className="feature-icon overview-icon"><Zap size={18} /></span>
            <div>
              <h3>Quick Actions</h3>
            </div>
          </div>
          <div className="overview-persona-grid" aria-label="Host controller persona">
            {HOST_PERSONA_OPTIONS.map(([label, mode]) => {
              const selected = status.hostPersonaMode === mode;
              const disabled = !system.hostPersonaSwitchAvailable
                || (!system.supportedHostPersonaModes.includes(mode) && !selected);
              return (
                <button
                  key={mode}
                  type="button"
                  className={`overview-persona-button persona-${mode} ${selected ? 'active' : ''}`}
                  aria-pressed={selected}
                  aria-label={`Switch to ${label} mode`}
                  disabled={disabled}
                  title={`Switch to ${label} mode`}
                  onClick={() => {
                    if (!selected) {
                      system.setHostPersonaMode(mode);
                    }
                  }}
                >
                  {mode === 'xbox' ? (
                    <IconBrandXbox className="overview-persona-logo" aria-hidden="true" />
                  ) : (
                    <span
                      className="overview-persona-logo playstation"
                      style={{ '--overview-persona-logo-mask': `url("${playStationLogoUrl}")` } as CSSProperties}
                      aria-hidden="true"
                    />
                  )}
                  <span>{HOST_PERSONA_ABBREVIATIONS[mode]}</span>
                </button>
              );
            })}
          </div>
          {/* Kitsune Input's layout: the personas, then one Sleep Controller row. */}
          <div className="overview-action-grid overview-sleep-row">
            <button
              type="button"
              className={overview.sleepConfirmVisible ? 'confirm' : undefined}
              disabled={overview.sleepUnavailable}
              onClick={overview.sleepController}
            >
              <IconZzz size={15} />
              {overview.sleepConfirmVisible ? 'Confirm Sleep' : 'Sleep Controller'}
            </button>
          </div>
        </section>

        <section className="overview-control-panel overview-sliders" aria-label="Quick controls">
          <div className="overview-panel-heading">
            <span className="feature-icon overview-icon"><IconAdjustmentsSpark size={18} /></span>
            <div>
              <h3>Quick Controls</h3>
            </div>
          </div>
          <div className="overview-slider-list">
            <OverviewRangeRow
              label="Haptics"
              value={feedback.hapticsValue}
              max={feedback.hapticsSliderMax}
              step={HAPTICS_STEP}
              disabled={!connected || !snapshot.settings.hapticsEnabled}
              ticks={feedback.hapticsSliderTicks}
              tickMax={feedback.hapticsSliderMax}
              editingRef={feedback.hapticsEditingRef}
              onChange={(value) => feedback.setHapticsValue(snapHapticsValue(value, feedback.hapticsSliderMax))}
              onCommit={() => void feedback.commitHapticsValue()}
            />
            <OverviewRangeRow
              label="Speaker"
              value={audio.speakerVolumeValue}
              max={100}
              step={SPEAKER_VOLUME_STEP}
              disabled={!connected || !speakerVolumeSupported || !snapshot.settings.speakerEnabled || audio.speakerVolumeCommitPending}
              ticks={PERCENT_SLIDER_TICKS}
              tickMax={100}
              editingRef={audio.speakerVolumeEditingRef}
              onChange={(value) => audio.setSpeakerVolumeValue(snapSpeakerVolume(value))}
              onCommit={() => void audio.commitSpeakerVolume()}
            />
            <OverviewRangeRow
              label="Mic"
              value={audio.micVolumeValue}
              max={100}
              step={MIC_VOLUME_STEP}
              disabled={!connected || !audio.duplexMicEnabled || audio.micVolumeCommitPending}
              ticks={PERCENT_SLIDER_TICKS}
              tickMax={100}
              editingRef={audio.micVolumeEditingRef}
              onChange={(value) => audio.setMicVolumeValue(snapMicVolume(value))}
              onCommit={() => void audio.commitMicVolume()}
            />
            <OverviewRangeRow
              label="Lightbar"
              value={lighting.lightbarBrightnessValue}
              max={lightbarSliderMax}
              step={LIGHTBAR_BRIGHTNESS_STEP}
              disabled={!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled || lighting.lightbarCommitPending}
              ticks={PERCENT_SLIDER_TICKS}
              tickMax={100}
              editingRef={lighting.lightbarBrightnessEditingRef}
              onChange={(value) => lighting.setLightbarBrightnessValue(snapLightbarBrightness(value))}
              onCommit={() => void lighting.commitLightbar()}
            />
          </div>
        </section>
      </div>

      <section className="overview-status-panel" aria-label="Active settings summary">
        <div className="overview-status-group">
          <div className="overview-status-heading">
            <IconDeviceGamepad2 size={15} />
            <span>Shortcuts</span>
          </div>
          <div className="overview-chip-row">
            {status.shortcutItems.length > 0 ? (
              status.shortcutItems.map((item) => (
                <button
                  className="overview-chip overview-shortcut-chip active"
                  key={item.id}
                  type="button"
                  onClick={() => onSettingsFocusRequest(item.id === 'sleep' ? 'sleep-shortcut' : 'volume-shortcut')}
                >
                  {item.label}
                  {item.id === 'sleep' ? (
                    <span className="settings-shortcut-tooltip shortcut-glyph-tooltip overview-shortcut-tooltip" role="tooltip">
                      <span>Put controller to sleep with</span>
                      <span className="shortcut-glyph-row" aria-label="PlayStation Home and Triangle">
                        <span className="shortcut-glyph-key">
                          <img src={psHomeGlyphUrl} alt="PlayStation Home" />
                        </span>
                        <span className="shortcut-plus" aria-hidden="true">+</span>
                        <span className="shortcut-glyph-key">
                          <img src={triangleGlyphUrl} alt="Triangle" />
                        </span>
                      </span>
                    </span>
                  ) : (
                    <span className="settings-shortcut-tooltip shortcut-glyph-tooltip overview-shortcut-tooltip" role="tooltip">
                      <span>Controller volume up/down with</span>
                      <span className="shortcut-glyph-row" aria-label="PlayStation Home and D-pad Up or D-pad Down">
                        <span className="shortcut-glyph-key">
                          <img src={psHomeGlyphUrl} alt="PlayStation Home" />
                        </span>
                        <span className="shortcut-plus" aria-hidden="true">+</span>
                        <span className="shortcut-glyph-pair">
                          <span className="shortcut-glyph-key">
                            <img src={dpadUpGlyphUrl} alt="D-pad Up" />
                          </span>
                          <span className="shortcut-glyph-key">
                            <img src={dpadDownGlyphUrl} alt="D-pad Down" />
                          </span>
                        </span>
                      </span>
                    </span>
                  )}
                </button>
              ))
            ) : (
              <button className="overview-chip muted" type="button" onClick={() => onSettingsFocusRequest('shortcuts')}>
                None enabled
              </button>
            )}
          </div>
        </div>
        <div className="overview-status-group">
          <div className="overview-status-heading">
            <IconBatteryEco size={15} />
            <span>Power Saving</span>
          </div>
          <div className="overview-chip-row">
            <button
              className={`overview-chip ${snapshot.settings.controllerPowerSavingEnabled ? 'active success' : 'muted'}`}
              type="button"
              onClick={() => onSettingsFocusRequest('controller-power-saving')}
            >
              {status.powerSavingLabel}
            </button>
          </div>
        </div>
        <div className="overview-status-group">
          <div className="overview-status-heading">
            <Bell size={15} />
            <span>Notifications</span>
          </div>
          <div className="overview-chip-row">
            {status.notificationItems.length > 0 ? (
              status.notificationItems.map((item) => (
                <button
                  className="overview-chip active"
                  key={item.id}
                  type="button"
                  onClick={() => onNotificationFocusRequest(item.id)}
                >
                  {item.label}
                </button>
              ))
            ) : (
              <button className="overview-chip muted" type="button" onClick={() => onNotificationFocusRequest('all')}>
                Off
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
