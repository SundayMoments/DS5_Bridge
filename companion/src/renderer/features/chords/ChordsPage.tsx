import type { CSSProperties } from 'react';
import {
  IconBooks,
  IconDeviceGamepad3,
  IconMinus as Minus,
  IconPencil as Pencil,
  IconPlus as Plus,
  IconReplace,
  IconTrash as Trash2
} from '@tabler/icons-react';
import type { BridgeSnapshot } from '@shared/types';
import { InlineSelect as CustomSelect } from '../../components/InlineSelect';
import type { ChordsController } from './use-chords-controller';
import { CHORD_CONTROLLER_SETTING_STEP_MAX, CHORD_CONTROLLER_SETTING_STEP_MIN, ChordFunction, MAX_KEYBOARD_FUNCTION_KEYS, normalizeChordControllerSettingStepPercent } from '@shared/protocol';
import { CHORD_CONTROLLER_SETTING_ACTION_OPTIONS, CHORD_FUNCTION_TYPE_OPTIONS, CHORD_KEYBOARD_KEY_MAX_LABEL_LENGTH, CHORD_KEYBOARD_KEY_OPTIONS, CHORD_KEYBOARD_MODIFIER_OPTIONS, CHORD_MEDIA_ACTION_OPTIONS, CHORD_UNASSIGNED_BUTTON, chordAssignmentKey, chordAssignmentLabel, chordControllerSettingActionFromSelectValue, chordControllerSettingAdjustmentText, chordControllerSettingSelectValue, chordFunctionSummary, chordFunctionToDraft, chordFunctionTypeLabel, chordKeyboardKeyUnavailable, chordKeyboardModifierUnavailable, chordNotchTargetForAction } from './model';
import { ChordButtonGlyphOption, ChordStarterGlyphOption } from './ChordGlyphs';

export interface ChordsPageProps {
  readonly active: boolean;
  readonly controller: ChordsController;
  readonly snapshot: BridgeSnapshot;
  readonly pendingAction: string | null;
}

