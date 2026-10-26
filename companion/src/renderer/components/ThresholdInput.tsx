import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

export interface ThresholdInputProps {
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly unit: string;
  readonly ariaLabel: string;
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly snapToStep?: boolean;
  onChange(value: number): void | Promise<boolean>;
}

const INVALID_NUMBER_KEYS = new Set(['+', '-', '.', ',', 'e', 'E']);

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

export function ThresholdInput({
  value,
  minimum,
  maximum,
  step,
  unit,
  ariaLabel,
  disabled,
  pending,
  snapToStep = false,
  onChange
}: ThresholdInputProps) {
  const persistedValue = clampInteger(value, minimum, maximum);
  const [draftValue, setDraftValue] = useState(String(persistedValue));
  const [saving, setSaving] = useState(false);
  const [settledRevision, setSettledRevision] = useState(0);
  const committedValueRef = useRef(persistedValue);
  const awaitingCommitRef = useRef(false);
  const mountedRef = useRef(false);
  const inputPending = pending || saving;
  const maxLength = String(maximum).length;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    committedValueRef.current = persistedValue;
    setDraftValue(String(persistedValue));
  }, [persistedValue, settledRevision]);

  function commit(candidate: string): void {
    if (disabled || pending || awaitingCommitRef.current) return;
    const parsed = candidate.trim() === '' ? persistedValue : Number(candidate);
    const next = Number.isFinite(parsed)
      ? clampInteger(snapToStep ? Math.round(parsed / step) * step : parsed, minimum, maximum)
      : persistedValue;
    setDraftValue(String(next));
    if (next !== committedValueRef.current) {
      committedValueRef.current = next;
      const finish = () => {
        awaitingCommitRef.current = false;
        if (!mountedRef.current) return;
        setSaving(false);
        // Reconcile after React publishes the latest snapshot, even if its value
        // did not change or the pending state was batched away.
        setSettledRevision(revision => revision + 1);
      };
      try {
        const result = onChange(next);
        if (result) {
          awaitingCommitRef.current = true;
          setSaving(true);
          void result.then(finish, finish);
        }
      } catch {
        finish();
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (INVALID_NUMBER_KEYS.has(event.key)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(event.currentTarget.value);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!inputPending) committedValueRef.current = persistedValue;
      setDraftValue(String(persistedValue));
    }
  }

  return (
    <div className={`settings-duration-control settings-gesture-threshold-control${
      inputPending ? ' settings-pending-control' : ''
    }`}>
      <input
        type="number"
        inputMode="numeric"
        min={minimum}
        max={maximum}
        step={step}
        maxLength={maxLength}
        value={draftValue}
        aria-label={ariaLabel}
        aria-busy={inputPending || undefined}
        disabled={disabled && !inputPending}
        readOnly={inputPending}
        onChange={(event) => {
          const digits = event.currentTarget.value.match(new RegExp(`^\\d{0,${maxLength}}`));
          setDraftValue(digits?.[0] ?? '');
        }}
        onKeyDown={handleKeyDown}
        onBlur={(event) => commit(event.currentTarget.value)}
      />
      <span className="settings-duration-unit" aria-hidden="true">{unit}</span>
    </div>
  );
}
