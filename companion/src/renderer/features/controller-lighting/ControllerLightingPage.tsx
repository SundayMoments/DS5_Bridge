import type { CSSProperties, ReactNode } from 'react';
import { IconBulb, IconPalette as Palette } from '@tabler/icons-react';
import type { BridgeSnapshot } from '@shared/types';
import { PERCENT_SLIDER_TICKS, sliderTickClass } from '../../common/slider-ticks';
import {
  LIGHTBAR_BRIGHTNESS_STEP,
  LIGHTBAR_CUSTOM_PALETTE,
  LIGHTBAR_PRESETS,
  LIGHTBAR_SWATCHES,
  lightbarColorName,
  normalizeHexColor,
  snapLightbarBrightness
} from './model';
import type { ControllerLightingController } from './use-controller-lighting-controller';

export interface ControllerLightingPageProps {
  readonly active: boolean;
  /** The DualSense section strip, above the page header. */
  readonly navigation?: ReactNode;
  readonly controller: ControllerLightingController;
  readonly snapshot: BridgeSnapshot;
  readonly connected: boolean;
  readonly controllerControlsAvailable: boolean;
  readonly pendingAction: string | null;
}

export function ControllerLightingPage({
  active,
  navigation,
  controller,
  snapshot,
  connected,
  controllerControlsAvailable,
  pendingAction
}: ControllerLightingPageProps) {
  const {
    lightbarSupported,
    lightbarOverrideSupported,
    controllerPowerSavingActive,
    percentSliderMax,
    lightbarColor,
    customLightbarColor,
    customColorDraft,
    showCustomColorPicker,
    customSwatchPrimed,
    lightbarBrightnessValue,
    setLightbarBrightnessValue,
    lightbarBrightnessEditingRef,
    customColorPickerRef,
    lightbarStateActive,
    lightbarStateLabel,
    normalizedLightbarColor,
    customSwatchColor,
    customSwatchSelected,
    customColorPickerDisabled,
    commitLightbar,
    selectLightbarColor,
    saveCustomLightbarColor,
    previewCustomLightbarColor,
    selectCustomLightbarColor,
    openCustomLightbarPicker,
    setLightbarPreset,
    toggleLightbarEnabled,
    toggleLightbarOverride
  } = controller;

  return (
    <div
      className={`control-page lighting-page ${active ? 'active' : ''}`}
      role="tabpanel"
      id="control-panel-lighting"
      aria-labelledby="control-tab-dualsense"
      aria-hidden={!active}
    >
        {navigation}
        <div className="feature-heading studio-feature-heading">
          <div className="studio-heading-copy">
            <button
              type="button"
              className={`feature-icon lighting-enable-button icon-large ${snapshot.settings.lightbarEnabled ? 'active' : ''} ${controllerPowerSavingActive && snapshot.settings.lightbarEnabled ? 'power-saving-active' : ''}`}
              aria-pressed={snapshot.settings.lightbarEnabled}
              aria-label="Enable lighting"
              title="Enable lighting"
              disabled={!controllerControlsAvailable || !lightbarSupported || pendingAction !== null}
              onClick={toggleLightbarEnabled}
            >
              <IconBulb size={20} />
            </button>
            <div>
              <h2>Lighting</h2>
              <p>Customize the controller light bar and override behavior</p>
            </div>
          </div>
          <div className="inline-switch">
            <span>Enabled</span>
            <button
              type="button"
              role="switch"
              aria-checked={snapshot.settings.lightbarEnabled}
              className={`switch ${snapshot.settings.lightbarEnabled ? 'on' : ''}`}
              disabled={!controllerControlsAvailable || !lightbarSupported || pendingAction !== null}
              onClick={toggleLightbarEnabled}
            >
              <span />
            </button>
          </div>
        </div>
        <div className="feature-card-grid lighting-grid">
          <section className="feature-card preset-card">
            <div className="feature-card-title title-only">
              <div className="title-copy">
                <h3>Brightness</h3>
                <p>Set the controller light bar brightness</p>
              </div>
            </div>
            <div className="framed-slider">
              <label className="slider-row">
                <span>0%</span>
                <div className="range-control">
                  <input
                    type="range"
                    min="0"
                    max={percentSliderMax}
                    step={LIGHTBAR_BRIGHTNESS_STEP}
                    value={lightbarBrightnessValue}
                    disabled={!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled}
                    style={{ '--range-fill': `${(lightbarBrightnessValue / percentSliderMax) * 100}%` } as CSSProperties}
                    onPointerDown={() => {
                      lightbarBrightnessEditingRef.current = true;
                    }}
                    onChange={(event) => setLightbarBrightnessValue(snapLightbarBrightness(Number(event.currentTarget.value)))}
                    onPointerUp={() => void commitLightbar()}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                        lightbarBrightnessEditingRef.current = true;
                      }
                    }}
                    onKeyUp={(event) => {
                      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                        void commitLightbar();
                      }
                    }}
                    onBlur={() => void commitLightbar()}
                  />
                  <div className="range-ticks" aria-hidden="true">
                    {PERCENT_SLIDER_TICKS.map((value) => (
                      <span key={value} className={sliderTickClass(value, 100)} />
                    ))}
                  </div>
                </div>
                <strong>{lightbarBrightnessValue}%</strong>
              </label>
            </div>
            <div className="segmented-row">
              {LIGHTBAR_PRESETS.map(([label, value]) => (
                <button
                  key={label}
                  type="button"
                  className={lightbarBrightnessValue === value ? 'active' : ''}
                  disabled={!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled}
                  onClick={() => setLightbarPreset(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
          <section className="feature-card behavior-card">
            <div className="feature-card-title">
              <span className="feature-icon"><Palette size={20} /></span>
              <div className="title-copy">
                <h3>Behavior</h3>
                <p>Set light bar behavior</p>
              </div>
            </div>
            <div className="behavior-toggle-row">
              <div>
                <strong>Light Bar Override</strong>
                <p>Use app-controlled lighting instead of the default controller behavior</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={snapshot.settings.lightbarOverrideEnabled}
                className={`switch ${snapshot.settings.lightbarOverrideEnabled ? 'on' : ''}`}
                disabled={!connected || !lightbarOverrideSupported || !snapshot.settings.lightbarEnabled}
                onClick={toggleLightbarOverride}
              >
                <span />
              </button>
            </div>
            <div className="light-color-panel">
              <strong>Light Color</strong>
              <div className="behavior-swatches" aria-label="Light bar color">
                {LIGHTBAR_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={`${lightbarColorName(color)} ${color.toUpperCase()}`}
                    className={normalizedLightbarColor === color ? 'active' : ''}
                    style={{ '--swatch-color': color } as CSSProperties}
                    disabled={!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled}
                    onClick={() => selectLightbarColor(color)}
                  />
                ))}
                <div className="custom-color-anchor" ref={customColorPickerRef}>
                  <button
                    type="button"
                    className={`custom-color-swatch ${customSwatchSelected ? 'active' : ''} ${showCustomColorPicker ? 'picker-open' : ''} ${customSwatchPrimed && !customLightbarColor ? 'primed' : ''}`}
                    title={customLightbarColor ? `Custom ${customLightbarColor.toUpperCase()}` : 'Double-click to create a custom color'}
                    style={{ '--picker-color': customSwatchColor } as CSSProperties}
                    disabled={customColorPickerDisabled}
                    aria-pressed={customSwatchSelected}
                    onClick={selectCustomLightbarColor}
                    onDoubleClick={openCustomLightbarPicker}
                  >
                    <span className="custom-color-fill" aria-hidden="true" />
                    <Palette size={15} aria-hidden="true" />
                  </button>
                  {showCustomColorPicker && (
                    <div className="custom-color-popover" role="dialog" aria-label="Custom light bar color picker">
                      <div className="custom-color-popover-head">
                        <strong>Custom Color</strong>
                        <span>{customColorDraft.toUpperCase()}</span>
                      </div>
                      <div className="custom-color-palette" role="grid" aria-label="Custom color palette">
                        {LIGHTBAR_CUSTOM_PALETTE.map((row) => (
                          <div className="custom-color-palette-row" role="row" key={row[0].color}>
                            {row.map((cell) => (
                              <button
                                key={cell.color}
                                type="button"
                                role="gridcell"
                                className={normalizeHexColor(customColorDraft) === cell.color ? 'selected' : ''}
                                style={{ '--picker-color': cell.color } as CSSProperties}
                                title={`${cell.name} ${cell.color.toUpperCase()}`}
                                aria-label={`${cell.name} ${cell.color.toUpperCase()}`}
                                disabled={customColorPickerDisabled}
                                onClick={() => previewCustomLightbarColor(cell.color)}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="custom-color-picker-row">
                        <span
                          className="custom-color-preview"
                          style={{ '--picker-color': customColorDraft } as CSSProperties}
                          aria-hidden="true"
                        />
                        <code>{customColorDraft.toUpperCase()}</code>
                      </div>
                      <button
                        type="button"
                        className="custom-color-apply"
                        disabled={customColorPickerDisabled}
                        onClick={() => saveCustomLightbarColor(customColorDraft)}
                      >
                        Use Color
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="light-color-meta">
                <strong>{lightbarColorName(lightbarColor)}</strong>
                <span>{normalizedLightbarColor.toUpperCase()}</span>
              </div>
            </div>
            <div className="feature-status lighting-status">
              <span className={`status-badge ${lightbarStateActive ? 'good' : 'idle'}`}>
                <span className={`dot ${lightbarStateActive ? 'good' : 'idle'}`} />
                <strong>{lightbarStateLabel}</strong>
              </span>
            </div>
          </section>
        </div>
    </div>
  );
}
