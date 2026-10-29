import {
  IconAdjustmentsHorizontal as Settings2,
  IconDeviceFloppy as Save,
  IconKeyboard as Keyboard,
  IconMicrophoneOff as MicOff,
  IconPencil as Pencil,
  IconRefresh as RefreshCcw,
  IconStethoscope,
  IconTool,
  IconTrash as Trash2,
  IconVolumeOff as VolumeX,
  IconX as X
} from '@tabler/icons-react';
import type { BridgeSnapshot } from '@shared/types';
import { ProfileSaveStatus } from '../../common/ProfileSaveStatus';
import { controllerName, healthLabel, healthTitle } from '../../common/controller-status';
import { HOST_PERSONA_OPTIONS } from '../../common/host-persona';
import { InlineSelect as CustomSelect } from '../../components/InlineSelect';
import { HostPersonaOption } from './HostPersonaOption';
import {
  MUTE_BUTTON_MODE_OPTIONS,
  MUTE_KEYBOARD_BEHAVIOR_OPTIONS,
  MUTE_KEY_OPTIONS,
  MUTE_MODIFIER_OPTIONS,
  POLLING_RATE_OPTIONS,
  controllerProfileSettingsFromSnapshot
} from './model';
import { SystemProfileSummary } from './SystemProfileSummary';
import { UptimeValue } from './UptimeValue';
import type { SystemController } from './use-system-controller';

export interface SystemPageProps {
  readonly active: boolean;
  readonly controller: SystemController;
  readonly snapshot: BridgeSnapshot;
  readonly connected: boolean;
  readonly controllerConnected: boolean;
  readonly pendingAction: string | null;
  readonly controllerPowerSavingActive: boolean;
  /** A feedback, speaker, or light bar change is still being written. */
  readonly restoreBlocked: boolean;
}

