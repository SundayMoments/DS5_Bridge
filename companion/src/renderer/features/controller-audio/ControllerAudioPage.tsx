import type { CSSProperties } from 'react';
import {
  IconAlertHexagon,
  IconAlertTriangle,
  IconCircleCheck,
  IconMicrophone as Mic,
  IconMicrophoneOff as MicOff,
  IconPlayerPlay as Play,
  IconTestPipe,
  IconVolumeOff as VolumeX
} from '@tabler/icons-react';
import type { BridgeSnapshot } from '@shared/types';
import { FeatureTipsPanel } from '../../common/FeatureTipsPanel';
import { PERCENT_SLIDER_TICKS, sliderTickClass } from '../../common/slider-ticks';
import { InlineSelect as CustomSelect } from '../../components/InlineSelect';
import { AudioHapticsConfigLabel } from '../../common/AudioHapticsConfigLabel';
import { stopMicLiveListen } from './audio-playback';
import type { ControllerAudioController } from './use-controller-audio-controller';
import { AUDIO_BUFFER_LENGTH_MAX, AUDIO_BUFFER_LENGTH_MIN, MIC_VOLUME_PRESETS, MIC_VOLUME_STEP, SPEAKER_GAIN_OPTIONS, SPEAKER_VOLUME_PRESETS, SPEAKER_VOLUME_STEP, audioBufferDelayLabel, audioBufferPercent, audioBufferZoneLabel, audioBufferZoneTone, audioBufferZoneTooltip, clampAudioBufferLength, snapMicVolume, snapSpeakerVolume } from './model';

export interface ControllerAudioPageProps {
  readonly active: boolean;
  readonly controller: ControllerAudioController;
  readonly snapshot: BridgeSnapshot;
  readonly connected: boolean;
  readonly controllerControlsAvailable: boolean;
  readonly pendingAction: string | null;
}

