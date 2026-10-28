import { type TablerIcon, IconBulb, IconDeviceGamepad2, IconSparkles, IconVolume } from '@tabler/icons-react';
import type { DualSenseSection } from './control-tabs';

const SECTIONS: readonly { id: DualSenseSection; label: string; Icon: TablerIcon }[] = [
  { id: 'audio', label: 'Audio', Icon: IconVolume },
  { id: 'haptics', label: 'Haptics', Icon: IconSparkles },
  { id: 'triggers', label: 'Triggers', Icon: IconDeviceGamepad2 },
  { id: 'lighting', label: 'Lighting', Icon: IconBulb }
];

/**
 * The strip across the top of each DualSense page, as in Kitsune Input's
 * Controller Studio, so Audio, Haptics, Triggers and Lighting read as one area.
 * Every section page carries its own copy, so tabs are found by section, not ID.
 */
export function DualSenseSectionTabs({ activeSection, onSelect }: {
  activeSection: DualSenseSection;
  onSelect(section: DualSenseSection): void;
}) {
  return (
    <div className="studio-tab-strip" role="tablist" aria-label="DualSense sections">
      {SECTIONS.map(({ id, label, Icon }, index) => (
        <button
          key={id}
          data-dualsense-section={id}
          type="button"
          role="tab"
          aria-selected={activeSection === id}
          aria-controls={`control-panel-${id}`}
          tabIndex={activeSection === id ? 0 : -1}
          className={activeSection === id ? 'active' : ''}
          onClick={() => onSelect(id)}
          onKeyDown={(event) => {
            let nextIndex: number | null = null;
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              nextIndex = (index + 1) % SECTIONS.length;
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              nextIndex = (index - 1 + SECTIONS.length) % SECTIONS.length;
            } else if (event.key === 'Home') {
              nextIndex = 0;
            } else if (event.key === 'End') {
              nextIndex = SECTIONS.length - 1;
            }
            if (nextIndex === null) return;
            event.preventDefault();
            const next = SECTIONS[nextIndex].id;
            onSelect(next);
            // The next section is another page; keep focus on its strip.
            requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(
              `.control-page.active .studio-tab-strip [data-dualsense-section="${next}"]`
            )?.focus());
          }}
        >
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
