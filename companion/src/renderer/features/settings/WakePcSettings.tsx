import { useEffect, useId, useRef } from 'react';
import { IconAlertTriangle, IconCheck, IconRefresh } from '@tabler/icons-react';
import { WOL_WORLDWIDE_COUNTRY } from '@shared/wake-on-lan-protocol';
import type { WakeOnLanTarget } from '@shared/wake-on-lan-types';
import { CustomSelect } from '../../components/CustomSelect';
import { useLocalization } from '../../common/localization';
import { ToggleRow } from './SettingsToggleRow';
import {
  SearchableSetting,
  SettingsBridgeNotice,
  settingsUnsupportedMessage,
  type SettingsCategoryProps
} from './SettingsCategoryContentSupport';
import { useWakePcSettings, type WakePcSettingsController } from './use-wake-pc-settings';
import {
  WAKE_PC_PROGRESS_STEPS,
  WAKE_PC_STAGE_LABELS,
  wakePcProgressStep,
  type WakePcDraftField
} from './wake-pc-model';
import './wake-pc-settings.css';

/** Windows adapter names and network names are the user's own text and stay literal. */
function LiteralText({ children }: { readonly children: string }) {
  return <span data-l10n="off">{children}</span>;
}

function adapterLabel(target: WakeOnLanTarget): string {
  return `${target.name} · ${target.mac}`;
}

export function WakePcSettings({ model, actions, active, matchingSettingIds }: SettingsCategoryProps) {
  const { locale } = useLocalization();
  const showWakeOnLan = !matchingSettingIds || matchingSettingIds.has('wake-on-lan');
  const wakeOnLan = useWakePcSettings({
    active: active && showWakeOnLan && model.connected,
    connectionKey: model.wakeOnLan.connectionKey,
    controllerConnected: model.wakeOnLan.controllerConnected,
    locale,
    api: actions.wakeOnLan
  });

  return <>
    <h3 className="settings-menu-section-label">Wake PC</h3>
    <SettingsBridgeNotice model={model} ids={['remote-wake', 'wake-on-lan']} matchingSettingIds={matchingSettingIds} />
    {showWakeOnLan || !matchingSettingIds ? (
      <p className="wake-pc-intro">
        When this PC sleeps or shuts down, turning on your controller wakes it. The bridge tries USB wake first, then sends a Wake-on-LAN packet over your Wi-Fi. Enable Wake on Magic Packet for the PC’s Ethernet adapter in Windows Device Manager.
      </p>
    ) : null}
    <SearchableSetting id="remote-wake" matchingSettingIds={matchingSettingIds}>
      <ToggleRow
        label="Wake PC on Controller"
        description="Wake through USB when a controller reconnects. Requires Windows wake permission and DualSense, DualSense Edge, or DS4 mode."
        checked={model.settings.wakeOnConnectEnabled}
        disabled={!model.connected || !model.support.wakeOnConnect || model.busy}
        unavailableReason={settingsUnsupportedMessage(model, model.support.wakeOnConnect)}
        onToggle={actions.toggleWakeOnConnect}
      />
    </SearchableSetting>
    <SearchableSetting id="wake-on-lan" matchingSettingIds={matchingSettingIds}>
      <WakeOnLanPanel
        controller={wakeOnLan}
        connected={model.connected}
        liveControllerConnected={model.wakeOnLan.controllerConnected}
        locale={locale}
      />
    </SearchableSetting>
  </>;
}

