import type { CSSProperties } from 'react';
import {
  IconBrandDeezer,
  IconDeviceAudioTape,
  IconDeviceMobileVibration as Vibrate,
  IconFlame,
  IconPlayerPlay as Play,
  IconSparkles as Sparkles,
  IconTestPipe
} from '@tabler/icons-react';
import type { BridgeSnapshot } from '@shared/types';
import { AudioHapticsConfigLabel } from '../../common/AudioHapticsConfigLabel';
import { FeatureTipsPanel } from '../../common/FeatureTipsPanel';
import { sliderTickClass } from '../../common/slider-ticks';
import { InlineSelect as CustomSelect } from '../../components/InlineSelect';
import type { SettingsFocusTarget } from '../settings/settings-navigation';
import { AudioHapticsSourceOption } from '../audio-haptics-lab/AudioHapticsSourceOption';
import {
  AUDIO_REACTIVE_HAPTICS_ATTACK_OPTIONS,
  AUDIO_REACTIVE_HAPTICS_BASS_FOCUS_OPTIONS,
  AUDIO_REACTIVE_HAPTICS_FIELD_TOOLTIPS,
  AUDIO_REACTIVE_HAPTICS_MODE_OPTIONS,
  AUDIO_REACTIVE_HAPTICS_RELEASE_OPTIONS,
  AUDIO_REACTIVE_HAPTICS_RESPONSE_OPTIONS
} from '../audio-haptics-lab/model';
import type { AudioHapticsLabController } from '../audio-haptics-lab/use-audio-haptics-lab-controller';
import { HAPTICS_PRESETS, HAPTICS_STEP, snapHapticsValue } from './model';
import type { ControllerFeedbackController } from './use-controller-feedback-controller';

export interface ControllerFeedbackPageProps {
  /** Haptics or Audio Haptics is open; both share this panel. */
  readonly active: boolean;
  readonly audioHapticsOpen: boolean;
  readonly feedback: ControllerFeedbackController;
  readonly lab: AudioHapticsLabController;
  readonly snapshot: BridgeSnapshot;
  readonly connected: boolean;
  readonly controllerControlsAvailable: boolean;
  readonly pendingAction: string | null;
  readonly onSettingsFocusRequest: (target: SettingsFocusTarget) => void;
}

