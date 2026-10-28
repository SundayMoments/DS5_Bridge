import { IconArrowRight as ArrowRight, IconSparkleHighlight } from '@tabler/icons-react';

export interface StartupTutorialProps {
  readonly featureExampleActive: boolean;
  readonly onFeatureExampleToggle: () => void;
  readonly onFinish: () => void;
}

export function StartupTutorial({ featureExampleActive, onFeatureExampleToggle, onFinish }: StartupTutorialProps) {
  return (
    <div className="modal-backdrop startup-tutorial-backdrop" role="presentation">
      <section
        className="settings-menu bridge-settings-modal startup-tutorial-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Feature tile tutorial"
      >
        <div className="settings-menu-heading bridge-settings-modal-heading">
          <div className="modal-heading-copy">
            <IconSparkleHighlight size={16} />
            <span>Feature Tiles</span>
          </div>
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
            onClick={onFinish}
          >
            Next <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}