function WakeOnLanPanel({ controller, connected, liveControllerConnected, locale }: {
  readonly controller: WakePcSettingsController;
  readonly connected: boolean;
  /** From the live snapshot, so the lock follows the controller before the next read. */
  readonly liveControllerConnected: boolean;
  readonly locale: string;
}) {
  const { metadata, draft, busy, operation } = controller;
  const fieldId = useId();
  const feedbackRef = useRef<HTMLDivElement>(null);
  // Progress and results sit under the form; bring them into view as they appear.
  useEffect(() => {
    if (operation === 'test' || controller.message || controller.error) {
      feedbackRef.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [operation, controller.message, controller.error]);
  const controllerConnected = Boolean(metadata?.controllerConnected) || liveControllerConnected;
  const supported = Boolean(metadata?.supported);
  const changesLocked = !connected || busy || controllerConnected || controller.loading;
  const showForm = supported && (!metadata?.configured || controller.editing);
  const regions = new Intl.DisplayNames([locale], { type: 'region' });
  const regionName = (code: string) => code === WOL_WORLDWIDE_COUNTRY ? 'Worldwide' : regions.of(code) ?? code;
  const collator = new Intl.Collator(locale);
  const countries = metadata?.availableCountries ?? [];
  const countryOptions: Array<[string, string]> = [
    ...(countries.includes(WOL_WORLDWIDE_COUNTRY) ? [['Worldwide', WOL_WORLDWIDE_COUNTRY] as [string, string]] : []),
    ...countries.filter((code) => code !== WOL_WORLDWIDE_COUNTRY)
      .map((code): [string, string] => [regions.of(code) ?? code, code])
      .sort(([left], [right]) => collator.compare(left, right))
  ];
  const targetOptions: Array<[string, string]> = controller.targets.map((target) => [adapterLabel(target), target.mac]);
  const savedTarget = controller.targets.find((target) => target.mac === metadata?.targetMac);
  const statusLabel = !connected ? null
    : controller.loading && !metadata ? 'Loading'
    : !metadata ? null
    : !supported ? 'Firmware update required'
    : busy ? 'Working'
    : metadata.configured ? (metadata.enabled ? 'On' : 'Off')
    : 'Not set up';
  const issueFor = (field: WakePcDraftField) => controller.validation?.field === field ? controller.validation.message : null;
  const ssidIssue = issueFor('ssid');
  const passwordIssue = issueFor('password');
  const countryIssue = issueFor('country');
  const adapterIssue = issueFor('targetMac');
  const renderCountry = (label: string, value: string) => (
    value === WOL_WORLDWIDE_COUNTRY ? <span>{label}</span> : <LiteralText>{label}</LiteralText>
  );
  const renderAdapter = (label: string) => <LiteralText>{label}</LiteralText>;

  return (
    <div className="settings-menu-row wake-pc-panel" aria-busy={busy || undefined}>
      <div className="wake-pc-header">
        <div className="settings-menu-copy">
          <strong id={`${fieldId}-title`}>Wake-on-LAN</strong>
          <span>Wakes this PC over your Wi-Fi when USB wake is not enough.</span>
        </div>
        {statusLabel ? <span className={`wake-pc-status ${metadata?.enabled && !busy ? 'on' : ''}`}>{statusLabel}</span> : null}
      </div>

      {connected && controller.loading && !metadata ? <p className="wake-pc-note" role="status">Loading wake settings…</p> : null}

      {metadata && !supported ? (
        <p className="wake-pc-note" role="status">Update the bridge firmware to use Wake-on-LAN.</p>
      ) : null}

      {supported && controllerConnected ? (
        <p className="wake-pc-note warning" role="note">
          <IconAlertTriangle size={16} aria-hidden="true" />
          Turn off your controller to set up or change Wake-on-LAN.
        </p>
      ) : null}

      {supported && metadata?.configured && !controller.editing ? (
        <div className="wake-pc-saved">
          <dl className="wake-pc-summary">
            <div><dt>Network</dt><dd><LiteralText>{metadata.ssid}</LiteralText></dd></div>
            <div>
              <dt>Adapter</dt>
              <dd>{savedTarget ? <LiteralText>{adapterLabel(savedTarget)}</LiteralText> : <LiteralText>{metadata.targetMac}</LiteralText>}</dd>
            </div>
            <div><dt>Region</dt><dd>{renderCountry(regionName(metadata.country), metadata.country)}</dd></div>
            <div><dt>Status</dt><dd>{WAKE_PC_STAGE_LABELS[metadata.stage]}</dd></div>
          </dl>
          {metadata.targetOwnedByThisPc === false ? (
            <p className="wake-pc-note warning" role="note">
              <IconAlertTriangle size={16} aria-hidden="true" />
              Saved for an adapter that isn’t on this PC.
            </p>
          ) : null}
          {controller.confirmingForget ? (
            <div className="wake-pc-confirm" role="alertdialog" aria-labelledby={`${fieldId}-forget`}>
              <p id={`${fieldId}-forget`}>Forget the saved network? The bridge stops waking this PC over Wi-Fi until you set it up again.</p>
              <div className="wake-pc-actions">
                <button type="button" className="secondary-action" onClick={controller.keepSavedNetwork}>Keep</button>
                <button type="button" className="heading-action danger" disabled={changesLocked} onClick={() => void controller.forget()}>
                  Forget Network
                </button>
              </div>
            </div>
          ) : (
            <div className="wake-pc-saved-actions">
              <label className="wake-pc-enabled">
                <span>Enabled</span>
                <button
                  type="button"
                  role="switch"
                  aria-label="Enabled"
                  aria-checked={metadata.enabled}
                  className={`switch ${metadata.enabled ? 'on' : ''}`}
                  disabled={changesLocked}
                  onClick={controller.toggleEnabled}
                >
                  <span />
                </button>
              </label>
              <div className="wake-pc-actions">
                <button type="button" className="heading-action" disabled={changesLocked} onClick={controller.startChange}>Change</button>
                <button type="button" className="heading-action danger" disabled={changesLocked} onClick={controller.askToForget}>Forget</button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {showForm ? (
        <form
          className="wake-pc-form"
          autoComplete="off"
          aria-labelledby={`${fieldId}-title`}
          onSubmit={(event) => {
            event.preventDefault();
            void controller.testAndSave();
          }}
        >
          <fieldset disabled={changesLocked}>
            <label htmlFor={`${fieldId}-ssid`}>Network name</label>
            <div className="wake-pc-field">
              <input
                id={`${fieldId}-ssid`}
                value={draft.ssid}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                aria-invalid={Boolean(ssidIssue) || undefined}
                onChange={(event) => controller.setDraft({ ...draft, ssid: event.target.value })}
              />
              {ssidIssue ? <span className="wake-pc-hint error" role="alert">{ssidIssue}</span> : null}
            </div>

            <label htmlFor={`${fieldId}-password`}>Password</label>
            <div className="wake-pc-field">
              <input
                id={`${fieldId}-password`}
                type="password"
                value={draft.password}
                autoComplete="new-password"
                maxLength={63}
                spellCheck={false}
                autoCapitalize="none"
                aria-invalid={Boolean(passwordIssue) || undefined}
                aria-describedby={`${fieldId}-password-hint`}
                onChange={(event) => controller.setDraft({ ...draft, password: event.target.value })}
              />
              <span id={`${fieldId}-password-hint`} className={`wake-pc-hint ${passwordIssue ? 'error' : ''}`}
                role={passwordIssue ? 'alert' : undefined}>
                {passwordIssue ?? '2.4 GHz WPA2-Personal networks only. The password is sent to the bridge and not kept here.'}
              </span>
            </div>

            <span className="wake-pc-label">Country / region</span>
            <div className="wake-pc-field">
              <CustomSelect
                value={draft.country}
                options={countryOptions}
                className="wake-pc-select"
                ariaLabel="Country / region"
                floatingMenu
                floatingMenuFitContent={false}
                renderValue={renderCountry}
                renderOption={renderCountry}
                onChange={(country) => controller.setDraft({ ...draft, country })}
              />
              {countryIssue ? <span className="wake-pc-hint error" role="alert">{countryIssue}</span> : null}
            </div>

            <span className="wake-pc-label">Ethernet adapter</span>
            <div className="wake-pc-field">
              <div className="wake-pc-adapter-row">
                <CustomSelect
                  value={draft.targetMac}
                  options={targetOptions}
                  className="wake-pc-select"
                  ariaLabel="Ethernet adapter"
                  valueLabel={controller.targets.length ? 'Select an adapter' : 'No Ethernet adapter found'}
                  disabled={controller.targets.length === 0}
                  floatingMenu
                  floatingMenuFitContent={false}
                  renderValue={(label, value) => value ? renderAdapter(label) : <span>{label}</span>}
                  renderOption={renderAdapter}
                  onChange={(targetMac) => controller.setDraft({ ...draft, targetMac })}
                />
                <button
                  type="button"
                  className="heading-action wake-pc-refresh"
                  aria-label="Refresh adapters"
                  title="Refresh adapters"
                  aria-busy={controller.refreshingTargets || undefined}
                  onClick={() => void controller.refreshTargets()}
                >
                  <IconRefresh size={16} aria-hidden="true" />
                </button>
              </div>
              {controller.targetsUnavailable ? (
                <span className="wake-pc-hint warning">Couldn’t read this PC’s Ethernet adapters. Refresh to try again.</span>
              ) : controller.targets.length === 0 && !controller.loading ? (
                <span className="wake-pc-hint warning">This PC has no Ethernet adapter. Wake-on-LAN needs a wired connection.</span>
              ) : null}
              {adapterIssue ? <span className="wake-pc-hint error" role="alert">{adapterIssue}</span> : null}
            </div>

            <label className="wake-pc-checkbox">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => controller.setDraft({ ...draft, enabled: event.target.checked })}
              />
              <span>Enabled</span>
            </label>

            <div className="wake-pc-actions">
              {controller.editing ? (
                <button type="button" className="secondary-action" onClick={controller.cancelChange}>Cancel</button>
              ) : null}
              <button type="submit" className="heading-action primary">Test and Save</button>
            </div>
          </fieldset>
        </form>
      ) : null}

      <div ref={feedbackRef} className="wake-pc-feedback">
      {operation === 'test' ? (
        <div className="wake-pc-progress" role="status" aria-live="polite">
          <ol>
            {WAKE_PC_PROGRESS_STEPS.map((step, index) => {
              const currentIndex = WAKE_PC_PROGRESS_STEPS.findIndex(({ id }) => id === wakePcProgressStep(metadata?.stage));
              const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending';
              return (
                <li key={step.id} className={state} aria-current={state === 'current' ? 'step' : undefined}>
                  <span className="wake-pc-step-marker" aria-hidden="true">
                    {state === 'done' ? <IconCheck size={13} /> : index + 1}
                  </span>
                  {step.label}
                </li>
              );
            })}
          </ol>
          <button type="button" className="secondary-action" disabled={controller.canceling} onClick={() => void controller.cancel()}>
            {controller.canceling ? 'Canceling…' : 'Cancel'}
          </button>
        </div>
      ) : null}

      {controller.message ? <p className="wake-pc-result good" role="status">{controller.message}</p> : null}
      {controller.error ? <p className="wake-pc-result bad" role="alert">{controller.error}</p> : null}
      </div>
    </div>
  );
}