export function ControllerAudioPage({
  active,
  controller,
  snapshot,
  connected,
  controllerControlsAvailable,
  pendingAction
}: ControllerAudioPageProps) {
  const activeControlTab = active ? 'audio' : '';
  const {
    speakerVolumeSupported,
    speakerVolumeValue,
    setSpeakerVolumeValue,
    micVolumeValue,
    setMicVolumeValue,
    audioBufferLengthValue,
    setAudioBufferLengthValue,
    showMicrophoneControl,
    setShowMicrophoneControl,
    speakerTestLocked,
    setSpeakerTestLocked,
    micTestLocked,
    micTestError,
    speakerVolumeCommitPending,
    micVolumeCommitPending,
    speakerVolumeEditingRef,
    micVolumeEditingRef,
    audioBufferLengthEditingRef,
    speakerGainLevel,
    gameStreamActive,
    OutputIcon,
    outputControlLabel,
    outputControlLower,
    duplexMicEnabled,
    audioEnabled,
    audioPathLabel,
    audioPathTooltip,
    audioPathTone,
    audioBufferLengthControlDisabled,
    duplexMicLabel,
    speakerOutputMissing,
    activeAudioTestUnavailable,
    activeAudioTestLocked,
    activeAudioTestStatusLabel,
    activeAudioTestStatusTone,
    commitSpeakerVolume,
    setSpeakerPreset,
    setSpeakerGainLevel,
    commitMicVolume,
    setMicPreset,
    commitAudioBufferLength,
    runTestSpeaker,
    runTestMic,
    toggleSpeakerEnabled,
    toggleAudioEnabled,
    toggleDuplexMicEnabled,
    toggleMicMute
  } = controller;
  // Whole sentences per output so each language can phrase them naturally.
  const headphones = outputControlLower === 'headphones';

  return (
    <div
      className={`control-page audio-page ${active ? 'active' : ''}`}
      role="tabpanel"
      id="control-panel-audio"
      aria-labelledby="control-tab-audio"
      aria-hidden={!active}
    >
        <div className="feature-heading">
          <div>
            <h2>Audio</h2>
            <p>{headphones ? 'Adjust controller headphones and microphone levels.' : 'Adjust controller speaker and microphone levels.'}</p>
          </div>
          <div className="audio-heading-actions">
            <div className="chords-field chords-inline-field audio-speaker-gain-field">
              <span>Speaker Gain</span>
              <CustomSelect
                value={speakerGainLevel}
                options={SPEAKER_GAIN_OPTIONS}
                disabled={!controllerControlsAvailable || !speakerVolumeSupported || pendingAction !== null}
                ariaLabel="Speaker gain"
                className="audio-speaker-gain-select"
                closeOnSelect={true}
                onChange={setSpeakerGainLevel}
                renderValue={(_label, value) => (
                  <span>{value}</span>
                )}
                renderOption={(label) => (
                  <span className="speaker-gain-option">
                    <strong>{label}</strong>
                  </span>
                )}
              />
            </div>
            <div className="audio-heading-controls">
              <div className="inline-switch">
                <span>Enabled</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={audioEnabled}
                  aria-label="Enable audio"
                  className={`switch ${audioEnabled ? 'on' : ''}`}
                  disabled={!controllerControlsAvailable || pendingAction !== null}
                  onClick={toggleAudioEnabled}
                >
                  <span />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="feature-card-grid">
          <section className="feature-card preset-card">
            <div className="feature-card-title">
              <button
                type="button"
                className={`feature-icon audio-enable-button icon-medium ${
                  showMicrophoneControl
                    ? duplexMicEnabled
                      ? 'active'
                      : ''
                    : snapshot.settings.speakerEnabled
                      ? 'active'
                      : ''
                }`}
                aria-pressed={showMicrophoneControl ? duplexMicEnabled : snapshot.settings.speakerEnabled}
                aria-label={showMicrophoneControl ? duplexMicLabel : headphones ? 'Enable controller headphones' : 'Enable controller speaker'}
                title={showMicrophoneControl ? duplexMicLabel : headphones ? 'Enable controller headphones' : 'Enable controller speaker'}
                disabled={
                  showMicrophoneControl
                    ? !controllerControlsAvailable || pendingAction !== null
                    : !controllerControlsAvailable || !speakerVolumeSupported || pendingAction !== null
                }
                onClick={showMicrophoneControl ? toggleDuplexMicEnabled : toggleSpeakerEnabled}
              >
                {showMicrophoneControl ? <Mic size={20} /> : <OutputIcon size={20} />}
              </button>
              <div className="title-copy">
                <h3>{showMicrophoneControl ? 'Microphone' : outputControlLabel}</h3>
                <p>
                  {showMicrophoneControl
                    ? 'Microphone level'
                    : headphones ? 'Headphones level' : 'Speaker level'}
                </p>
              </div>
              <div className="dual-selector audio-mode-selector" role="tablist" aria-label="Audio control mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!showMicrophoneControl}
                  className={!showMicrophoneControl ? 'active' : ''}
                  onClick={() => setShowMicrophoneControl(false)}
                >
                  {outputControlLabel}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={showMicrophoneControl}
                  className={showMicrophoneControl ? 'active' : ''}
                  onClick={() => setShowMicrophoneControl(true)}
                >
                  Mic
                </button>
              </div>
            </div>
            <div className="framed-slider">
              <label className="slider-row">
                <span>0%</span>
                <div className="range-control">
                  {showMicrophoneControl ? (
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step={MIC_VOLUME_STEP}
                      value={micVolumeValue}
                      disabled={!connected || !duplexMicEnabled || micVolumeCommitPending}
                      style={{ '--range-fill': `${micVolumeValue}%` } as CSSProperties}
                      aria-label="Microphone level"
                      onPointerDown={() => {
                        micVolumeEditingRef.current = true;
                      }}
                      onChange={(event) => setMicVolumeValue(snapMicVolume(Number(event.currentTarget.value)))}
                      onPointerUp={() => void commitMicVolume()}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                          micVolumeEditingRef.current = true;
                        }
                      }}
                      onKeyUp={(event) => {
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                          void commitMicVolume();
                        }
                      }}
                      onBlur={() => void commitMicVolume()}
                    />
                  ) : (
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step={SPEAKER_VOLUME_STEP}
                      value={speakerVolumeValue}
                      disabled={!connected || !speakerVolumeSupported || !snapshot.settings.speakerEnabled}
                      style={{ '--range-fill': `${speakerVolumeValue}%` } as CSSProperties}
                      onPointerDown={() => {
                        speakerVolumeEditingRef.current = true;
                      }}
                      onChange={(event) => setSpeakerVolumeValue(snapSpeakerVolume(Number(event.currentTarget.value)))}
                      onPointerUp={() => void commitSpeakerVolume()}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                          speakerVolumeEditingRef.current = true;
                        }
                      }}
                      onKeyUp={(event) => {
                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                          void commitSpeakerVolume();
                        }
                      }}
                      onBlur={() => void commitSpeakerVolume()}
                    />
                  )}
                  <div className="range-ticks" aria-hidden="true">
                    {PERCENT_SLIDER_TICKS.map((value) => (
                      <span key={value} className={sliderTickClass(value, 100)} />
                    ))}
                  </div>
                </div>
                <strong>{showMicrophoneControl ? micVolumeValue : speakerVolumeValue}%</strong>
              </label>
            </div>
            {showMicrophoneControl ? (
              <>
                <div className="segmented-row">
                  {MIC_VOLUME_PRESETS.map(([label, value]) => (
                    <button
                      key={label}
                      type="button"
                      className={micVolumeValue === value ? 'active' : ''}
                      disabled={!connected || !duplexMicEnabled || micVolumeCommitPending}
                      onClick={() => setMicPreset(Number(value))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mic-option-grid">
                  <button
                    type="button"
                    className={snapshot.settings.micMuted ? 'active danger' : ''}
                    aria-pressed={snapshot.settings.micMuted}
                    disabled={!connected || !duplexMicEnabled || pendingAction !== null}
                    onClick={toggleMicMute}
                  >
                    <VolumeX size={15} />
                    Mute
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="segmented-row">
                  {SPEAKER_VOLUME_PRESETS.map(([label, value]) => (
                    <button
                      key={label}
                      type="button"
                      className={speakerVolumeValue === value ? 'active' : ''}
                      disabled={!connected || !speakerVolumeSupported || !snapshot.settings.speakerEnabled || speakerVolumeCommitPending}
                      onClick={() => setSpeakerPreset(Number(value))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="audio-secondary-controls">
                  <div
                    className={`audio-buffer-control framed-slider ${audioBufferLengthControlDisabled ? 'disabled' : ''}`}
                    style={{ '--range-fill': `${audioBufferPercent(audioBufferLengthValue)}%` } as CSSProperties}
                  >
                    <div className="audio-buffer-header">
                      <AudioHapticsConfigLabel
                        id="audio-buffer-length-tooltip"
                        label="Audio Buffer Length"
                        tooltip="Sets the DualSense audio buffer value. Lower values reduce haptic delay but increase stutter risk; higher values improve speaker stability at the cost of latency."
                        className="audio-buffer-title"
                      />
                      <div className="audio-buffer-readout">
                        <strong>{audioBufferLengthValue}</strong>
                        <span>{audioBufferDelayLabel(audioBufferLengthValue)}</span>
                      </div>
                      <div
                        className={`audio-buffer-status-icon ${audioBufferZoneTone(audioBufferLengthValue)}`}
                        aria-label={audioBufferZoneLabel(audioBufferLengthValue)}
                        aria-describedby="audio-buffer-zone-tooltip"
                        tabIndex={0}
                      >
                        {audioBufferZoneTone(audioBufferLengthValue) === 'safe' && (
                          <IconCircleCheck size={18} stroke={2.35} aria-hidden="true" />
                        )}
                        {audioBufferZoneTone(audioBufferLengthValue) === 'risky' && (
                          <IconAlertTriangle size={18} stroke={2.35} aria-hidden="true" />
                        )}
                        {audioBufferZoneTone(audioBufferLengthValue) === 'stutter' && (
                          <IconAlertHexagon size={18} stroke={2.35} aria-hidden="true" />
                        )}
                        <span
                          id="audio-buffer-zone-tooltip"
                          className="settings-shortcut-tooltip shortcut-glyph-tooltip audio-buffer-zone-tooltip"
                          role="tooltip"
                        >
                          {audioBufferZoneTooltip(audioBufferLengthValue)}
                        </span>
                      </div>
                    </div>
                    <label className="audio-slider-row audio-buffer-slider-row">
                      <div className="range-control audio-buffer-range-control">
                        <input
                          type="range"
                          min={AUDIO_BUFFER_LENGTH_MIN}
                          max={AUDIO_BUFFER_LENGTH_MAX}
                          step="1"
                          value={audioBufferLengthValue}
                          aria-label="Audio buffer length"
                          aria-valuetext={`${audioBufferLengthValue}, ${audioBufferDelayLabel(audioBufferLengthValue)}, ${audioBufferZoneLabel(audioBufferLengthValue)}`}
                          disabled={audioBufferLengthControlDisabled}
                          onPointerDown={() => {
                            audioBufferLengthEditingRef.current = true;
                          }}
                          onPointerCancel={() => void commitAudioBufferLength()}
                          onChange={(event) => {
                            audioBufferLengthEditingRef.current = true;
                            setAudioBufferLengthValue(clampAudioBufferLength(Number(event.currentTarget.value)));
                          }}
                          onPointerUp={() => void commitAudioBufferLength()}
                          onKeyDown={(event) => {
                            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                              audioBufferLengthEditingRef.current = true;
                            }
                          }}
                          onKeyUp={(event) => {
                            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                              void commitAudioBufferLength();
                            }
                          }}
                          onBlur={() => void commitAudioBufferLength()}
                        />
                      </div>
                    </label>
                  </div>
                </div>
              </>
            )}
          </section>
          <section className="feature-card test-card">
            <div className="feature-card-title">
              <span className="feature-icon"><IconTestPipe size={20} /></span>
              <div className="title-copy">
                <h3>Testing</h3>
                <p>{showMicrophoneControl ? 'Listen to the controller microphone for five seconds.' : headphones ? 'Play a short sample through the controller headphones.' : 'Play a short sample through the controller speaker.'}</p>
              </div>
            </div>
            <button
              className="primary-action"
              type="button"
              disabled={activeAudioTestUnavailable}
              onClick={showMicrophoneControl ? runTestMic : runTestSpeaker}
            >
              {showMicrophoneControl ? <Mic size={15} /> : <Play size={15} />}
              {showMicrophoneControl
                ? connected && micTestLocked
                  ? 'Live Listening'
                  : connected && micTestError
                    ? 'Retry Mic'
                    : 'Test Mic'
                : connected && speakerTestLocked
                  ? 'Playing Tone'
                  : connected && gameStreamActive
                    ? 'Game Active'
                  : connected && speakerOutputMissing
                      ? headphones ? 'Retry Headphones' : 'Retry Speaker'
                    : headphones ? 'Test Headphones' : 'Test Speaker'}
            </button>
            <button
              className="secondary-action"
              type="button"
              disabled={!activeAudioTestLocked}
              onClick={showMicrophoneControl ? stopMicLiveListen : () => setSpeakerTestLocked(false)}
            >
              <span className="stop-glyph" aria-hidden="true" />
              Stop Test
            </button>
            <div className="feature-status test-status audio-test-status">
              <span className={`status-badge ${activeAudioTestStatusTone}`} title={activeAudioTestStatusLabel}>
                <span className={`dot ${activeAudioTestStatusTone}`} />
                <strong>{activeAudioTestStatusLabel}</strong>
              </span>
              <span className={`status-badge ${audioPathTone}`} title={audioPathTooltip}>
                <span className={`dot ${audioPathTone}`} />
                <strong>{audioPathLabel}</strong>
              </span>
            </div>
          </section>
        </div>
        <FeatureTipsPanel tab="audio" />
    </div>
  );
}
