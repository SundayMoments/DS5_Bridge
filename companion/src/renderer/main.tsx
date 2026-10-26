import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter/standard.css';
import { App } from './App';
import './styles.css';
import { RendererFailureBoundary } from './common/RendererFailureBoundary';
import { RendererLocalization } from './composition/RendererLocalization';
import { applyStoredUiThemePreset } from './ui-theme-preferences';
import { applyStoredUiTextScalePercent } from './ui-text-scale-preferences';

// Paint the cached theme and text size before React mounts to avoid a flash.
// RendererLocalization likewise mounts in the cached language.
applyStoredUiThemePreset();
applyStoredUiTextScalePercent();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RendererLocalization>
      <RendererFailureBoundary>
        <App />
      </RendererFailureBoundary>
    </RendererLocalization>
  </React.StrictMode>
);