/** Profiles, the mute button, device and diagnostics cards, and the emergency repair dialog. */
export function SystemPage({
  active,
  controller,
  snapshot,
  connected,
  controllerConnected,
  pendingAction,
  controllerPowerSavingActive,
  restoreBlocked
}: SystemPageProps) {
  const {
    showDiagnostics,
    setShowDiagnostics,
    controllerProfileDialogMode,
    controllerProfileNameDraft,
    setControllerProfileNameDraft,
    deviceCleanupConfirmVisible,
    deviceCleanupMessage,
    deviceCleanupError,
    selectedControllerProfile,
    selectedControllerProfileId,
    controllerProfileOptions,
    selectedControllerProfileIsDefault,
    canDeleteControllerProfile,
    muteButtonActionsSupported,
    pollingRateControlSupported,
    hostPersonaControlSupported,
    hostPersonaSwitchAvailable,
    hostPersonaOptions,
    personaTransitionActive,
    statusTone,
    systemHealthTone,
    diagnosticsVisible,
    ackText,
    audioDebugText,
    audioEventLogText,
    triggerTraceText,
    feedbackTraceText,
    firmwareLogStatus,
    selectControllerProfile,
    renameControllerProfile,
    saveControllerProfile,
    deleteControllerProfile,
    closeControllerProfileDialog,
    submitControllerProfileDialog,
    chooseFirmwareLogDirectory,
    clearFirmwareLogDirectory,
    openDeviceCleanupConfirm,
    closeDeviceCleanupConfirm,
    runWindowsDeviceCleanup,
    setMuteButtonAction,
    setMuteModifier,
    setPollingRateMode,
    setHostPersonaMode,
    restoreDefaults
  } = controller;

  return (
    <>
      <div
        className={`control-page system-page ${active ? 'active' : ''}`}
        role="tabpanel"
        id="control-panel-system"
        aria-labelledby="control-tab-system"
        aria-hidden={!active}
      >
        <div className="feature-heading system-heading">
          <div>
            <h2>System</h2>
            <p>Configure bridge behavior and defaults.</p>
          </div>
          <div className="profile-controls">
            <button
              className="heading-icon-action emergency-repair-button"
              type="button"
              title="Emergency device repair"
              aria-label="Emergency device repair"
              disabled={pendingAction !== null}
              onClick={openDeviceCleanupConfirm}
            >
              <IconTool size={20} />
            </button>
            <CustomSelect
              value={selectedControllerProfileId}
              disabled={!connected || pendingAction !== null}
              options={controllerProfileOptions}
              ariaLabel="System profile"
              onChange={selectControllerProfile}
            />
            <button
              className="heading-action"
              type="button"
              disabled={!connected || pendingAction !== null || restoreBlocked}
              onClick={restoreDefaults}
            >
              <RefreshCcw size={18} />
              Restore Defaults
            </button>
          </div>
        </div>

        <div className="feature-card-grid">
          <section className="system-card mute-card">
            <div className="feature-card-title system-card-heading">
              <span className="feature-icon system-icon icon-wide"><MicOff size={20} /></span>
              <div className="title-copy">
                <h3>Mute Button</h3>
                <p>Set controller mute behavior.</p>
              </div>
            </div>
            <div className="system-fields">
              <div className="select-row">
                <span>Behavior</span>
                <CustomSelect
                  value={snapshot.settings.muteButtonMode}
                  disabled={!connected || !muteButtonActionsSupported || pendingAction !== null}
                  options={MUTE_BUTTON_MODE_OPTIONS}
                  ariaLabel="Mute button behavior"
                  onChange={(mode) => setMuteButtonAction(mode)}
                />
              </div>
              {snapshot.settings.muteButtonMode === 'keyboard' && (
                <>
                  <div className="select-row">
                    <span>Key</span>
                    <CustomSelect
                      value={snapshot.settings.muteKeyboardUsage}
                      disabled={!connected || !muteButtonActionsSupported || pendingAction !== null}
                      options={MUTE_KEY_OPTIONS}
                      ariaLabel="Mute keyboard key"
                      onChange={(usage) => setMuteButtonAction('keyboard', usage)}
                    />
                  </div>
                  <div className="select-row">
                    <span>Press Mode</span>
                    <CustomSelect
                      value={snapshot.settings.muteKeyboardBehavior}
                      disabled={!connected || !muteButtonActionsSupported || pendingAction !== null}
                      options={MUTE_KEYBOARD_BEHAVIOR_OPTIONS}
                      ariaLabel="Mute keyboard press mode"
                      onChange={(behavior) => setMuteButtonAction('keyboard', undefined, undefined, behavior)}
                    />
                  </div>
                  <div className="modifier-block">
                    <div className="modifier-grid" aria-label="Keyboard modifiers">
                      {MUTE_MODIFIER_OPTIONS.map(([label, bit]) => {
                        const enabled = (snapshot.settings.muteKeyboardModifiers & bit) !== 0;
                        return (
                          <button
                            key={bit}
                            type="button"
                            className={enabled ? 'active' : ''}
                            disabled={!connected || !muteButtonActionsSupported || pendingAction !== null}
                            onClick={() => setMuteModifier(bit, !enabled)}
                          >
                            <Keyboard size={16} />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="select-row">
                    <span
                      className="settings-menu-copy-tooltip chord-starter-label"
                      tabIndex={0}
                      aria-describedby="mute-chord-starter-tooltip"
                    >
                      Chord Starter
                      <span
                        id="mute-chord-starter-tooltip"
                        className="settings-shortcut-tooltip chord-starter-tooltip"
                        role="tooltip"
                      >
                        Lets Mute start a chord. When enabled, the keyboard key waits 250ms so a chord can be detected first.
                      </span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={snapshot.settings.muteKeyboardChordStarterEnabled}
                      className={`switch ${snapshot.settings.muteKeyboardChordStarterEnabled ? 'on' : ''}`}
                      disabled={!connected || !muteButtonActionsSupported || pendingAction !== null}
                      onClick={() => setMuteButtonAction(
                        'keyboard',
                        undefined,
                        undefined,
                        undefined,
                        !snapshot.settings.muteKeyboardChordStarterEnabled
                      )}
                    >
                      <span />
                    </button>
                  </div>
                </>
              )}
              {snapshot.settings.muteButtonMode === 'quiet' && (
                <div className={`quiet-state ${snapshot.status?.quietModeEnabled ? 'active' : ''}`}>
                  <VolumeX size={18} />
                  <span>{snapshot.status?.quietModeEnabled ? 'Controller Quiet On' : 'Controller Quiet Off'}</span>
                </div>
              )}
            </div>
          </section>

          <section className={`system-card device-card ${showDiagnostics ? 'expanded' : ''}`}>
            <div className="feature-card-title system-card-heading">
              <span className="feature-icon system-icon icon-wide">
                {showDiagnostics ? <IconStethoscope size={20} /> : <Settings2 size={20} />}
              </span>
              <div className="title-copy">
                <h3>{showDiagnostics ? 'Diagnostics' : 'Device'}</h3>
                <p>{showDiagnostics ? 'Debug Data' : 'Firmware'}</p>
              </div>
              <div className="dual-selector system-mode-selector" role="tablist" aria-label="System control mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!showDiagnostics}
                  className={!showDiagnostics ? 'active' : ''}
                  onClick={() => setShowDiagnostics(false)}
                >
                  Device
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={showDiagnostics}
                  className={showDiagnostics ? 'active' : ''}
                  onClick={() => setShowDiagnostics(true)}
                >
                  Diagnostics
                </button>
              </div>
            </div>
            {showDiagnostics ? (
              <div className="device-diagnostics">
                <dl>
                  <div><dt>Protocol</dt><dd>{snapshot.diagnostics.protocolVersion ?? '--'}</dd></div>
                  <div>
                    <dt>Uptime</dt>
                    <dd>
                      <UptimeValue
                        active={diagnosticsVisible}
                        lastPollAt={snapshot.diagnostics.lastPollAt}
                        uptimeSeconds={snapshot.diagnostics.uptimeSeconds}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>Revision</dt>
                    <dd><span className="diagnostic-number">{snapshot.diagnostics.settingsRevision ?? '--'}</span></dd>
                  </div>
                  <div><dt>Last ACK</dt><dd>{ackText}</dd></div>
                  <div><dt>HID Path</dt><dd>{snapshot.diagnostics.hidPath ?? '--'}</dd></div>
                  <div className="debug-entry firmware-log-entry">
                    <dt>Firmware UART Log</dt>
                    <dd>
                      <div className="firmware-log-details">
                        <span>{firmwareLogStatus}</span>
                        <span title={snapshot.diagnostics.firmwareLogDirectory ?? undefined}>
                          Folder: {snapshot.diagnostics.firmwareLogDirectory ?? '--'}
                        </span>
                        <span title={snapshot.diagnostics.firmwareLogPath ?? undefined}>
                          File: {snapshot.diagnostics.firmwareLogPath ?? '--'}
                        </span>
                        <span>
                          SRAM overwrite loss: <span className="diagnostic-number">{snapshot.diagnostics.firmwareLogDroppedBytes}</span> bytes
                        </span>
                      </div>
                      <div className="firmware-log-actions">
                        <button
                          type="button"
                          className="secondary-action"
                          disabled={pendingAction !== null}
                          onClick={chooseFirmwareLogDirectory}
                        >
                          Choose Folder
                        </button>
                        {snapshot.diagnostics.firmwareLogDirectory ? (
                          <button
                            type="button"
                            className="secondary-action"
                            disabled={pendingAction !== null}
                            onClick={clearFirmwareLogDirectory}
                          >
                            Stop Capture
                          </button>
                        ) : null}
                      </div>
                    </dd>
                  </div>
                  <div>
                    <dt>Audio Log</dt>
                    <dd title={snapshot.diagnostics.audioDebugLogPath ?? undefined}>
                      {snapshot.diagnostics.audioDebugLogPath ?? '--'}
                    </dd>
                  </div>
                  <div>
                    <dt>Dropped</dt>
                    <dd><span className="diagnostic-number">{snapshot.diagnostics.audioDebugDroppedCount}</span></dd>
                  </div>
                  <div>
                    <dt>Trigger Drop</dt>
                    <dd><span className="diagnostic-number">{snapshot.diagnostics.triggerTraceDroppedCount}</span></dd>
                  </div>
                  <div>
                    <dt>Feedback Drop</dt>
                    <dd><span className="diagnostic-number">{snapshot.diagnostics.feedbackTraceDroppedCount}</span></dd>
                  </div>
                  <div className="debug-entry">
                    <dt>Audio Debug</dt>
                    <dd>
                      <textarea readOnly value={audioDebugText} aria-label="Audio debug copy text" />
                    </dd>
                  </div>
                  <div className="debug-entry">
                    <dt>Audio Events</dt>
                    <dd>
                      <textarea readOnly value={audioEventLogText} aria-label="Audio event log text" />
                    </dd>
                  </div>
                  <div className="debug-entry">
                    <dt>Trigger Trace</dt>
                    <dd>
                      <textarea readOnly value={triggerTraceText} aria-label="Trigger trace text" />
                    </dd>
                  </div>
                  <div className="debug-entry">
                    <dt>Feedback Trace</dt>
                    <dd>
                      <textarea readOnly value={feedbackTraceText} aria-label="Feedback trace text" />
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="device-list">
                <div className="device-row">
                  <span>Firmware</span>
                  <strong>{snapshot.status?.firmwareVersion ?? '--'}</strong>
                </div>
                <div className="device-row">
                  <span>Controller</span>
                  <strong>{controllerConnected ? controllerName(snapshot.status?.controllerType) : '--'}</strong>
                </div>
                <div className="device-row device-control-row">
                  <span>Polling Rate</span>
                  <CustomSelect
                    value={snapshot.settings.pollingRateMode}
                    disabled={!connected || !pollingRateControlSupported || pendingAction !== null}
                    options={POLLING_RATE_OPTIONS}
                    ariaLabel="Polling rate"
                    onChange={setPollingRateMode}
                  />
                </div>
                <div className="device-row device-control-row">
                  <span>Host Controller</span>
                  <CustomSelect
                    value={snapshot.settings.hostPersonaMode}
                    disabled={!hostPersonaSwitchAvailable}
                    options={hostPersonaOptions.length > 0 ? hostPersonaOptions : HOST_PERSONA_OPTIONS.slice(0, 1)}
                    className="host-persona-selector"
                    ariaLabel="Host controller persona"
                    getOptionClassName={(_, mode) => (mode === 'xbox' ? 'host-persona-platform-break' : undefined)}
                    renderValue={(label, mode) => <HostPersonaOption label={label} value={mode} />}
                    renderOption={(label, mode) => <HostPersonaOption label={label} value={mode} />}
                    onChange={setHostPersonaMode}
                  />
                </div>
                <div className="device-row device-status-row">
                  <span>Status</span>
                  <strong className={`health-label ${systemHealthTone}`} title={healthTitle(snapshot)}>
                    <span className={`dot ${systemHealthTone === 'good' ? statusTone : systemHealthTone}`} />
                    {healthLabel(snapshot)}
                  </strong>
                </div>
              </div>
            )}
          </section>
        </div>
        <section className="system-profile-panel" aria-label="System profiles">
          <div className="system-profile-strip">
            <ProfileSaveStatus />
            <div className="remapping-profile-actions">
              <button
                type="button"
                disabled={selectedControllerProfileIsDefault || pendingAction !== null}
                onClick={renameControllerProfile}
              >
                <Pencil size={15} />
                Rename Profile
              </button>
              <button
                type="button"
                disabled={pendingAction !== null}
                onClick={saveControllerProfile}
              >
                <Save size={15} />
                Save New Profile
              </button>
              <button
                type="button"
                disabled={!canDeleteControllerProfile || pendingAction !== null}
                onClick={deleteControllerProfile}
              >
                <Trash2 size={15} />
                Delete Profile
              </button>
            </div>
          </div>
          <SystemProfileSummary
            settings={controllerProfileSettingsFromSnapshot(snapshot)}
            powerSavingActive={controllerPowerSavingActive}
          />
        </section>
      </div>

      {deviceCleanupConfirmVisible && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeDeviceCleanupConfirm}
        >
          <form
            className="settings-menu bridge-settings-modal device-cleanup-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Emergency device repair"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void runWindowsDeviceCleanup();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <IconTool size={16} />
                <span>Emergency Device Repair</span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close emergency device repair dialog"
                disabled={pendingAction === 'device-cleanup'}
                onClick={closeDeviceCleanupConfirm}
              >
                <X size={16} />
              </button>
            </div>
            <div className="device-cleanup-copy">
              <p>
                Only run this if you are running into persistent odd controller, rumble, haptics, audio, or Windows device issues.
              </p>
              <p>
                Disconnect the controller from the bridge before running this repair.
              </p>
              <ul>
                <li>Removes stale Windows DualSense, DualSense Edge, DS5 Bridge USB/HID, audio endpoint, and Bluetooth pairing records.</li>
                <li>Controller identity based profiles in Steam, emulators, or other tools may need to be assigned again.</li>
                <li>DualSense controllers paired directly to Windows over Bluetooth may need to be paired again.</li>
              </ul>
              {controllerConnected && (
                <div className="device-cleanup-alert bad">
                  Controller is still connected to the bridge.
                </div>
              )}
              {deviceCleanupError && (
                <div className="device-cleanup-alert bad">
                  {deviceCleanupError}
                </div>
              )}
              {deviceCleanupMessage && (
                <div className="device-cleanup-alert good">
                  {deviceCleanupMessage}
                </div>
              )}
            </div>
            <div className="remap-profile-dialog-actions">
              <button
                type="button"
                className="secondary-action"
                disabled={pendingAction === 'device-cleanup'}
                onClick={closeDeviceCleanupConfirm}
              >
                Close
              </button>
              <button
                type="submit"
                className="primary-action danger"
                disabled={pendingAction !== null || controllerConnected}
              >
                {pendingAction === 'device-cleanup' ? 'Running...' : 'Run Repair'}
              </button>
            </div>
          </form>
        </div>
      )}

      {controllerProfileDialogMode && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeControllerProfileDialog}
        >
          <form
            className="settings-menu bridge-settings-modal remap-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="System profile"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              submitControllerProfileDialog();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                {controllerProfileDialogMode === 'delete' ? <Trash2 size={16} /> : <Save size={16} />}
                <span>
                  {controllerProfileDialogMode === 'save'
                    ? 'Save New Profile'
                    : controllerProfileDialogMode === 'rename'
                      ? 'Rename Profile'
                      : 'Delete Profile'}
                </span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close system profile dialog"
                onClick={closeControllerProfileDialog}
              >
                <X size={16} />
              </button>
            </div>
            {controllerProfileDialogMode === 'delete' ? (
              <p className="remap-profile-dialog-copy">
                {`Delete ${selectedControllerProfile?.name ?? 'this profile'}?`}
              </p>
            ) : (
              <label className="remap-profile-name-field">
                <span>Profile Name</span>
                <input
                  autoFocus
                  value={controllerProfileNameDraft}
                  maxLength={48}
                  onChange={(event) => setControllerProfileNameDraft(event.target.value)}
                />
              </label>
            )}
            <div className="remap-profile-dialog-actions">
              <button type="button" className="secondary-action" onClick={closeControllerProfileDialog}>
                Cancel
              </button>
              <button
                type="submit"
                className={`primary-action ${controllerProfileDialogMode === 'delete' ? 'danger' : ''}`}
                disabled={pendingAction !== null || (controllerProfileDialogMode !== 'delete' && controllerProfileNameDraft.trim().length === 0)}
              >
                {controllerProfileDialogMode === 'delete' ? 'Delete' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
