import { IconChevronDown } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { WakeOnLanApi } from '@shared/wake-on-lan-types';
import { WOL_WORLDWIDE_COUNTRY, isRetiredWakeOnLanCountry } from '@shared/wake-on-lan-protocol';
import { WAKE_ON_LAN_RETIRED_REGION_MESSAGE } from '@shared/wake-on-lan-result';
import { CustomSelect } from '../../components/CustomSelect';
import { ActionMenu } from '../../components/ActionMenu';
import { HelpTooltip } from '../../components/HelpTooltip';
import { useLocalization } from '../../common/localization';
import {
  WAKE_ON_LAN_OWNERSHIP_MESSAGE, WAKE_ON_LAN_STAGE_LABELS, wakeOnLanCheckableMac, wakeOnLanFailureMessage, wakeOnLanHistoryMessage
} from './wake-on-lan-model';
import { useWakeOnLanSettings, type WakeOnLanTimers } from './use-wake-on-lan-settings';
import { useWakeOnLanReadiness } from './use-wake-on-lan-readiness';
import { WakeOnLanReadinessChecklist } from './WakeOnLanReadinessChecklist';
import './wake-on-lan-settings.css';

export interface WakeOnLanSettingsProps {
  /** The Settings page is on screen. */
  readonly active: boolean;
  readonly connected: boolean;
  readonly connectionKey: string;
  /** Live from the snapshot, so the lock follows the controller before the next read. */
  readonly controllerConnected: boolean;
  /** A bridge is attached but needs a firmware update first. */
  readonly firmwareUpdateRequired: boolean;
  readonly api: WakeOnLanApi;
  /** A settings search matched this section: show its content without an explicit expand. */
  readonly searchMatch: boolean;
  /** A search that excludes this section hides it without unmounting, so a running test and the draft survive. */
  readonly hidden: boolean;
  readonly timers?: WakeOnLanTimers;
}

/** Windows adapter names and region names stay as Windows and the locale write them. */
function LiteralText({ children }: { readonly children: string }) {
  return <span data-l10n="off">{children}</span>;
}

/**
 * Wake-on-LAN setup, ported from Kitsune Input: a collapsible header with the
 * status and the on/off switch, then the network setup, its results and the
 * read-only "Before you rely on it" checklist.
 */
