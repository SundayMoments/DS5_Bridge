import { useEffect, useState } from 'react';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import type { ResetEvidencePayload } from '@shared/protocol';
import { useLocalization } from '../../common/localization';
import { lastRestartReport, lastRestartText } from './reset-evidence';

const COPIED_FEEDBACK_MS = 2000;

/**
 * Why the bridge last restarted, from the reset evidence the firmware keeps.
 * Copy puts the sentence and the raw fields on the clipboard for bug reports.
 */
export function LastRestartRow({ evidence, firmwareVersion }: {
  readonly evidence: ResetEvidencePayload;
  readonly firmwareVersion: string | null;
}) {
  const { translate } = useLocalization();
  const [copied, setCopied] = useState(false);
  const sentence = lastRestartText(evidence, translate);
  const abnormal = evidence.watchdogReset;

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      // The report keeps English names so it reads the same in every bug report.
      await navigator.clipboard.writeText(lastRestartReport(evidence, firmwareVersion, lastRestartText(evidence)));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="settings-menu-row last-restart-row">
      <div className="settings-menu-copy">
        <strong>Last Restart</strong>
        <span className={`last-restart-text ${abnormal ? 'abnormal' : ''}`}>{sentence}</span>
      </div>
      <button
        type="button"
        className="heading-action settings-row-action last-restart-copy"
        aria-label={copied ? 'Copied' : 'Copy last restart details'}
        onClick={() => void copy()}
      >
        {copied ? <IconCheck size={15} aria-hidden="true" /> : <IconCopy size={15} aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