/** Haptics strength, rumble, boost, and the feedback test; with Audio Haptics open, the audio haptics lab. */
export function ControllerFeedbackPage({
  active,
  audioHapticsOpen,
  feedback,
  lab,
  snapshot,
  connected,
  controllerControlsAvailable,
  pendingAction,
  onSettingsFocusRequest
}: ControllerFeedbackPageProps) {
  const {
    hapticsValue,
    setHapticsValue,
    classicRumbleValue,
    setClassicRumbleValue,
    showClassicRumbleControl,
    setShowClassicRumbleControl,
    testLocked,
    hapticsCommitPending,
    classicRumbleV1CommitPending,
    feedbackBoostCommitPending,
    hapticsEditingRef,
    classicRumbleEditingRef,
    classicRumbleV1Enabled,
    activeHapticsFeatureEnabled,
    controllerPowerSavingActive,
    feedbackBoostEnabled,
    hapticsSliderMax,
    hapticsSliderTicks,
    activeFeedbackTestUnavailable,
    activeFeedbackStatusLabel,
    activeFeedbackStatusTone,
    commitHapticsValue,
    commitClassicRumbleValue,
    setHapticsPreset,
    setClassicRumblePreset,
    runFeedbackTest,
    stopFeedbackTest,
    toggleHapticsEnabled,
    toggleClassicRumbleEnabled,
    toggleClassicRumbleV1Enabled,
    toggleFeedbackBoostEnabled
  } = feedback;
  const {
    sourceKey: audioReactiveHapticsSourceKey,
    enabled: audioReactiveHapticsEnabled,
    sessionsLoading: audioHapticsSessionsLoading,
    sessionByKey: audioHapticsSessionByKey,
    selectedSourceDisplayName: selectedAudioHapticsSourceDisplayName,
    sourceOptions: audioHapticsSourceOptions,
    controlDisabled: audioReactiveHapticsControlDisabled,
    configDisabled: audioReactiveHapticsConfigDisabled,
    statusLabel: audioReactiveHapticsStatusLabel,
    statusTone: audioReactiveHapticsStatusTone,
    overrideMode: audioReactiveHapticsOverrideMode,
    modeBadgeLabel: audioReactiveHapticsModeBadgeLabel,
    modeTooltip: audioReactiveHapticsModeTooltip,
    toggleEnabled: toggleAudioReactiveHapticsEnabled,
    setMode: setAudioReactiveHapticsMode,
    setSourceValue: setAudioReactiveHapticsSourceValue,
    setBassFocus: setAudioReactiveHapticsBassFocus,
    setResponse: setAudioReactiveHapticsResponse,
    setAttack: setAudioReactiveHapticsAttack,
    setRelease: setAudioReactiveHapticsRelease
  } = lab;

  return (
    <div
      className={`control-page haptics-page ${active ? 'active' : ''}`}
      role="tabpanel"
      id="control-panel-haptics"
      aria-labelledby={audioHapticsOpen ? 'control-tab-audio-haptics' : 'control-tab-haptics'}
      aria-hidden={!active}
    >
        <div className="feature-heading">
          <div>
            <h2>{audioHapticsOpen ? 'Audio Haptics' : 'Haptics'}</h2>
            <p>{audioHapticsOpen ? 'Turn system audio into haptic feedback.' : 'Adjust controller haptic feedback and run a quick test.'}</p>
          </div>
          <div className="audio-heading-controls">
            {audioReactiveHapticsModeBadgeLabel ? (
              <div className="inline-switch audio-haptics-mode-indicator">
                <span className={`inline-state-badge audio-haptics-mode-state ${audioReactiveHapticsOverrideMode ? 'warn' : 'retry'}`}>
                  {audioReactiveHapticsModeBadgeLabel}
                </span>
                <span className="settings-shortcut-tooltip shortcut-glyph-tooltip audio-haptics-mode-tooltip">
                  {audioReactiveHapticsModeTooltip}
                </span>
              </div>
            ) : null}
            <div className="inline-switch">
              <span>Enabled</span>
              <button
                type="button"
                role="switch"
                aria-checked={audioHapticsOpen ? audioReactiveHapticsEnabled : activeHapticsFeatureEnabled}
                className={`switch ${(audioHapticsOpen ? audioReactiveHapticsEnabled : activeHapticsFeatureEnabled) ? 'on' : ''}`}
                disabled={audioHapticsOpen
                  ? audioReactiveHapticsControlDisabled
                  : !controllerControlsAvailable || pendingAction !== null}
                onClick={audioHapticsOpen
                  ? () => void toggleAudioReactiveHapticsEnabled()
                  : showClassicRumbleControl ? toggleClassicRumbleEnabled : toggleHapticsEnabled}
              >
                <span />
              </button>
            </div>
          </div>
        </div>
        {audioHapticsOpen ? (
          <div className="feature-card-grid audio-haptics-grid">
            <section className="feature-card audio-haptics-card">
              <div className="feature-card-title">
                <button
                  type="button"
                  className={`feature-icon audio-haptics-enable-button icon-compact ${audioReactiveHapticsEnabled ? 'active' : ''}`}
                  aria-pressed={audioReactiveHapticsEnabled}
                  aria-label={audioReactiveHapticsEnabled ? 'Disable audio haptics' : 'Enable audio haptics'}
                  title={audioReactiveHapticsStatusLabel}
                  disabled={audioReactiveHapticsControlDisabled}
                  onClick={() => void toggleAudioReactiveHapticsEnabled()}
                >
                  <IconDeviceAudioTape size={20} />
                </button>
                <div className="title-copy">
                  <h3>Audio Haptics</h3>
                  <p>System audio feedback</p>
                </div>
              </div>
              <div className="framed-slider">
                <label className="slider-row">
                  <span>0%</span>
                  <div className="range-control">
                    <input
                      type="range"
                      min="0"
                      max={hapticsSliderMax}
                      step={HAPTICS_STEP}
                      value={hapticsValue}
                      disabled={!connected || !snapshot.settings.hapticsEnabled || hapticsCommitPending}
                      style={{ '--range-fill': `${(hapticsValue / hapticsSliderMax) * 100}%` } as CSSProperties}
                      aria-label="Haptics gain"
                      onPointerDown={() => {
                        hapticsEditingRef.current = true;
                      }}
                      onChange={(event) => setHapticsValue(snapHapticsValue(
                        Number(event.currentTarget.value),
                        hapticsSliderMax
                      ))}
                      onPointerUp={() => void commitHapticsValue()}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                          hapticsEditingRef.current = true;
                        }
                      }}
                      onKeyUp={(event) => {
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                          void commitHapticsValue();
                        }
                      }}
                      onBlur={() => void commitHapticsValue()}
                    />
                    <div className="range-ticks" aria-hidden="true">
                      {hapticsSliderTicks.map((value) => (
                        <span key={value} className={sliderTickClass(value, hapticsSliderMax)} />
                      ))}
                    </div>
                  </div>
                  <strong>{hapticsValue}%</strong>
                </label>
              </div>
              <span className="audio-haptics-slider-spacer" aria-hidden="true" />
              <div className="segmented-row">
                {HAPTICS_PRESETS.map(([label, value]) => {
                  const presetValue = snapHapticsValue(Number(value), hapticsSliderMax);
                  return (
                    <button
                      key={label}
                      type="button"
                      className={hapticsValue === presetValue ? 'active' : ''}
                      disabled={!connected || !snapshot.settings.hapticsEnabled || hapticsCommitPending}
                      onClick={() => setHapticsPreset(presetValue)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="audio-haptics-routing-stack">
                <label className="audio-haptics-source-field">
                  <CustomSelect
                    value={audioReactiveHapticsSourceKey}
                    options={audioHapticsSourceOptions}
                    disabled={audioReactiveHapticsConfigDisabled}
                    className="audio-haptics-source-select"
                    ariaLabel="Audio haptics source"
                    renderValue={(label, value) => (
                      <AudioHapticsSourceOption
                        label={label}
                        value={value}
                        session={audioHapticsSessionByKey.get(value)}
                        loading={audioHapticsSessionsLoading}
                      />
                    )}
                    renderOption={(label, value) => (
                      <AudioHapticsSourceOption
                        label={label}
                        value={value}
                        session={audioHapticsSessionByKey.get(value)}
                        loading={audioHapticsSessionsLoading}
                      />
                    )}
                    onChange={setAudioReactiveHapticsSourceValue}
                  />
                </label>
                <div className="dual-selector audio-haptics-mode-selector" role="tablist" aria-label="Audio haptics mode">
                  {AUDIO_REACTIVE_HAPTICS_MODE_OPTIONS.map(([label, mode]) => (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={snapshot.settings.audioReactiveHapticsMode === mode}
                      className={snapshot.settings.audioReactiveHapticsMode === mode ? 'active' : ''}
                      disabled={audioReactiveHapticsConfigDisabled}
                      onClick={() => setAudioReactiveHapticsMode(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
            <section className="feature-card audio-haptics-card audio-haptics-response-card">
              <div className="feature-card-title">
                <span className="feature-icon"><IconBrandDeezer size={20} /></span>
                <div className="title-copy">
                  <h3>Response</h3>
                  <p>Frequency focus and strength</p>
                </div>
              </div>
              <div className="audio-haptics-config-stack">
                <div className="audio-haptics-config-pair-row">
                  <label>
                    <AudioHapticsConfigLabel
                      id="audio-haptics-bass-focus-tooltip"
                      label="Bass Focus"
                      tooltip={AUDIO_REACTIVE_HAPTICS_FIELD_TOOLTIPS.bassFocus}
                    />
                    <CustomSelect
                      value={snapshot.settings.audioReactiveHapticsBassFocus}
                      options={AUDIO_REACTIVE_HAPTICS_BASS_FOCUS_OPTIONS}
                      disabled={audioReactiveHapticsConfigDisabled}
                      className="audio-haptics-select"
                      ariaLabel="Audio haptics bass focus"
                      onChange={setAudioReactiveHapticsBassFocus}
                    />
                  </label>
                  <label>
                    <AudioHapticsConfigLabel
                      id="audio-haptics-response-tooltip"
                      label="Response"
                      tooltip={AUDIO_REACTIVE_HAPTICS_FIELD_TOOLTIPS.response}
                    />
                    <CustomSelect
                      value={snapshot.settings.audioReactiveHapticsResponse}
                      options={AUDIO_REACTIVE_HAPTICS_RESPONSE_OPTIONS}
                      disabled={audioReactiveHapticsConfigDisabled}
                      className="audio-haptics-select"
                      ariaLabel="Audio haptics response"
                      onChange={setAudioReactiveHapticsResponse}
                    />
                  </label>
                </div>
                <div className="audio-haptics-config-pair-row">
                  <label>
                    <AudioHapticsConfigLabel
                      id="audio-haptics-attack-tooltip"
                      label="Ramp"
                      tooltip={AUDIO_REACTIVE_HAPTICS_FIELD_TOOLTIPS.attack}
                    />
                    <CustomSelect
                      value={snapshot.settings.audioReactiveHapticsAttack}
                      options={AUDIO_REACTIVE_HAPTICS_ATTACK_OPTIONS}
                      disabled={audioReactiveHapticsConfigDisabled}
                      className="audio-haptics-select"
                      ariaLabel="Audio haptics attack"
                      onChange={setAudioReactiveHapticsAttack}
                    />
                  </label>
                  <label>
                    <AudioHapticsConfigLabel
                      id="audio-haptics-release-tooltip"
                      label="Fade"
                      tooltip={AUDIO_REACTIVE_HAPTICS_FIELD_TOOLTIPS.release}
                    />
                    <CustomSelect
                      value={snapshot.settings.audioReactiveHapticsRelease}
                      options={AUDIO_REACTIVE_HAPTICS_RELEASE_OPTIONS}
                      disabled={audioReactiveHapticsConfigDisabled}
                      className="audio-haptics-select"
                      ariaLabel="Audio haptics release"
                      onChange={setAudioReactiveHapticsRelease}
                    />
                  </label>
                </div>
              </div>
              <div className="feature-status test-status audio-haptics-status">
                <span className={`status-badge ${audioReactiveHapticsStatusTone}`} title={audioReactiveHapticsStatusLabel}>
                  <span className={`dot ${audioReactiveHapticsStatusTone}`} />
                  <strong>{audioReactiveHapticsStatusLabel}</strong>
                </span>
                <span className={`status-badge ${audioReactiveHapticsStatusTone}`} title={audioReactiveHapticsSourceKey === 'system-audio' ? 'Using the mixed Windows output.' : 'Using the selected app audio session.'}>
                  <span className={`dot ${audioReactiveHapticsEnabled ? audioReactiveHapticsStatusTone : 'idle'}`} />
                  <strong>{selectedAudioHapticsSourceDisplayName}</strong>
                </span>
              </div>
            </section>
          </div>
        ) : (
        <div className="feature-card-grid">
          <section className="feature-card preset-card">
            <div className="feature-card-title">
              <button
                type="button"
                className={`feature-icon haptics-enable-button ${showClassicRumbleControl ? 'icon-medium' : 'icon-compact'} ${activeHapticsFeatureEnabled ? 'active' : ''} ${controllerPowerSavingActive && activeHapticsFeatureEnabled ? 'power-saving-active' : ''}`}
                aria-pressed={activeHapticsFeatureEnabled}
                aria-label={showClassicRumbleControl ? 'Enable rumble' : 'Enable haptics'}
                title={showClassicRumbleControl ? 'Enable rumble' : 'Enable haptics'}
                disabled={!controllerControlsAvailable || pendingAction !== null}
                onClick={showClassicRumbleControl ? toggleClassicRumbleEnabled : toggleHapticsEnabled}
              >
                {showClassicRumbleControl ? <Vibrate size={20} /> : <Sparkles size={20} />}
              </button>
              <div className="title-copy">
                <h3>{showClassicRumbleControl ? 'Rumble' : 'Intensity'}</h3>
                <p>{showClassicRumbleControl ? 'Rumble Strength' : 'Haptic Strength'}</p>
              </div>
              <div className="dual-selector haptics-mode-selector" role="tablist" aria-label="Haptics control mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!showClassicRumbleControl}
                  className={!showClassicRumbleControl ? 'active' : ''}
                  onClick={() => setShowClassicRumbleControl(false)}
                >
                  Haptics
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={showClassicRumbleControl}
                  className={showClassicRumbleControl ? 'active' : ''}
                  onClick={() => setShowClassicRumbleControl(true)}
                >
                  Rumble
                </button>
              </div>
            </div>
            <div className="framed-slider">
              <label className="slider-row">
                <span>0%</span>
                <div className="range-control">
                  {showClassicRumbleControl ? (
                    <input
                      type="range"
                      min="0"
                      max={hapticsSliderMax}
                      step={HAPTICS_STEP}
                      value={classicRumbleValue}
                      disabled={!connected || !snapshot.settings.classicRumbleEnabled}
                      style={{ '--range-fill': `${(classicRumbleValue / hapticsSliderMax) * 100}%` } as CSSProperties}
                      onPointerDown={() => {
                        classicRumbleEditingRef.current = true;
                      }}
                      onChange={(event) => setClassicRumbleValue(snapHapticsValue(
                        Number(event.currentTarget.value),
                        hapticsSliderMax
                      ))}
                      onPointerUp={() => void commitClassicRumbleValue()}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                          classicRumbleEditingRef.current = true;
                        }
                      }}
                      onKeyUp={(event) => {
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                          void commitClassicRumbleValue();
                        }
                      }}
                      onBlur={() => void commitClassicRumbleValue()}
                    />
                  ) : (
                    <input
                      type="range"
                      min="0"
                      max={hapticsSliderMax}
                      step={HAPTICS_STEP}
                      value={hapticsValue}
                      disabled={!connected || !snapshot.settings.hapticsEnabled}
                      style={{ '--range-fill': `${(hapticsValue / hapticsSliderMax) * 100}%` } as CSSProperties}
                      onPointerDown={() => {
                        hapticsEditingRef.current = true;
                      }}
                      onChange={(event) => setHapticsValue(snapHapticsValue(
                        Number(event.currentTarget.value),
                        hapticsSliderMax
                      ))}
                      onPointerUp={() => void commitHapticsValue()}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                          hapticsEditingRef.current = true;
                        }
                      }}
                      onKeyUp={(event) => {
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                          void commitHapticsValue();
                        }
                      }}
                      onBlur={() => void commitHapticsValue()}
                    />
                  )}
                  <div className="range-ticks" aria-hidden="true">
                    {hapticsSliderTicks.map((value) => (
                      <span key={value} className={sliderTickClass(value, hapticsSliderMax)} />
                    ))}
                  </div>
                </div>
                <strong>{showClassicRumbleControl ? classicRumbleValue : hapticsValue}%</strong>
              </label>
            </div>
            <div className="segmented-row">
              {HAPTICS_PRESETS.map(([label, value]) => {
                const presetValue = snapHapticsValue(Number(value), hapticsSliderMax);
                const currentValue = showClassicRumbleControl ? classicRumbleValue : hapticsValue;
                return (
                  <button
                    key={label}
                    type="button"
                    className={currentValue === presetValue ? 'active' : ''}
                    disabled={
                      !connected
                      || (showClassicRumbleControl ? !snapshot.settings.classicRumbleEnabled : !snapshot.settings.hapticsEnabled)
                    }
                    onClick={() => (
                      showClassicRumbleControl
                        ? setClassicRumblePreset(presetValue)
                        : setHapticsPreset(presetValue)
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div
              className="inline-switch feedback-boost-control haptics-boost-control"
              title={feedbackBoostEnabled ? 'Feedback boost: up to 500%' : 'Enable feedback boost up to 500%'}
            >
              <span className="feedback-boost-label">
                <IconFlame size={16} aria-hidden="true" />
                Boost
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={feedbackBoostEnabled}
                aria-label={feedbackBoostEnabled ? 'Disable feedback boost' : 'Enable feedback boost'}
                className={`switch ${feedbackBoostEnabled ? 'on' : ''}`}
                disabled={!connected || pendingAction !== null || feedbackBoostCommitPending}
                onClick={toggleFeedbackBoostEnabled}
              >
                <span />
              </button>
            </div>
            {showClassicRumbleControl ? (
              <div
                className="inline-switch feedback-boost-control haptics-rumble-v1-control"
                title={classicRumbleV1Enabled ? 'Classic rumble: v1 compatibility mode' : 'Classic rumble: v2 default mode'}
              >
                <span className="feedback-boost-label">v1 Rumble</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={classicRumbleV1Enabled}
                  aria-label={classicRumbleV1Enabled ? 'Disable v1 rumble mode' : 'Enable v1 rumble mode'}
                  className={`switch ${classicRumbleV1Enabled ? 'on' : ''}`}
                  disabled={!connected || pendingAction !== null || classicRumbleV1CommitPending}
                  onClick={toggleClassicRumbleV1Enabled}
                >
                  <span />
                </button>
              </div>
            ) : null}
          </section>
          <section className="feature-card test-card">
            <div className="feature-card-title">
              <span className="feature-icon"><IconTestPipe size={20} /></span>
              <div className="title-copy">
                <h3>Testing</h3>
                <p>Run a short test to feel the current settings.</p>
              </div>
            </div>
            <button className="primary-action" type="button" disabled={activeFeedbackTestUnavailable} onClick={runFeedbackTest}>
              <Play size={15} />
              {showClassicRumbleControl
                ? connected && testLocked
                  ? 'Testing'
                  : 'Test Rumble'
              : connected && testLocked
                  ? 'Testing'
                : connected && snapshot.status?.testHapticsCooldown
                  ? 'Cooling Down'
                  : 'Test Haptics'}
            </button>
            <button className="secondary-action" type="button" disabled={!testLocked} onClick={stopFeedbackTest}>
              <span className="stop-glyph" aria-hidden="true" />
              Stop Test
            </button>
            <div className={`feature-status test-status ${activeFeedbackStatusTone}`}>
              <span className="status-badge">
                <span className={`dot ${activeFeedbackStatusTone}`} />
                <strong>{activeFeedbackStatusLabel}</strong>
              </span>
            </div>
          </section>
        </div>
        )}
        <FeatureTipsPanel tab="haptics" onSettingsFocusRequest={onSettingsFocusRequest} audioHapticsOpen={audioHapticsOpen} />
    </div>
  );
}
