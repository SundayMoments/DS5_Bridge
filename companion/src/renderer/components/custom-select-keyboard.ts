import type { KeyboardEvent } from 'react';

export type CustomSelectInitialFocus = 'selected' | 'first' | 'last';

function focusOption(option: HTMLButtonElement | undefined) {
  option?.focus({ preventScroll: true });
  option?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

export function focusCustomSelectOption(menu: HTMLElement | null, initial: CustomSelectInitialFocus) {
  const options = [...(menu?.querySelectorAll<HTMLButtonElement>('button[role="option"]:not(:disabled)') ?? [])];
  const option = initial === 'selected'
    ? options.find((item) => item.getAttribute('aria-selected') === 'true') ?? options[0]
    : initial === 'last' ? options.at(-1) : options[0];
  if (option) focusOption(option);
  else menu?.focus({ preventScroll: true });
}

export function handleCustomSelectOptionKeyDown(event: KeyboardEvent<HTMLDivElement>, columns = 1) {
  const target = event.target as HTMLElement;
  const current = target.closest<HTMLButtonElement>('button[role="option"]');
  if (!current || !event.currentTarget.contains(current) || current.disabled) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    event.stopPropagation();
    current.click();
    return;
  }
  const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="option"]')];
  let index = options.indexOf(current);
  let step: number;
  if (event.key === 'Home' || event.key === 'End') {
    index = event.key === 'Home' ? 0 : options.length - 1;
    step = event.key === 'Home' ? 1 : -1;
  } else {
    step = event.key === 'ArrowDown' ? columns : event.key === 'ArrowUp' ? -columns
      : columns > 1 && event.key === 'ArrowRight' ? 1 : columns > 1 && event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    index += step;
  }
  event.preventDefault();
  event.stopPropagation();
  while (index >= 0 && index < options.length) {
    if (!options[index]!.disabled) {
      focusOption(options[index]);
      break;
    }
    index += step;
  }
}
