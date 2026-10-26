import type { CSSProperties, ReactNode } from 'react';

export type SelectValue = string | number;

export interface CustomSelectProps<T extends SelectValue> {
  value: T;
  options: Array<[string, T]>;
  disabled?: boolean;
  className?: string;
  floatingMenu?: boolean;
  floatingMenuMinWidth?: number;
  floatingMenuAlign?: 'center' | 'start' | 'end';
  floatingMenuFitContent?: boolean;
  menuMaxHeight?: number;
  suspendOutsideClose?: boolean;
  showSelectedCheck?: boolean;
  closeOnSelect?: boolean;
  allowReselect?: boolean;
  immediateToggle?: boolean;
  menuGrid?: {
    columns: number;
    visibleRows: number;
    gapPx?: number;
    measureCells?: boolean;
  };
  multiSelect?: boolean;
  isOptionSelected?: (value: T) => boolean;
  isOptionDisabled?: (value: T) => boolean;
  getOptionClassName?: (label: string, value: T) => string | undefined;
  getOptionAriaLabel?: (label: string, value: T) => string;
  renderValue?: (label: string, value: T) => ReactNode;
  renderOption?: (label: string, value: T) => ReactNode;
  renderOptionAction?: (label: string, value: T, closeMenu: () => void) => ReactNode;
  renderMenuHeader?: (closeMenu: () => void) => ReactNode;
  renderMenuFooter?: (closeMenu: () => void) => ReactNode;
  ariaLabel: string;
  title?: string;
  /** Label for a current value that is not one of the options, instead of the raw value. */
  valueLabel?: string;
  onChange: (value: T) => void;
}
export type CustomSelectMenuStyle = CSSProperties & {
  '--custom-select-menu-max-height'?: string;
  '--custom-select-grid-cell-size'?: string;
  '--custom-select-grid-visible-height'?: string;
};

export function menuStylesEqual(
  current: CustomSelectMenuStyle,
  next: CustomSelectMenuStyle
): boolean {
  const currentEntries = Object.entries(current);
  const nextEntries = Object.entries(next);
  return currentEntries.length === nextEntries.length
    && nextEntries.every(([key, value]) => current[key as keyof CustomSelectMenuStyle] === value);
}
