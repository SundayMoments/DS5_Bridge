import { useEffect, useRef, useState } from 'react';
import type { BridgeSnapshot } from '@shared/types';
import type { AppRuntime } from '../../composition/app-runtime';
import {
  CONTROLLER_POWER_SAVING_CAP_PERCENT,
  capControllerPowerSavingValue,
  controllerPowerSavingActiveFromSnapshot
} from '../../common/controller-power-saving';
import {
  LIGHTBAR_DEFAULT_CUSTOM_COLOR,
  LIGHTBAR_SWATCHES,
  displayLightbarBrightnessValue,
  isLightbarPresetColor,
  lightbarColorFromSnapshot,
  normalizeHexColor,
  normalizeLightbarPresetColor,
  snapLightbarBrightness
} from './model';

/**
 * Light bar color, brightness, and the custom color picker. Brightness and
 * color are committed together; while power saving is active a capped value
 * never overwrites the saved brightness.
 */
export function useControllerLightingController(runtime: AppRuntime) {
  const { snapshot, connected, setSnapshot, runAction } = runtime;
  const lightbarSupported = Boolean(snapshot?.status?.firmwareFlags.lightbarControl);
  const lightbarOverrideSupported = Boolean(snapshot?.status?.firmwareFlags.lightbarOverrideControl);
  const lightbarEnabled = Boolean(snapshot?.settings.lightbarEnabled);
  const controllerPowerSavingActive = controllerPowerSavingActiveFromSnapshot(snapshot);
  const percentSliderMax = controllerPowerSavingActive ? CONTROLLER_POWER_SAVING_CAP_PERCENT : 100;
  const [lightbarColor, setLightbarColor] = useState('#ffff00');
  const [customLightbarColor, setCustomLightbarColor] = useState<string | null>(() => {
    const saved = window.localStorage.getItem('ds5bridge.customLightbarColor');
    if (!saved || !/^#[0-9a-fA-F]{6}$/.test(saved)) return null;
    const color = normalizeLightbarPresetColor(saved);
    return LIGHTBAR_SWATCHES.includes(color) ? null : color;
  });
  const [customColorDraft, setCustomColorDraft] = useState(LIGHTBAR_DEFAULT_CUSTOM_COLOR);
  const [showCustomColorPicker, setShowCustomColorPicker] = useState(false);
  const [customSwatchPrimed, setCustomSwatchPrimed] = useState(false);
  const [lightbarBrightnessValue, setLightbarBrightnessValue] = useState(100);

  const [lightbarCommitPending, setLightbarCommitPending] = useState(false);

  const lightbarBrightnessEditingRef = useRef(false);

  const customColorPickerRef = useRef<HTMLDivElement>(null);
  const customSwatchPrimeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!showCustomColorPicker) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!customColorPickerRef.current?.contains(event.target as Node)) {
        setShowCustomColorPicker(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowCustomColorPicker(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showCustomColorPicker]);

  const lightbarStateActive = connected && lightbarSupported && lightbarEnabled;
  const lightbarStateLabel = lightbarStateActive
    ? 'Active'
    : connected && lightbarSupported
      ? 'Off'
      : 'Unavailable';

  const normalizedLightbarColor = normalizeHexColor(lightbarColor);
  const customSwatchColor = customLightbarColor ?? LIGHTBAR_DEFAULT_CUSTOM_COLOR;
  const customSwatchSelected = Boolean(customLightbarColor && normalizedLightbarColor === customLightbarColor);
  const customColorPickerDisabled = !connected || !lightbarSupported || !lightbarEnabled;

  async function commitLightbar(nextColor = lightbarColor, brightness = lightbarBrightnessValue) {
    const color = normalizeHexColor(nextColor);
    const snappedBrightness = snapLightbarBrightness(brightness);
    const shouldPreserveSavedBrightness = Boolean(
      snapshot
      && controllerPowerSavingActive
      && snapshot.settings.lightbarBrightnessPercent > CONTROLLER_POWER_SAVING_CAP_PERCENT
      && snappedBrightness === CONTROLLER_POWER_SAVING_CAP_PERCENT
    );
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !lightbarSupported
      || !snapshot.settings.lightbarEnabled
      || lightbarCommitPending
      || (
        controllerPowerSavingActive
        && snapshot.settings.lightbarBrightnessPercent > CONTROLLER_POWER_SAVING_CAP_PERCENT
        && snappedBrightness === CONTROLLER_POWER_SAVING_CAP_PERCENT
        && color === normalizeHexColor(snapshot.settings.lightbarColor)
      )
      || (
        color === normalizeHexColor(snapshot.settings.lightbarColor)
        && snappedBrightness === snapshot.settings.lightbarBrightnessPercent
      )
    ) {
      lightbarBrightnessEditingRef.current = false;
      return;
    }

    setLightbarCommitPending(true);
    try {
      const persistedBrightness = shouldPreserveSavedBrightness
        ? snapshot.settings.lightbarBrightnessPercent
        : snappedBrightness;
      const next = await window.bridge.setLightbarColor(color, persistedBrightness);
      setSnapshot(next);
      setLightbarBrightnessValue(displayLightbarBrightnessValue(next));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setLightbarBrightnessValue(displayLightbarBrightnessValue(next));
    } finally {
      setLightbarCommitPending(false);
      lightbarBrightnessEditingRef.current = false;
    }
  }

  function selectLightbarColor(nextColor: string) {
    const color = normalizeHexColor(nextColor);
    setLightbarColor(color);
    void commitLightbar(color, lightbarBrightnessValue);
  }

  function saveCustomLightbarColor(nextColor: string) {
    const color = normalizeHexColor(nextColor);
    setCustomLightbarColor(color);
    setCustomColorDraft(color);
    setLightbarColor(color);
    setShowCustomColorPicker(false);
    setCustomSwatchPrimed(false);
    window.localStorage.setItem('ds5bridge.customLightbarColor', color);
    void commitLightbar(color, lightbarBrightnessValue);
  }

  function previewCustomLightbarColor(nextColor: string) {
    const color = normalizeHexColor(nextColor);
    setCustomColorDraft(color);
    setLightbarColor(color);
    void commitLightbar(color, lightbarBrightnessValue);
  }

  function selectCustomLightbarColor() {
    if (!customLightbarColor) {
      setCustomSwatchPrimed(true);
      if (customSwatchPrimeTimerRef.current !== null) {
        window.clearTimeout(customSwatchPrimeTimerRef.current);
      }
      customSwatchPrimeTimerRef.current = window.setTimeout(() => {
        setCustomSwatchPrimed(false);
        customSwatchPrimeTimerRef.current = null;
      }, 1600);
      return;
    }
    selectLightbarColor(customLightbarColor);
  }

  function openCustomLightbarPicker() {
    const color = customLightbarColor ?? LIGHTBAR_DEFAULT_CUSTOM_COLOR;
    setCustomColorDraft(color);
    setCustomSwatchPrimed(false);
    setShowCustomColorPicker(true);
  }

  function setLightbarPreset(value: number) {
    const brightness = snapLightbarBrightness(capControllerPowerSavingValue(value, snapshot));
    setLightbarBrightnessValue(brightness);
    void commitLightbar(lightbarColor, brightness);
  }

  function toggleLightbarEnabled() {
    if (!snapshot) return;
    void runAction('lightbar-enabled', () => window.bridge.setLightbarEnabled(!snapshot.settings.lightbarEnabled));
  }

  useEffect(() => () => {
    if (customSwatchPrimeTimerRef.current !== null) {
      window.clearTimeout(customSwatchPrimeTimerRef.current);
    }
  }, []);

  function syncSnapshot(next: BridgeSnapshot) {
    const nextLightbarColor = lightbarColorFromSnapshot(next);
    setLightbarColor(nextLightbarColor);
    if (!isLightbarPresetColor(nextLightbarColor)) {
      setCustomLightbarColor(nextLightbarColor);
      setCustomColorDraft(nextLightbarColor);
      window.localStorage.setItem('ds5bridge.customLightbarColor', nextLightbarColor);
    }
    if (!lightbarBrightnessEditingRef.current) {
      setLightbarBrightnessValue(displayLightbarBrightnessValue(next));
    }
  }

  function toggleLightbarOverride() {
    if (!snapshot) return;
    void runAction('lightbar-override', () => (
      window.bridge.setLightbarOverrideEnabled(!snapshot.settings.lightbarOverrideEnabled)
    ));
  }

  return {
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
    lightbarCommitPending,
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
    closeCustomColorPicker: () => setShowCustomColorPicker(false),
    setLightbarPreset,
    toggleLightbarEnabled,
    toggleLightbarOverride,
    syncSnapshot
  };
}

export type ControllerLightingController = ReturnType<typeof useControllerLightingController>;