export function ChordsPage({ active, controller, snapshot, pendingAction }: ChordsPageProps) {
  const activeControlTab = active ? 'chords' : '';
  const {
    setSelectedChordFunctionId,
    chordFunctionDraft,
    setChordFunctionDraft,
    chordFunctionDialog,
    chordAssignmentDraftRows,
    draggedChordAssignmentId,
    chordAssignmentDropHint,
    chordAssignmentScrollbar,
    chordAssignmentListRef,
    chordFunctions,
    chordAssignments,
    selectedChordFunction,
    chordAssignmentConflictState,
    chordFunctionOptions,
    chordStarterOptionsFor,
    muteChordStarterIsInactive,
    chordButtonOptionsFor,
    canAddChordDraft,
    chordAssignmentsSubtitle,
    createChordFunction,
    commitChordFunctionDraft,
    setChordFunctionKeyboardKey,
    toggleChordFunctionKeyboardModifier,
    setChordFunctionControllerAction,
    setChordFunctionControllerStepPercent,
    openChordFunctionDialog,
    addChordAssignmentDraft,
    updateChordAssignmentDraftStarter,
    updateChordAssignmentDraftButton,
    updateChordAssignmentDraftFunction,
    deleteChordAssignmentDraft,
    updateChordAssignmentStarter,
    updateChordAssignmentButton,
    setChordAssignmentFunction,
    deleteChordAssignment,
    updateChordAssignmentScrollbar,
    startChordAssignmentScrollbarDrag,
    startChordAssignmentPointerDrag
  } = controller;

  function renderChordFunctionSummary(func: ChordFunction) {
    const notchTarget = func.type === 'controller-setting'
      ? chordNotchTargetForAction(func.action)
      : null;
    const detailLabel = func.type === 'keyboard'
      ? 'Keys'
      : notchTarget
        ? 'Adjustment'
        : 'Action';
    const detailValue = func.type === 'controller-setting' && notchTarget
      ? chordControllerSettingAdjustmentText(func.action)
      : chordFunctionSummary(func);

    return (
      <div className="chords-function-summary chords-function-summary-grouped">
        <div className="chords-function-summary-header">
          <span>Summary</span>
          {func.type === 'controller-setting' && notchTarget ? (
            <div className="chords-function-summary-options">
              <label className="chords-step-selector">
                <span>Step</span>
                <input
                  type="number"
                  min={CHORD_CONTROLLER_SETTING_STEP_MIN}
                  max={CHORD_CONTROLLER_SETTING_STEP_MAX}
                  step={1}
                  value={chordFunctionDraft.id === func.id ? chordFunctionDraft.controllerStepPercent : func.stepPercent}
                  disabled={pendingAction !== null}
                  aria-label={`${notchTarget.target.label} step percent`}
                  onChange={(event) => {
                    const nextValue = normalizeChordControllerSettingStepPercent(event.target.value);
                    setChordFunctionDraft((draft) => ({ ...draft, controllerStepPercent: nextValue }));
                  }}
                  onBlur={(event) => {
                    setChordFunctionControllerStepPercent(Number(event.currentTarget.value));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur();
                    }
                  }}
                />
                <small>%</small>
              </label>
              <div className="dual-selector chords-notch-direction-selector" role="group" aria-label={`${notchTarget.target.label} direction`}>
                <button
                  type="button"
                  className={notchTarget.direction === 'down' ? 'active' : ''}
                  title={`Decrease ${notchTarget.target.label}`}
                  aria-label={`Decrease ${notchTarget.target.label}`}
                  disabled={pendingAction !== null}
                  onClick={() => setChordFunctionControllerAction(notchTarget.target.downAction)}
                >
                  <Minus size={15} />
                </button>
                <button
                  type="button"
                  className={notchTarget.direction === 'up' ? 'active' : ''}
                  title={`Increase ${notchTarget.target.label}`}
                  aria-label={`Increase ${notchTarget.target.label}`}
                  disabled={pendingAction !== null}
                  onClick={() => setChordFunctionControllerAction(notchTarget.target.upAction)}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="chords-function-summary-detail">
          <div className="chords-function-summary-detail-row">
            <span>Type</span>
            <strong>{chordFunctionTypeLabel(func.type)}</strong>
          </div>
          <div className="chords-function-summary-detail-row">
            <span>{detailLabel}</span>
            <strong>
              {detailValue}
              {func.type === 'controller-setting' && notchTarget ? (
                <em> — {func.stepPercent}% step</em>
              ) : null}
            </strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`control-page chords-page ${activeControlTab === 'chords' ? 'active' : ''}`}
      role="tabpanel"
      id="control-panel-chords"
      aria-labelledby="control-tab-chords"
      aria-hidden={activeControlTab !== 'chords'}
    >
        <div className="feature-heading studio-feature-heading chords-heading">
          <div className="studio-heading-copy">
            <span className="feature-icon"><IconReplace size={20} /></span>
            <div>
              <h2>Chords</h2>
              <p>Assign reusable functions to controller buttons and starter chords.</p>
            </div>
          </div>
        </div>

        <div className="chords-layout">
          <section className="feature-card chords-card chords-function-card">
            <div className="feature-card-title">
              <span className="feature-icon">
                <IconBooks size={24} />
              </span>
              <div className="title-copy">
                <h3>Function Library</h3>
                <p>Create actions.</p>
              </div>
            </div>

            <div className="chords-function-strip">
              <CustomSelect
                value={selectedChordFunction?.id ?? ''}
                options={chordFunctionOptions}
                disabled={pendingAction !== null || chordFunctions.length === 0}
                ariaLabel="Chord function"
                className="chords-function-select"
                closeOnSelect={false}
                suspendOutsideClose={chordFunctionDialog !== null}
                onChange={(value) => {
                  const next = chordFunctions.find((func) => func.id === value) ?? null;
                  setSelectedChordFunctionId(value);
                  setChordFunctionDraft(chordFunctionToDraft(next));
                }}
                renderMenuFooter={() => (
                  selectedChordFunction ? (
                    <div className="trigger-lab-profile-actions chords-function-menu-actions">
                      <button
                        type="button"
                        title="Rename"
                        disabled={pendingAction !== null}
                        onClick={() => {
                          openChordFunctionDialog('rename');
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        disabled={pendingAction !== null}
                        onClick={() => {
                          openChordFunctionDialog('delete');
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : null
                )}
              />
              <button
                className="heading-icon-action chords-new-function-button"
                type="button"
                title="New Function"
                aria-label="New Function"
                disabled={pendingAction !== null}
                onClick={createChordFunction}
              >
                <Plus size={17} />
              </button>
            </div>

            {selectedChordFunction ? (
              <div className="chords-editor">
                <label className="chords-field chords-inline-field">
                  <span>Type</span>
                  <CustomSelect
                    value={chordFunctionDraft.type}
                    options={CHORD_FUNCTION_TYPE_OPTIONS}
                    disabled={pendingAction !== null}
                    ariaLabel="Chord function type"
                    onChange={(value) => {
                      const nextDraft = { ...chordFunctionDraft, type: value };
                      setChordFunctionDraft(nextDraft);
                      commitChordFunctionDraft(nextDraft);
                    }}
                  />
                </label>

                {chordFunctionDraft.type === 'keyboard' && (
                  <div
                    className="chords-keyboard-shortcut-builder"
                    aria-label="Keyboard shortcut"
                    style={{
                      '--chords-keyboard-key-label-width': `${CHORD_KEYBOARD_KEY_MAX_LABEL_LENGTH}ch`
                    } as CSSProperties}
                  >
                    <CustomSelect
                      className="chords-keyboard-key-select"
                      value={chordFunctionDraft.keyboardKey}
                      options={CHORD_KEYBOARD_KEY_OPTIONS}
                      disabled={pendingAction !== null}
                      isOptionDisabled={(key) => chordKeyboardKeyUnavailable(chordFunctionDraft, key)}
                      ariaLabel="Keyboard shortcut key"
                      onChange={setChordFunctionKeyboardKey}
                    />
                    <div className="chords-keyboard-modifiers" aria-label="Keyboard shortcut modifiers">
                      {CHORD_KEYBOARD_MODIFIER_OPTIONS.map(([label, modifier]) => {
                        const active = chordFunctionDraft.keyboardModifiers.includes(modifier);
                        const unavailable = chordKeyboardModifierUnavailable(chordFunctionDraft, modifier);
                        return (
                          <button
                            key={modifier}
                            type="button"
                            className={active ? 'active' : ''}
                            aria-pressed={active}
                            disabled={pendingAction !== null || unavailable}
                            onClick={() => toggleChordFunctionKeyboardModifier(modifier)}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {chordFunctionDraft.type === 'media' && (
                  <label className="chords-field chords-inline-field">
                    <span>Action</span>
                    <CustomSelect
                      value={chordFunctionDraft.mediaAction}
                      options={CHORD_MEDIA_ACTION_OPTIONS}
                      disabled={pendingAction !== null}
                      ariaLabel="Chord media action"
                      onChange={(value) => {
                        const nextDraft = { ...chordFunctionDraft, mediaAction: value };
                        setChordFunctionDraft(nextDraft);
                        commitChordFunctionDraft(nextDraft);
                      }}
                    />
                  </label>
                )}

                {chordFunctionDraft.type === 'controller-setting' && (
                  <label className="chords-field chords-inline-field">
                    <span>Action</span>
                    <CustomSelect
                      value={chordControllerSettingSelectValue(chordFunctionDraft.controllerAction)}
                      options={CHORD_CONTROLLER_SETTING_ACTION_OPTIONS}
                      disabled={pendingAction !== null}
                      ariaLabel="Chord controller setting action"
                      onChange={(value) => {
                        const nextDraft = {
                          ...chordFunctionDraft,
                          controllerAction: chordControllerSettingActionFromSelectValue(
                            value,
                            chordFunctionDraft.controllerAction
                          )
                        };
                        setChordFunctionDraft(nextDraft);
                        commitChordFunctionDraft(nextDraft);
                      }}
                    />
                  </label>
                )}

                {renderChordFunctionSummary(selectedChordFunction)}
              </div>
            ) : (
              <div className="chords-empty">
                <IconReplace size={26} />
                <strong>No functions yet</strong>
                <span>Create a function, then bind it to a button or chord.</span>
              </div>
            )}
          </section>

          <section className="feature-card chords-card chords-assignment-card">
            <div className="feature-card-title">
              <span className="feature-icon">
                <IconDeviceGamepad3 size={24} />
              </span>
              <div className="title-copy">
                <h3>Assignments</h3>
                <p>{chordAssignmentsSubtitle}</p>
              </div>
              {chordAssignmentConflictState.conflictCount > 0 ? (
                <span className="chords-conflict-badge" title="Duplicate, inactive, or shortcut-shadowed chord bindings">
                  <strong>{chordAssignmentConflictState.conflictCount}x</strong>
                  {chordAssignmentConflictState.conflictCount === 1 ? 'Conflict' : 'Conflicts'}
                </span>
              ) : null}
            </div>

            <div className="chords-assignment-builder">
              <button
                className="heading-action chords-new-chord-button"
                type="button"
                disabled={pendingAction !== null || !canAddChordDraft}
                onClick={addChordAssignmentDraft}
              >
                <IconReplace size={18} />
                New Chord
              </button>
            </div>

            <div className="chords-assignment-scroll-region">
              <div
                className="chords-assignment-list"
                ref={chordAssignmentListRef}
                aria-label="Chord assignments"
                onScroll={updateChordAssignmentScrollbar}
              >
                {chordAssignments.length + chordAssignmentDraftRows.length > 0 ? (
                  <>
                  {chordAssignmentDraftRows.map((row) => {
                    const func = chordFunctions.find((candidate) => candidate.id === row.functionId);
                    const starterOptions = chordStarterOptionsFor(row.starter);
                    const isInactiveMuteChord = muteChordStarterIsInactive(row.starter);
                    return (
                      <div
                        className={[
                          'chords-assignment-row',
                          'draft',
                          isInactiveMuteChord ? 'mute-starter-inactive' : ''
                        ].filter(Boolean).join(' ')}
                        key={row.id}
                      >
                        <div
                          className="chords-assignment-binding"
                          aria-label="New chord"
                          title="New chord"
                        >
                            <CustomSelect
                            value={row.starter}
                            options={starterOptions}
                            disabled={pendingAction !== null}
                            className="chords-inline-glyph-select chords-inline-starter-select"
                            floatingMenu
                            floatingMenuMinWidth={72}
                            showSelectedCheck={false}
                            ariaLabel="Chord starter"
                            renderValue={(label, value) => <ChordStarterGlyphOption label={label} value={value} />}
                            renderOption={(label, value) => <ChordStarterGlyphOption label={label} value={value} />}
                            onChange={(value) => updateChordAssignmentDraftStarter(row.id, value)}
                          />
                          <span className="chords-binding-connector" aria-hidden="true" />
                          <CustomSelect
                            value={row.button ?? CHORD_UNASSIGNED_BUTTON}
                            options={chordButtonOptionsFor(row.starter, true)}
                            disabled={pendingAction !== null}
                            className="chords-inline-glyph-select chords-inline-button-select"
                            floatingMenu
                            floatingMenuMinWidth={72}
                            showSelectedCheck={false}
                            ariaLabel="Chord button"
                            renderValue={(label, value) => <ChordButtonGlyphOption label={label} value={value} />}
                            renderOption={(label, value) => <ChordButtonGlyphOption label={label} value={value} />}
                            onChange={(value) => updateChordAssignmentDraftButton(row.id, value)}
                          />
                        </div>
                        <span className="chords-function-connector" aria-hidden="true" />
                        <CustomSelect
                          value={row.functionId}
                          options={chordFunctionOptions}
                          disabled={pendingAction !== null}
                          className="chords-assignment-function-select"
                          floatingMenu
                          ariaLabel="New chord function"
                          renderValue={(label) => (
                            <span className="chords-function-option">
                              <strong>{label}</strong>
                              <small>{func ? chordFunctionSummary(func) : 'Missing function'}</small>
                            </span>
                          )}
                          renderOption={(label, value) => {
                            const optionFunction = chordFunctions.find((candidate) => candidate.id === value);
                            return (
                              <span className="chords-function-option">
                                <strong>{label}</strong>
                                <small>{optionFunction ? chordFunctionSummary(optionFunction) : 'Missing function'}</small>
                              </span>
                            );
                          }}
                          onChange={(value) => updateChordAssignmentDraftFunction(row.id, value)}
                        />
                        <button
                          className="heading-icon-action"
                          type="button"
                          title="Remove assignment"
                          disabled={pendingAction !== null}
                          onClick={() => deleteChordAssignmentDraft(row.id)}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    );
                  })}
                  {chordAssignments.map((assignment, assignmentIndex) => {
                  const func = chordFunctions.find((candidate) => candidate.id === assignment.functionId);
                  const hasConflict = chordAssignmentConflictState.conflictKeys.has(chordAssignmentKey(assignment));
                  const starterOptions = chordStarterOptionsFor(assignment.starter);
                  const isInactiveMuteChord = muteChordStarterIsInactive(assignment.starter);
                  const dropPlacement = chordAssignmentDropHint?.targetId === assignment.id
                    ? chordAssignmentDropHint.placement
                    : null;
                  return (
                    <div
                      className={[
                        'chords-assignment-row',
                        hasConflict ? 'conflict' : '',
                        isInactiveMuteChord ? 'mute-starter-inactive' : '',
                        draggedChordAssignmentId === assignment.id ? 'dragging' : '',
                        dropPlacement === 'before' ? 'drop-before' : '',
                        dropPlacement === 'after' ? 'drop-after' : '',
                        assignmentIndex === 0 && dropPlacement === 'before' ? 'drop-list-start' : ''
                      ].filter(Boolean).join(' ')}
                      key={assignment.id}
                      data-assignment-id={assignment.id}
                      onPointerDown={(event) => startChordAssignmentPointerDrag(event, assignment.id)}
                    >
                      <div
                        className="chords-assignment-binding"
                        aria-label={chordAssignmentLabel(assignment)}
                        title={chordAssignmentLabel(assignment)}
                      >
                          <CustomSelect
                          value={assignment.starter}
                          options={starterOptions}
                          disabled={pendingAction !== null}
                          className="chords-inline-glyph-select chords-inline-starter-select"
                          floatingMenu
                          floatingMenuMinWidth={72}
                          showSelectedCheck={false}
                          ariaLabel={`${chordAssignmentLabel(assignment)} starter`}
                          renderValue={(label, value) => <ChordStarterGlyphOption label={label} value={value} />}
                          renderOption={(label, value) => <ChordStarterGlyphOption label={label} value={value} />}
                          onChange={(value) => updateChordAssignmentStarter(assignment.id, value)}
                        />
                        <span className="chords-binding-connector" aria-hidden="true" />
                        <CustomSelect
                          value={assignment.button}
                          options={chordButtonOptionsFor(
                            assignment.starter,
                            false,
                            assignment.button
                          )}
                          disabled={pendingAction !== null}
                          className="chords-inline-glyph-select chords-inline-button-select"
                          floatingMenu
                          floatingMenuMinWidth={72}
                          showSelectedCheck={false}
                          ariaLabel={`${chordAssignmentLabel(assignment)} button`}
                          renderValue={(label, value) => <ChordButtonGlyphOption label={label} value={value} />}
                          renderOption={(label, value) => <ChordButtonGlyphOption label={label} value={value} />}
                          onChange={(value) => updateChordAssignmentButton(assignment.id, value)}
                        />
                      </div>
                      <span className="chords-function-connector" aria-hidden="true" />
                      <CustomSelect
                        value={assignment.functionId}
                        options={chordFunctionOptions}
                        disabled={pendingAction !== null}
                        className="chords-assignment-function-select"
                        floatingMenu
                        ariaLabel={`${chordAssignmentLabel(assignment)} function`}
                        renderValue={(label) => (
                          <span className="chords-function-option">
                            <strong>{label}</strong>
                            <small>{func ? chordFunctionSummary(func) : 'Missing function'}</small>
                          </span>
                        )}
                        renderOption={(label, value) => {
                          const optionFunction = chordFunctions.find((candidate) => candidate.id === value);
                          return (
                            <span className="chords-function-option">
                              <strong>{label}</strong>
                              <small>{optionFunction ? chordFunctionSummary(optionFunction) : 'Missing function'}</small>
                            </span>
                          );
                        }}
                        onChange={(value) => setChordAssignmentFunction(assignment.id, value)}
                      />
                      <button
                        className="heading-icon-action"
                        type="button"
                        title="Remove assignment"
                        disabled={pendingAction !== null}
                        onClick={() => deleteChordAssignment(assignment.id)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  );
                  })}
                  </>
                ) : (
                  <div className="chords-empty chords-empty-assignments">
                    <IconDeviceGamepad3 size={26} />
                    <strong>No assignments</strong>
                    <span>Use New Chord to pair a starter, button, and function.</span>
                  </div>
                )}
              </div>
              {chordAssignmentScrollbar.visible ? (
                <div className="chords-assignment-scrollbar" aria-hidden="true">
                  <div
                    className="chords-assignment-scrollbar-thumb"
                    style={{
                      height: `${chordAssignmentScrollbar.height}px`,
                      transform: `translateY(${chordAssignmentScrollbar.top}px)`
                    }}
                    onPointerDown={startChordAssignmentScrollbarDrag}
                  />
                </div>
              ) : null}
            </div>
          </section>
        </div>
    </div>
  );
}
