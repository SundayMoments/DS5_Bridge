import { useState, type ReactNode } from 'react';
import {
  IconAdjustmentsHorizontal as Settings2,
  IconBatteryEco,
  IconBrandDeezer,
  IconCircleCheck,
  IconDeviceAudioTape,
  IconFlask2,
  IconHeadphones as Headphones,
  IconLink as LinkIcon,
  IconLinkOff as LinkOffIcon,
  IconPalette as Palette,
  IconPlayerPlay as Play,
  IconQuestionMark,
  IconSparkleHighlight,
  IconViewfinder
} from '@tabler/icons-react';
import type { SettingsFocusTarget } from '../features/settings/settings-navigation';

export type FeatureTipsPanelProps = {
  tab: 'audio' | 'haptics' | 'triggers' | 'lighting' | 'deadzones';
  onSettingsFocusRequest?: (target: SettingsFocusTarget) => void;
  audioHapticsOpen?: boolean;
  triggerLabOpen?: boolean;
};

/** The Tips panel under each feature page; some tips are small interactive examples. */
export function FeatureTipsPanel({
  tab,
  onSettingsFocusRequest,
  audioHapticsOpen = false,
  triggerLabOpen = false
}: FeatureTipsPanelProps) {
  const [featureTileSampleActive, setFeatureTileSampleActive] = useState(false);
  const [triggerLabLinkTipSplit, setTriggerLabLinkTipSplit] = useState(false);
  const tips: Array<{
    key: string;
    icon: ReactNode;
    title: string;
    text: string;
    tone?: 'success';
  }> = tab === 'deadzones'
    ? [
        {
          key: 'tune-each-stick',
          icon: <IconViewfinder size={16} />,
          title: 'Tune Each Stick',
          text: 'Raise each value only until that stick rests cleanly at center.'
        },
        {
          key: 'keep-it-low',
          icon: <IconCircleCheck size={16} />,
          title: 'Keep It Low',
          text: 'Use the lowest stable value; larger deadzones reduce fine movement near center.'
        }
      ]
    : [
        {
          key: 'toggle',
          icon: <IconSparkleHighlight size={16} />,
          title: 'Feature Tiles',
          text: 'Click the square icon tile to enable or disable that feature.'
        },
        {
          key: 'unavailable',
          icon: <Settings2 size={16} />,
          title: 'Unavailable',
          text: 'Dimmed controls need the bridge, controller, or matching feature enabled.'
        }
      ];

  if (tab !== 'deadzones') {
    if (tab === 'triggers' && triggerLabOpen) {
      tips.push({
        key: 'trigger-lab-override',
        icon: <IconFlask2 size={16} />,
        title: 'Lab Override',
        text: 'Active Lab effects stay applied and ignore incoming game trigger output.'
      });
    } else if (tab === 'haptics' && audioHapticsOpen) {
      tips.push({
        key: 'audio-haptics',
        icon: <IconDeviceAudioTape size={16} />,
        title: 'Audio Haptics',
        text: 'Audio Haptics turns system audio into haptic feedback.'
      });
    } else if (tab === 'audio') {
      tips.push({
        key: 'headphones',
        icon: <Headphones size={16} />,
        title: 'Headphones',
        text: 'Headphones use the same Pico-local audio path as the controller speaker.'
      });
    } else {
      tips.push({
        key: 'power-saving',
        icon: <IconBatteryEco size={16} />,
        title: 'Green Icon',
        text: 'Power saving is temporarily capping this setting while headphones are connected.',
        tone: 'success'
      });
    }

    if (tab === 'triggers' && triggerLabOpen) {
      tips.push({
        key: 'trigger-lab-link',
        icon: triggerLabLinkTipSplit ? <LinkOffIcon size={16} /> : <LinkIcon size={16} />,
        title: 'Linked / Split',
        text: 'When Linked is on, the selected effect mirrors across L2 and R2. Split keeps each trigger separate.'
      });
    } else if (tab === 'haptics' && audioHapticsOpen) {
      tips.push({
        key: 'audio-haptics-mode',
        icon: <IconBrandDeezer size={16} />,
        title: 'Mix / Replace',
        text: 'Mix adds audio feedback to native haptics and rumble; Replace uses only the derived audio feel.'
      });
    } else if (tab === 'lighting') {
      tips.push({
        key: 'custom-color',
        icon: <Palette size={16} />,
        title: 'Custom Color',
        text: 'Double-click the final color swatch to choose a custom lightbar color.'
      });
    } else {
      tips.push({
        key: 'tests',
        icon: <Play size={16} />,
        title: 'Tests',
        text: 'Tests may pause while a game or audio stream is actively using the controller.'
      });
    }
  }

  return (
    <section className="feature-help-panel" aria-label={`${tab} tips`}>
      <div className="feature-help-heading">
        <IconQuestionMark size={16} />
        <h3>Tips</h3>
      </div>
      <div className="feature-help-grid">
        {tips.map((tip) => (
          <div
            className="feature-help-item"
            key={tip.key}
          >
            {tip.key === 'toggle' ? (
              <button
                className={`feature-help-icon feature-help-icon-button ${featureTileSampleActive ? 'active' : ''}`}
                type="button"
                aria-pressed={featureTileSampleActive}
                aria-label="Toggle feature tile example"
                onClick={() => setFeatureTileSampleActive((active) => !active)}
              >
                {tip.icon}
              </button>
            ) : tip.key === 'power-saving' ? (
              <button
                className={`feature-help-icon feature-help-icon-button ${tip.tone ?? ''}`}
                type="button"
                aria-label="Open Controller Power Saving settings"
                onClick={() => onSettingsFocusRequest?.('controller-power-saving')}
              >
                {tip.icon}
              </button>
            ) : tip.key === 'trigger-lab-link' ? (
              <button
                className={`feature-help-icon feature-help-icon-button ${triggerLabLinkTipSplit ? '' : 'active'}`}
                type="button"
                aria-pressed={!triggerLabLinkTipSplit}
                aria-label="Toggle Linked Split tip example"
                onClick={() => setTriggerLabLinkTipSplit((split) => !split)}
              >
                {tip.icon}
              </button>
            ) : (
              <span className={`feature-help-icon ${tip.tone ?? ''}`} aria-hidden="true">
                {tip.icon}
              </span>
            )}
            <span className="feature-help-copy">
              <strong>{tip.title}</strong>
              <span>{tip.text}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
