import { IconArrowRight as ArrowRight, IconHeart as Heart, IconSparkleHighlight } from '@tabler/icons-react';
import type { StartupTutorialStep } from './startup-tutorial-storage';

export interface StartupTutorialProps {
  readonly step: Exclude<StartupTutorialStep, 'done'>;
  readonly featureExampleActive: boolean;
  readonly supportCountdown: number;
  readonly kofiBadgeUrl: string;
  readonly onFeatureExampleToggle: () => void;
  readonly onFeatureStepComplete: () => void;
  readonly onSupport: () => void;
  readonly onFinish: () => void;
}

export function StartupTutorial({
  step,
  featureExampleActive,
  supportCountdown,
  kofiBadgeUrl,
  onFeatureExampleToggle,
  onFeatureStepComplete,
  onSupport,
  onFinish
}: StartupTutorialProps) {
  return (
    <div className="modal-backdrop startup-tutorial-backdrop" role="presentation">
      <section
        className="settings-menu bridge-settings-modal startup-tutorial-modal"
        role="dialog"
        aria-modal="true"
        aria-label={step === 'feature-toggle' ? 'Feature tile tutorial' : 'Support DS5 Bridge'}
      >
        {step === 'feature-toggle' ? (
          <>
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <IconSparkleHighlight size={16} />
                <span>Feature Tiles</span>
              </div>
              <span className="startup-tutorial-step">1 / 2</span>
            </div>
            <div className="startup-tutorial-copy">
              <h2>Click The Square</h2>
              <p>Feature tiles turn effects on and off. Try it once here, then keep going.</p>
            </div>
            <div className="startup-tutorial-feature-demo">
              <button
                className={`startup-tutorial-feature-icon ${featureExampleActive ? 'active' : ''}`}
                type="button"
                aria-pressed={featureExampleActive}
                aria-label="Toggle example effect"
                onClick={onFeatureExampleToggle}
              >
                <IconSparkleHighlight size={24} />
              </button>
              <span>
                <strong>Example Effect</strong>
                <span>{featureExampleActive ? 'On' : 'Off'}</span>
              </span>
            </div>
            <div className="startup-tutorial-actions">
              <button
                type="button"
                className="primary-action"
                disabled={!featureExampleActive}
                onClick={onFeatureStepComplete}
              >
                Next <ArrowRight size={16} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <Heart size={16} />
                <span>One Tiny Ask</span>
              </div>
              <span className="startup-tutorial-step">2 / 2</span>
            </div>
            <div className="startup-tutorial-copy">
              <h2>Enjoying DS5 Bridge?</h2>
              <p>If this app makes your setup better, please consider supporting the work on Ko-fi.</p>
            </div>
            <button
              className="startup-tutorial-kofi-button"
              type="button"
              aria-label="Support SundayMoments on Ko-fi"
              onClick={onSupport}
            >
              <img src={kofiBadgeUrl} alt="" />
            </button>
            <div className="startup-tutorial-actions">
              <button
                type="button"
                className="primary-action"
                disabled={supportCountdown > 0}
                onClick={onFinish}
              >
                {supportCountdown > 0 ? `Continue In ${supportCountdown}` : 'Continue'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
