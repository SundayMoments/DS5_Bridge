import { IconAlertTriangle, IconChevronDown, IconCircle, IconCircleCheck, IconCircleDashed } from '@tabler/icons-react';
import { useId, useState } from 'react';
import type { WakeOnLanReadiness, WakeOnLanTarget } from '@shared/wake-on-lan-types';
import { HelpTooltip } from '../../components/HelpTooltip';
import { useLocalization } from '../../common/localization';
import {
  wakeOnLanLastEvent, wakeOnLanReadinessRows, type WakeOnLanReadinessTone
} from './wake-on-lan-readiness-model';

interface WakeOnLanReadinessChecklistProps {
  readonly readiness: WakeOnLanReadiness | null;
  readonly checking: boolean;
  readonly target: WakeOnLanTarget | undefined;
  readonly onRefresh: () => void;
}

function ToneIcon({ tone }: { tone: WakeOnLanReadinessTone }) {
  const props = { size: 16, stroke: 2, 'aria-hidden': true, className: 'wake-on-lan-readiness-icon' } as const;
  if (tone === 'ok') return <IconCircleCheck {...props} />;
  if (tone === 'warning') return <IconAlertTriangle {...props} />;
  if (tone === 'unknown') return <IconCircleDashed {...props} />;
  return <IconCircle {...props} />;
}

/**
 * One compact checklist, ported from Kitsune Input: what the user must set up
 * themselves, with live, read-only results from this PC where Windows exposes
 * them. It starts collapsed; the header keeps a one-line summary so warnings are
 * never hidden. Rows never appear or disappear when results arrive; DS5 Bridge
 * never changes these settings.
 */
export function WakeOnLanReadinessChecklist({ readiness, checking, target, onRefresh }: WakeOnLanReadinessChecklistProps) {
  const { locale } = useLocalization();
  const headingId = useId();
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const rows = wakeOnLanReadinessRows(readiness, target, checking);
  const warnings = rows.filter((row) => row.tone === 'warning').length;
  // Quiet while collapsed: a warning count, the first read, or nothing when no live row warns.
  const summary = warnings > 0 ? `${warnings} to check` : checking && !readiness ? 'Checking…' : null;
  const lastEvent = wakeOnLanLastEvent(readiness);
  const lastEventAt = lastEvent.at
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastEvent.at)) : null;
  const driver = [readiness?.driverProvider, readiness?.driverVersion].filter(Boolean).join(' ');
  return (
    <section className="wake-on-lan-readiness" aria-labelledby={headingId} aria-busy={checking}>
      <div className="wake-on-lan-readiness-header">
        <h4 className="wake-on-lan-readiness-heading">
          <button type="button" className="wake-on-lan-readiness-trigger"
            aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((value) => !value)}>
            <span id={headingId} className="wake-on-lan-readiness-title">Before you rely on it</span>
            {!open && summary ? <span className="wake-on-lan-readiness-summary" data-tone={warnings > 0 ? 'warning' : 'pending'}>
              {summary}
            </span> : null}
            <IconChevronDown className="wake-on-lan-chevron" size={20} aria-hidden="true" />
          </button>
        </h4>
        {/* A sibling of the trigger: never nest the tooltip's focus target inside the button. */}
        <HelpTooltip className="wake-on-lan-readiness-help" width={340}
          label={<span className="wake-on-lan-sr-only">About these checks</span>} tooltip={<>
            <span>Setting names vary by vendor: Realtek Shutdown Wake-On-Lan, Intel Wake on Magic Packet from power off state, Dell Deep Sleep Control, Lenovo Wake On LAN (AC only). DS5 Bridge never changes these settings.</span>
            {driver ? <span className="help-tooltip-note">{`Adapter driver: ${driver}`}</span> : null}
            <span className="help-tooltip-note">To move the bridge to another PC, disconnect the controller, turn Wake-on-LAN off, then move the bridge.</span>
          </>} />
      </div>
      {/* Opens and closes instantly; only the chevron turns. */}
      <div id={bodyId} className="wake-on-lan-readiness-body" hidden={!open}>
        {open ? <>
          <ul className="wake-on-lan-readiness-list">
            {rows.map((row) => (
              <li key={row.id} className="wake-on-lan-readiness-row" data-tone={row.tone} data-row={row.id}>
                <ToneIcon tone={row.tone} />
                <span className="wake-on-lan-readiness-text">{row.text}</span>
                {row.status ? <span className="wake-on-lan-readiness-status">
                  {row.detail.length > 0 ? <HelpTooltip label={row.status} width="auto"
                    tooltip={row.detail.map((sentence) => <span key={sentence}>{sentence}</span>)} /> : row.status}
                </span> : null}
              </li>
            ))}
          </ul>
          <div className="wake-on-lan-readiness-footer">
            <p className="wake-on-lan-readiness-last" data-known={readiness?.available ? 'true' : 'false'}>
              <span>{lastEvent.label}</span>
              {lastEventAt ? <span> · {lastEventAt}</span> : null}
            </p>
            {/* Pending reads keep the button steady; repeated presses are ignored rather than disabled. */}
            <button type="button" className="wake-on-lan-readiness-refresh" aria-busy={checking} onClick={onRefresh}>
              Check again
            </button>
          </div>
        </> : null}
      </div>
    </section>
  );
}