export function WakeOnLanSettings(props: WakeOnLanSettingsProps) {
  const { locale } = useLocalization();
  const settings = useWakeOnLanSettings(props);
  const { metadata, draft, busy, loading } = settings;
  // A failed adapter read leaves ownership unknown (null); never call that another PC.
  const targetElsewhere = Boolean(metadata?.supported && metadata.configured && metadata.targetOwnedByThisPc === false
    && !settings.targetsUnavailable && !loading);
  const noEthernet = !settings.targetsUnavailable && !loading && settings.targets.length === 0;
  const retiredCountry = metadata?.configured && isRetiredWakeOnLanCountry(metadata.country) ? metadata.country : null;
  const [expanded, setExpanded] = useState(false);
  const [manualTarget, setManualTarget] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  const passwordIssue = settings.validation?.field === 'password' ? settings.validation : null;
  const passwordInvalid = Boolean(passwordIssue && draft.password);
  const savedPassword = Boolean(metadata?.credentialPresent && draft.ssid === metadata.ssid && !draft.password);
  useEffect(() => {
    if (passwordIssue) passwordInput.current?.focus();
  }, [passwordIssue]);
  const showContent = expanded || (props.searchMatch && !props.hidden);
  const targetIsKnown = settings.targets.some((target) => target.mac === draft.targetMac);
  const showManualTarget = manualTarget || !targetIsKnown;
  const fieldId = useId();
  const locked = !props.active || loading || busy || settings.needsRefresh || Boolean(metadata?.busy);
  const controllerActive = props.controllerConnected;
  const changesLocked = locked || controllerActive;
  const controllerRestrictionText = 'Wake-on-LAN settings can only be changed while the controller is disconnected.';
  const regions = new Intl.DisplayNames([locale], { type: 'region' });
  const countries = metadata?.availableCountries ?? [];
  const worldwide = countries.includes(WOL_WORLDWIDE_COUNTRY);
  const retiredRegionName = retiredCountry ? regions.of(retiredCountry) ?? retiredCountry : '';
  const retiredRegionMessage = !retiredCountry ? null : worldwide
    ? `${retiredRegionName} isn’t available on this bridge’s radio. Choose Worldwide or another country, then test again.`
    : `${retiredRegionName} isn’t available on this bridge’s radio. Choose another country, then test again.`;
  // Firmware refuses to enable a retired-region record; explain it with the region's own name.
  const failureText = (message: string) => message === WAKE_ON_LAN_RETIRED_REGION_MESSAGE && retiredRegionMessage
    ? retiredRegionMessage : message;
  const headerNote = controllerActive && metadata?.supported ? null
    : targetElsewhere ? WAKE_ON_LAN_OWNERSHIP_MESSAGE : retiredRegionMessage;
  const historyMessage = wakeOnLanHistoryMessage(metadata?.lastOperationError);
  // Check the adapter being set up: the draft once it is a valid MAC, otherwise the saved one.
  const readinessMac = wakeOnLanCheckableMac(draft.targetMac) || metadata?.targetMac || '';
  const readinessTarget = settings.targets.find((target) => target.mac === readinessMac);
  // A known or saved adapter is read at once; a typed MAC waits for typing to pause. Only expanding
  // the section reads past the cache: a search match or returning to Settings reuses it.
  const readiness = useWakeOnLanReadiness(props.api, showContent && props.active && Boolean(metadata?.supported),
    readinessMac, Boolean(readinessTarget) || readinessMac === metadata?.targetMac, props.timers);
  const collator = new Intl.Collator(locale);
  const countryLabels: Array<[string, string]> = [
    worldwide ? ['Worldwide', WOL_WORLDWIDE_COUNTRY] : ['Select country', ''],
    ...countries.filter((code) => code !== WOL_WORLDWIDE_COUNTRY)
      .map((code): [string, string] => [regions.of(code) ?? code, code])
      .sort(([a], [b]) => collator.compare(a, b))
  ];
  const targetLabels: Array<[string, string]> = [
    ['Select Ethernet adapter', ''],
    ...settings.targets.map((target): [string, string] => [`${target.name} · ${target.mac}`, target.mac])
  ];
  // Placeholders are app copy; region and adapter names are not.
  const renderCountry = (label: string, value: string) => (
    value === WOL_WORLDWIDE_COUNTRY || !value ? <span>{label}</span> : <LiteralText>{label}</LiteralText>
  );
  const renderAdapter = (label: string, value: string) => (value ? <LiteralText>{label}</LiteralText> : <span>{label}</span>);
  const stage = settings.canceling ? 'canceling' : metadata?.stage;
  const showStage = stage && !['disabled', 'not-configured', 'waiting-for-sleep'].includes(stage);
  const firmwareUpdateRequired = metadata?.supported === false || (!metadata && props.firmwareUpdateRequired);
  const statusLabel = settings.needsRefresh ? settings.recovering ? 'Reconnecting' : 'Status unavailable'
    : loading ? 'Loading'
    : firmwareUpdateRequired ? 'Firmware update required'
    : settings.error || metadata?.error || stage === 'failed' || stage === 'radio-recovery-required' ? 'Needs attention'
    : !metadata ? 'Not connected'
    : controllerActive ? 'Controller connected'
    : !metadata.configured && !busy ? 'Setup required' : null;
  // Operation progress and results belong with the action that produced them.
  // A resting bridge state is never progress: during a test it still reads as
  // the test (the bridge may not have reported the new step yet); during the
  // cleanup that follows an operation there is no step left to cancel.
  const progressStage = showStage ? stage : settings.testing ? 'validating' : null;
  const feedback = <>
    {settings.showProgress && (!stage || progressStage) ? <div className="wake-on-lan-operation">
      <p className="wake-on-lan-progress" role="status" aria-live="polite">
        {progressStage ? WAKE_ON_LAN_STAGE_LABELS[progressStage] : 'Loading'}
      </p>
      <button type="button" className="heading-action" disabled={settings.canceling}
        onClick={() => void settings.cancel()}>Cancel</button>
    </div> : null}
    {settings.message ? <p className="wake-on-lan-result good" role="status">{settings.message}</p> : null}
    {settings.error ? <p className="wake-on-lan-result bad" role="alert">{failureText(settings.error)}</p> : null}
    {settings.needsRefresh || (settings.targetsUnavailable && metadata?.supported)
      ? <button type="button" className="heading-action"
        disabled={!props.active || loading || busy} onClick={() => void settings.refresh()}>Refresh</button> : null}
  </>;
  return (
    <div className="settings-menu-row wake-on-lan-settings" hidden={props.hidden}>
      <div className="wake-on-lan-header">
        <button type="button" className="wake-on-lan-heading"
          aria-expanded={showContent} aria-controls={`${fieldId}-content`} aria-label="Wake-on-LAN"
          aria-describedby={statusLabel ? `${fieldId}-state` : undefined}
          onClick={() => {
            // Only a click that reveals the content is an explicit expand; collapsing withdraws it.
            readiness.requestFresh(!showContent);
            setExpanded((value) => !value);
          }}>
          <span className="settings-menu-copy">
            <strong>Wake-on-LAN</strong>
            <span id={`${fieldId}-description`}>{metadata?.supported && controllerActive
              ? controllerRestrictionText
              : headerNote ?? 'Wake this PC with a paired controller’s connect button'}</span>
          </span>
          {statusLabel ? <span id={`${fieldId}-state`} className="wake-on-lan-state">{statusLabel}</span> : null}
          <IconChevronDown className="wake-on-lan-chevron" size={20} aria-hidden="true" />
        </button>
        <div className="wake-on-lan-enable" title={metadata?.supported ? controllerRestrictionText : undefined}>
          {metadata?.supported ? <button type="button" role="switch" aria-label="Wake-on-LAN"
            aria-checked={metadata.enabled} className={`switch${metadata.enabled ? ' on' : ''}`}
            aria-describedby={`${fieldId}-description`} aria-busy={busy}
            disabled={changesLocked || !metadata.configured || ((targetElsewhere || Boolean(retiredCountry)) && !metadata.enabled)}
            onClick={() => void settings.toggleEnabled()}>
            <span />
          </button> : null}
        </div>
      </div>
      <div id={`${fieldId}-content`} className="wake-on-lan-content" hidden={!showContent}>
        {showContent ? <>
          {!loading && !busy && !settings.needsRefresh && !settings.error && metadata?.error
            ? <p className="wake-on-lan-result bad" role="alert">
              {failureText(wakeOnLanFailureMessage(metadata.error, null, Boolean(retiredCountry)))}</p> : null}
          <div className="settings-menu-copy wake-on-lan-requirements">
            {!metadata?.supported || !controllerActive ? <span>{controllerRestrictionText}</span> : null}
            <span>The bridge arms itself whenever this PC sleeps or shuts down, even with DS5 Bridge closed. Its Wi-Fi stops before controller use.</span>
          </div>
          {!props.connected ? <p role="status">{props.firmwareUpdateRequired
            ? 'Update this bridge’s firmware to configure Wake-on-LAN.'
            : 'Connect a bridge to set up Wake-on-LAN.'}</p> : null}
          {loading ? <p role="status">Loading wake settings…</p> : null}
          {metadata && !metadata.supported && !loading && !settings.needsRefresh ? (
            <p role="status">Update this bridge’s firmware to configure Wake-on-LAN.</p>
          ) : null}
          {metadata?.supported ? (
            <>
              <form className="wake-on-lan-form" onSubmit={(event) => {
                event.preventDefault();
                if (!noEthernet && !settings.targetsUnavailable) void settings.testAndSave();
              }} autoComplete="off">
                <fieldset disabled={locked}>
                  <legend>Network setup</legend>
                  <label htmlFor={`${fieldId}-ssid`}>Wi-Fi name (SSID)</label>
                  <input id={`${fieldId}-ssid`} value={draft.ssid} autoComplete="off"
                    spellCheck={false} autoCapitalize="none"
                    onChange={(event) => settings.setDraft({ ...draft, ssid: event.target.value })} />
                  <label htmlFor={`${fieldId}-password`}>Wi-Fi password</label>
                  <input ref={passwordInput} id={`${fieldId}-password`} type="password" value={draft.password}
                    autoComplete="new-password" maxLength={63} spellCheck={false} autoCapitalize="none"
                    placeholder={savedPassword ? 'Re-enter password to test or save' : undefined}
                    aria-invalid={passwordInvalid || undefined}
                    aria-describedby={`${fieldId}-password-hint`}
                    onChange={(event) => settings.setDraft({ ...draft, password: event.target.value })} />
                  <span className={`wake-on-lan-field-hint${passwordInvalid ? ' wake-on-lan-field-error' : ''}`}
                    id={`${fieldId}-password-hint`} role={passwordIssue ? (passwordInvalid ? 'alert' : 'status') : undefined}>
                    {passwordIssue ? passwordIssue.message : savedPassword
                      ? 'Password saved on bridge' : '2.4 GHz WPA2-Personal only.'}
                  </span>
                  <span className="wake-on-lan-field-label">{worldwide ? <HelpTooltip label="Country / region"
                    tooltip="If your router uses channel 12 or 13, or hides its network name, choose your country instead of Worldwide." />
                    : 'Country / region'}</span>
                  <CustomSelect value={draft.country} options={countryLabels} disabled={locked}
                    ariaLabel="Country / region" className="wake-on-lan-select" valueLabel="Select country"
                    floatingMenu floatingMenuFitContent={false} renderValue={renderCountry} renderOption={renderCountry}
                    onChange={(country) => settings.setDraft({ ...draft, country })} />
                  {/* The header already explains a retired region unless another note needs that line. */}
                  {retiredRegionMessage && headerNote !== retiredRegionMessage && !countries.includes(draft.country)
                    ? <span className="wake-on-lan-field-hint wake-on-lan-field-warning">{retiredRegionMessage}</span> : null}
                  <span className="wake-on-lan-field-label">This PC’s Ethernet adapter</span>
                  <CustomSelect value={targetIsKnown ? draft.targetMac : ''} options={targetLabels}
                    disabled={locked || settings.targets.length === 0}
                    ariaLabel="This PC’s Ethernet adapter" className="wake-on-lan-select"
                    floatingMenu floatingMenuFitContent={false} renderValue={renderAdapter} renderOption={renderAdapter}
                    onChange={(targetMac) => settings.setDraft({ ...draft, targetMac })} />
                  <div className="wake-on-lan-adapter-actions">
                    {/* Opening Settings reuses a recent list; this reads it again without touching the draft.
                        A pending read ignores repeat clicks instead of flashing the disabled style. */}
                    <button type="button" className="wake-on-lan-manual-toggle" aria-busy={settings.refreshingTargets}
                      onClick={() => void settings.refreshTargets()}>
                      Refresh adapters
                    </button>
                    {targetIsKnown ? <button type="button" className="wake-on-lan-manual-toggle"
                      aria-expanded={showManualTarget} aria-controls={`${fieldId}-mac`}
                      onClick={() => setManualTarget((value) => !value)}>
                      Enter MAC address manually
                    </button> : null}
                  </div>
                  {showManualTarget ? <>
                    <label htmlFor={`${fieldId}-mac`}>Ethernet MAC address</label>
                    <input id={`${fieldId}-mac`} value={draft.targetMac} maxLength={17}
                      autoComplete="off" spellCheck={false} autoCapitalize="none"
                      onChange={(event) => settings.setDraft({ ...draft, targetMac: event.target.value })} />
                  </> : null}
                  {settings.targetsUnavailable ? (
                    <span className="wake-on-lan-field-hint">Couldn’t read this PC’s Ethernet adapters. Refresh to try again.</span>
                  ) : noEthernet ? (
                    <span className="wake-on-lan-field-hint wake-on-lan-field-warning">This PC has no Ethernet adapter. Wake-on-LAN needs a wired connection.</span>
                  ) : null}
                  {settings.validation && !passwordIssue ? <p className="wake-on-lan-field-hint wake-on-lan-field-error" role="alert">
                    {settings.validation.message}
                  </p> : null}
                  <div className="wake-on-lan-actions">
                    {/* Ownership can't be checked until adapters are read again, so a test could only fail. */}
                    <button type="submit" className="heading-action" disabled={changesLocked || noEthernet || settings.targetsUnavailable}
                      aria-describedby={`${fieldId}-description`}>
                      Test and save
                    </button>
                    {metadata.configured ? <ActionMenu label="Wake-on-LAN actions"
                      disabled={changesLocked} items={[{
                        label: 'Forget saved network', danger: true,
                        onSelect: () => void settings.forget()
                      }]} /> : null}
                  </div>
                </fieldset>
              </form>
              {feedback}
              {historyMessage && !busy && !settings.needsRefresh && !settings.error
                ? <p className="wake-on-lan-field-hint">{historyMessage}</p> : null}
              {showStage && !busy && !settings.needsRefresh ? <p className="wake-on-lan-progress" role="status" aria-live="polite">
                {WAKE_ON_LAN_STAGE_LABELS[stage]}
              </p> : null}
              {metadata.packetCount > 0 && !settings.message ? <p className="wake-on-lan-field-hint">
                A wake packet was submitted. This does not confirm that the PC woke or finished starting.
              </p> : null}
              <WakeOnLanReadinessChecklist readiness={readiness.readiness} checking={readiness.checking}
                target={readinessTarget} onRefresh={readiness.refresh} />
            </>
          ) : feedback}
        </> : null}
      </div>
      {/* Collapsed, results stay visible under the header; expanded, they follow the actions. */}
      {showContent ? null : feedback}
    </div>
  );
}
