import { IconArrowRight as ArrowRight, IconSparkleHighlight } from '@tabler/icons-react';
import { KitsuneInputAsk } from '../kitsune-promotion/KitsuneInputAsk';
import type { StartupTutorialStep } from './startup-tutorial-storage';

export interface StartupTutorialProps {
  readonly step: Exclude<StartupTutorialStep, 'done'>;
  readonly featureExampleActive: boolean;
  readonly askCountdown: number;
  readonly onFeatureExampleToggle: () => void;
  readonly onFeatureStepComplete: () => void;
  readonly onGetKitsuneInput: () => void;
  readonly onLearnAboutKitsuneInput: () => void;
  readonly onFinish: () => void;
}

export function StartupTutorial({
  step,
  featureExampleActive,
  askCountdown,
  onFeatureExampleToggle,
  onFeatureStepComplete,
  onGetKitsuneInput,
  onLearnAboutKitsuneInput,
  onFinish
}: StartupTutorialProps) {
  return (
    <div className="modal-backdrop startup-tutorial-backdrop" role="presentation">
      <section
        className={`settings-menu bridge-settings-modal startup-tutorial-modal ${step === 'kitsune-ask' ? 'kitsune-ask-panel' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={step === 'feature-toggle' ? 'Feature tile tutorial' : 'Considering Getting Kitsune Input?'}
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
          <KitsuneInputAsk
            countdown={askCountdown}
            headingAside={<span className="startup-tutorial-step">2 / 2</span>}
            onGet={onGetKitsuneInput}
            onLearnMore={onLearnAboutKitsuneInput}
            onContinue={onFinish}
          />
        )}
      </section>
    </div>
  );
}
