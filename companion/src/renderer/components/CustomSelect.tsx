import { menuStylesEqual, type CustomSelectMenuStyle, type CustomSelectProps, type SelectValue } from './custom-select-types';
import { focusCustomSelectOption, handleCustomSelectOptionKeyDown, type CustomSelectInitialFocus } from './custom-select-keyboard';
import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import { IconCheck as Check, IconChevronDown as ChevronDown } from '@tabler/icons-react';

const CUSTOM_SELECT_GRID_WHEEL_NOTCH_THRESHOLD_PX = 80;

export type { CustomSelectProps } from './custom-select-types';

export function CustomSelect<T extends SelectValue>({
  value,
  options,
  disabled = false,
  className = '',
  floatingMenu = true,
  floatingMenuMinWidth,
  floatingMenuAlign = 'start',
  floatingMenuFitContent = true,
  menuMaxHeight: requestedMenuMaxHeight,
  suspendOutsideClose = false,
  showSelectedCheck = true,
  closeOnSelect = true,
  allowReselect = false,
  immediateToggle = false,
  menuGrid,
  multiSelect,
  isOptionSelected,
  isOptionDisabled,
  getOptionClassName,
  getOptionAriaLabel,
  renderValue,
  renderOption,
  renderOptionAction,
  renderMenuHeader,
  renderMenuFooter,
  ariaLabel,
  title,
  valueLabel,
  onChange
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pointerToggleRef = useRef(false);
  const keyboardFocusRef = useRef<CustomSelectInitialFocus | null>(null);
  const floatingMenuContentWidthRef = useRef(0);
  const selected = options.find(([, optionValue]) => optionValue === value);
  const selectedLabel = selected?.[0] ?? valueLabel ?? String(value);
  const selectedValue = selected?.[1] ?? value;
  const longList = options.length > 18;
  const defaultMenuMaxHeight = requestedMenuMaxHeight ?? (longList ? 360 : 232);
  const [menuMaxHeight, setMenuMaxHeight] = useState(defaultMenuMaxHeight);
  const [menuPlacement, setMenuPlacement] = useState<'top' | 'bottom'>('bottom');
  const [floatingMenuStyle, setFloatingMenuStyle] = useState<CustomSelectMenuStyle>({});
  const [menuGridStyle, setMenuGridStyle] = useState<CustomSelectMenuStyle>({});
  const menuGridWheelScrollRef = useRef({ direction: 0, remainderPx: 0 });
  const measureMenuGrid = Boolean(menuGrid && menuGrid.measureCells !== false);
  const allowsMultipleSelection = multiSelect ?? Boolean(isOptionSelected);

  useLayoutEffect(() => {
    if (!open || !keyboardFocusRef.current) return;
    focusCustomSelectOption(menuRef.current, keyboardFocusRef.current);
    keyboardFocusRef.current = null;
  }, [open]);

  function measuredFloatingMenuWidth(): number {
    if (!floatingMenuFitContent) return 0;
    if (floatingMenuContentWidthRef.current > 0) {
      return floatingMenuContentWidthRef.current;
    }
    const optionButtons = menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]');
    if (!optionButtons?.length) return 0;
    const optionLabels = Array.from(optionButtons, (button) => button.firstElementChild as HTMLElement | null)
      .filter((label): label is HTMLElement => label !== null);
    if (!optionLabels.length) return 0;
    const widestLabel = Math.max(...optionLabels.map((label) => label.scrollWidth));
    const measurableLabels = optionLabels.filter((label) => label.clientWidth > 0);
    if (measurableLabels.length > 0) {
      const currentMenuWidth = menuRef.current?.getBoundingClientRect().width || rootRef.current?.getBoundingClientRect().width || 0;
      const requiredExpansion = Math.max(0,
        ...measurableLabels.map((label) => label.scrollWidth - label.clientWidth));
      // Add only genuine text overflow; labels themselves stretch with the menu.
      const measuredWidth = Math.ceil(
        currentMenuWidth + requiredExpansion + (requiredExpansion > 0 ? 2 : 0));
      floatingMenuContentWidthRef.current = measuredWidth;
      return measuredWidth;
    }
    // Menu border/padding + option padding + check column/gap + scrollbar breathing room.
    // Keep a small safety margin so glyph rounding never turns the final word into an ellipsis.
    const measuredWidth = Math.ceil(widestLabel + 82);
    floatingMenuContentWidthRef.current = measuredWidth;
    return measuredWidth;
  }

  function updateMenuMaxHeight() {
    const root = rootRef.current;
    if (!root) {
      setMenuMaxHeight(defaultMenuMaxHeight);
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const boundary = floatingMenu
      ? null
      : root.closest('.system-card, .feature-card, .settings-menu, .control-page') as HTMLElement | null;
    const boundaryRect = boundary?.getBoundingClientRect();
    const menuGap = 6;
    const viewportPadding = floatingMenu ? 8 : 0;
    const lowerLimit = Math.min(window.innerHeight - viewportPadding, boundaryRect?.bottom ?? window.innerHeight);
    const upperLimit = Math.max(viewportPadding, boundaryRect?.top ?? 0);
    const spaceBelow = Math.max(1, Math.floor(lowerLimit - rootRect.bottom - menuGap));
    const spaceAbove = Math.max(1, Math.floor(rootRect.top - upperLimit - menuGap));
    const preferredVisibleHeight = Math.min(defaultMenuMaxHeight, 184);
    const nextPlacement = spaceBelow < preferredVisibleHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';
    const availableSpace = nextPlacement === 'top' ? spaceAbove : spaceBelow;
    const nextMaxHeight = Math.min(defaultMenuMaxHeight, availableSpace);

    setMenuPlacement(nextPlacement);
    setMenuMaxHeight(Math.max(1, nextMaxHeight));

    if (floatingMenu) {
      const minimumWidth = Math.max(
        floatingMenuMinWidth ?? 0,
        measuredFloatingMenuWidth()
      );
      const width = Math.min(
        Math.max(rootRect.width, minimumWidth),
        Math.max(1, window.innerWidth - viewportPadding * 2)
      );
      const idealLeft = floatingMenuAlign === 'start'
        ? rootRect.left
        : floatingMenuAlign === 'end'
          ? rootRect.right - width
          : rootRect.left + (rootRect.width - width) / 2;
      const left = Math.min(
        Math.max(viewportPadding, idealLeft),
        Math.max(viewportPadding, window.innerWidth - viewportPadding - width)
      );
      const nextFloatingMenuStyle: CustomSelectMenuStyle = {
        left: `${Math.round(left)}px`,
        width: `${Math.round(width)}px`,
        ...(nextPlacement === 'top'
          ? { bottom: `${Math.round(window.innerHeight - rootRect.top + menuGap)}px` }
          : { top: `${Math.round(rootRect.bottom + menuGap)}px` }),
        '--custom-select-menu-max-height': `${Math.max(1, nextMaxHeight)}px`
      };
      setFloatingMenuStyle((current) => (
        menuStylesEqual(current, nextFloatingMenuStyle)
          ? current
          : nextFloatingMenuStyle
      ));
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    function closeIfOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !suspendOutsideClose
        && !rootRef.current?.contains(target)
        && !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', closeIfOutside);
    return () => document.removeEventListener('mousedown', closeIfOutside);
  }, [open, suspendOutsideClose]);

  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('resize', updateMenuMaxHeight);
    window.addEventListener('scroll', updateMenuMaxHeight, true);
    return () => {
      window.removeEventListener('resize', updateMenuMaxHeight);
      window.removeEventListener('scroll', updateMenuMaxHeight, true);
    };
  }, [
    open,
    defaultMenuMaxHeight,
    floatingMenu,
    floatingMenuMinWidth,
    floatingMenuAlign,
    floatingMenuFitContent,
    longList
  ]);

  useLayoutEffect(() => {
    if (!open || !floatingMenu || !floatingMenuFitContent || !menuRef.current) return undefined;
    let frame = 0;
    // The menu is mounted by this point, so measure it synchronously before the
    // browser paints. Waiting for the first animation frame makes a fit-content
    // menu briefly appear at the trigger width and then jump into place.
    updateMenuMaxHeight();
    const scheduleMeasurement = () => {
      floatingMenuContentWidthRef.current = 0;
      if (frame !== 0) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updateMenuMaxHeight();
      });
    };
    const observer = new MutationObserver(scheduleMeasurement);
    observer.observe(menuRef.current, { characterData: true, childList: true, subtree: true });
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [open, floatingMenu, floatingMenuFitContent, options.length]);

  useLayoutEffect(() => {
    if (!open || !menuGrid || !measureMenuGrid) {
      setMenuGridStyle({});
      return undefined;
    }

    const menu = menuRef.current;
    const optionsContainer = menu?.querySelector('.custom-select-menu-options') as HTMLElement | null;
    if (!menu || !optionsContainer) {
      return undefined;
    }

    let frame = 0;
    const updateGridStyle = () => {
      frame = 0;
      const styles = window.getComputedStyle(optionsContainer);
      const parsedGap = Number.parseFloat(styles.columnGap);
      const gap = menuGrid.gapPx ?? (Number.isFinite(parsedGap) ? parsedGap : 0);
      const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
      const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
      const availableWidth = Math.max(
        0,
        optionsContainer.clientWidth - paddingLeft - paddingRight - (gap * (menuGrid.columns - 1))
      );
      const cellSize = Math.max(1, availableWidth / menuGrid.columns);
      const visibleHeight = (cellSize * menuGrid.visibleRows) + (gap * (menuGrid.visibleRows - 1));
      const nextStyle: CustomSelectMenuStyle = {
        '--custom-select-grid-cell-size': `${cellSize}px`,
        '--custom-select-grid-visible-height': `${visibleHeight}px`
      };
      setMenuGridStyle((current) => (
        current['--custom-select-grid-cell-size'] === nextStyle['--custom-select-grid-cell-size']
          && current['--custom-select-grid-visible-height'] === nextStyle['--custom-select-grid-visible-height']
          ? current
          : nextStyle
      ));
    };
    const scheduleUpdate = () => {
      if (frame !== 0) {
        return;
      }
      frame = window.requestAnimationFrame(updateGridStyle);
    };

    scheduleUpdate();
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(menu);
    resizeObserver.observe(optionsContainer);
    window.addEventListener('resize', scheduleUpdate);
    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [
    open,
    measureMenuGrid,
    menuGrid?.columns,
    menuGrid?.visibleRows,
    menuGrid?.gapPx
  ]);

  function handleCustomSelectGridWheel(optionsContainer: HTMLElement, event: WheelEvent) {
    if (!menuGrid || event.ctrlKey || event.deltaY === 0) {
      return;
    }
    const optionButtons = Array.from(optionsContainer.querySelectorAll<HTMLElement>('button[role="option"]'));
    const rowCount = Math.ceil(optionButtons.length / menuGrid.columns);
    if (rowCount <= menuGrid.visibleRows) {
      return;
    }
    const firstOption = optionButtons[0];
    if (!firstOption) {
      return;
    }
    const styles = window.getComputedStyle(optionsContainer);
    const parsedGap = Number.parseFloat(styles.rowGap);
    const rowGap = Number.isFinite(parsedGap) ? parsedGap : 0;
    const rowHeight = firstOption.getBoundingClientRect().height;
    const rowStride = rowHeight + rowGap;
    if (rowStride <= 0) {
      return;
    }
    const visibleRows = Math.max(1, Math.min(
      menuGrid.visibleRows,
      Math.round((optionsContainer.clientHeight + rowGap) / rowStride)
    ));
    const maxIndex = Math.max(0, rowCount - visibleRows);
    const currentIndex = Math.max(0, Math.min(maxIndex, Math.round(optionsContainer.scrollTop / rowStride)));
    let deltaPx = event.deltaY;
    if (event.deltaMode === 1) {
      deltaPx *= rowStride;
    } else if (event.deltaMode === 2) {
      deltaPx *= rowStride * visibleRows;
    }
    const direction = Math.sign(deltaPx);
    if (direction === 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const wheelState = menuGridWheelScrollRef.current;
    if (wheelState.direction !== direction) {
      wheelState.direction = direction;
      wheelState.remainderPx = 0;
    }

    let rowsToMove = 0;
    if (event.deltaMode !== 0 || Math.abs(deltaPx) >= CUSTOM_SELECT_GRID_WHEEL_NOTCH_THRESHOLD_PX) {
      rowsToMove = direction * (event.deltaMode === 2 ? visibleRows : 1);
      wheelState.remainderPx = 0;
    } else {
      wheelState.remainderPx += deltaPx;
      rowsToMove = Math.trunc(wheelState.remainderPx / rowStride);
      if (rowsToMove === 0) {
        return;
      }
      wheelState.remainderPx -= rowsToMove * rowStride;
    }

    const nextIndex = Math.max(0, Math.min(maxIndex, currentIndex + rowsToMove));
    if (nextIndex === currentIndex) {
      wheelState.remainderPx = 0;
      return;
    }
    optionsContainer.scrollTo({ top: nextIndex * rowStride, behavior: 'auto' });
  }

  useEffect(() => {
    if (!open || !menuGrid) {
      return undefined;
    }
    const optionsContainer = menuRef.current?.querySelector('.custom-select-menu-options') as HTMLElement | null;
    if (!optionsContainer) {
      return undefined;
    }
    const handleWheel = (event: WheelEvent) => handleCustomSelectGridWheel(optionsContainer, event);
    optionsContainer.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => {
      optionsContainer.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, [open, menuGrid?.columns, menuGrid?.visibleRows]);

  useEffect(() => {
    if (!open) return undefined;
    let frame = 0;
    let followupFrame = 0;
    const scrollToSelected = () => {
      const menu = menuRef.current;
      const optionsContainer = menu?.querySelector('.custom-select-menu-options') as HTMLElement | null;
      const focusedOption = document.activeElement as HTMLElement | null;
      const selectedElement = focusedOption?.matches('button[role="option"]') && optionsContainer?.contains(focusedOption)
        ? focusedOption : menu?.querySelector<HTMLElement>('[data-selected="true"]');
      if (!optionsContainer || !selectedElement) {
        return;
      }
      if (menuGrid) {
        const styles = window.getComputedStyle(optionsContainer);
        const parsedGap = Number.parseFloat(styles.rowGap);
        const rowGap = Number.isFinite(parsedGap) ? parsedGap : 0;
        const selectedHeight = selectedElement.getBoundingClientRect().height;
        const rowStride = selectedHeight + rowGap;
        const selectedRow = rowStride > 0 ? Math.floor(selectedElement.offsetTop / rowStride) : 0;
        optionsContainer.scrollTop = Math.max(0, selectedRow * rowStride);
        return;
      }
      const selectedCenter = selectedElement.offsetTop + selectedElement.offsetHeight / 2;
      optionsContainer.scrollTop = Math.max(0, selectedCenter - optionsContainer.clientHeight / 2);
    };
    if (menuGrid && measureMenuGrid) {
      frame = window.requestAnimationFrame(() => {
        followupFrame = window.requestAnimationFrame(scrollToSelected);
      });
    } else {
      frame = window.requestAnimationFrame(scrollToSelected);
    }
    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      if (followupFrame !== 0) {
        window.cancelAnimationFrame(followupFrame);
      }
    };
  }, [
    open,
    measureMenuGrid,
    menuGrid?.columns,
    menuGridStyle['--custom-select-grid-cell-size']
  ]);

  function choose(nextValue: T) {
    if (disabled || isOptionDisabled?.(nextValue)) return;
    if (closeOnSelect) {
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>('.custom-select-button')?.focus({ preventScroll: true });
    }
    const changed = nextValue !== value || isOptionSelected?.(nextValue) === false;
    if (allowsMultipleSelection || allowReselect || changed) {
      onChange(nextValue);
    }
  }

  function toggleOpen() {
    if (!open) {
      floatingMenuContentWidthRef.current = 0;
      updateMenuMaxHeight();
    }
    setOpen((nextOpen) => !nextOpen);
  }

  function openMenu(initialFocus: CustomSelectInitialFocus = 'selected') {
    if (disabled) return;
    keyboardFocusRef.current = initialFocus;
    if (open) {
      focusCustomSelectOption(menuRef.current, initialFocus);
      keyboardFocusRef.current = null;
    }
    if (!open) {
      floatingMenuContentWidthRef.current = 0;
    }
    updateMenuMaxHeight();
    setOpen(true);
  }

  const menu = open ? (
    <div
      ref={menuRef}
      className="custom-select-menu"
      role="listbox"
      tabIndex={-1}
      aria-label={ariaLabel}
      aria-multiselectable={allowsMultipleSelection ? true : undefined}
      style={measureMenuGrid ? menuGridStyle : undefined}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') {
          if (!disabled) handleCustomSelectOptionKeyDown(event, menuGrid?.columns);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>('.custom-select-button')?.focus();
      }}
    >
      {renderMenuHeader && (
        <div className="custom-select-menu-header">
          {renderMenuHeader(() => setOpen(false))}
        </div>
      )}
      <div className="custom-select-menu-options">
        {options.map(([label, optionValue]) => {
          const selectedOption = isOptionSelected?.(optionValue)
            ?? optionValue === value;
          const disabledOption = isOptionDisabled?.(optionValue) ?? false;
          const optionClassName = getOptionClassName?.(label, optionValue);
          const optionAction = renderOptionAction?.(label, optionValue, () => setOpen(false));
          const optionButton = (
            <button
              key={String(optionValue)}
              type="button"
              role="option"
              aria-label={getOptionAriaLabel?.(label, optionValue) ?? label}
              title={label}
              aria-selected={selectedOption}
              disabled={disabledOption}
              aria-disabled={disabled || disabledOption || undefined}
              data-selected={selectedOption ? 'true' : undefined}
              className={[selectedOption ? 'selected' : '', optionClassName].filter(Boolean).join(' ')}
              onClick={() => choose(optionValue)}
            >
              <span>{renderOption?.(label, optionValue) ?? label}</span>
              {showSelectedCheck && selectedOption && <Check size={15} />}
            </button>
          );
          return optionAction ? (
            <div className="custom-select-menu-option-row" key={String(optionValue)}>
              {optionButton}
              <div className="custom-select-menu-option-action">{optionAction}</div>
            </div>
          ) : optionButton;
        })}
      </div>
      {renderMenuFooter && (
        <div className="custom-select-menu-footer">
          {renderMenuFooter(() => setOpen(false))}
        </div>
      )}
    </div>
  ) : null;

  const portalTarget = floatingMenu
    ? (rootRef.current?.closest('.shell') as HTMLElement | null) ?? document.body
    : null;

  return (
    <div
      ref={rootRef}
      className={`custom-select ${className} ${open ? 'open' : ''} menu-${menuPlacement} ${disabled ? 'disabled' : ''}`}
      style={{ '--custom-select-menu-max-height': `${menuMaxHeight}px` } as CSSProperties}
    >
      <button
        type="button"
        className="custom-select-button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-description={selectedLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title ?? selectedLabel}
        onPointerDown={(event) => {
          if (immediateToggle && event.button === 0) {
            pointerToggleRef.current = true;
            toggleOpen();
          }
        }}
        onPointerUp={() => {
          if (immediateToggle) {
            window.setTimeout(() => {
              pointerToggleRef.current = false;
            }, 0);
          }
        }}
        onPointerCancel={() => {
          pointerToggleRef.current = false;
        }}
        onClick={() => {
          if (pointerToggleRef.current) {
            pointerToggleRef.current = false;
            return;
          }
          toggleOpen();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' '
            || event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            openMenu(event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : 'selected');
          }
          if (event.key === 'Escape') {
            if (open) {
              event.preventDefault();
              event.stopPropagation();
            }
            setOpen(false);
          }
        }}
      >
        <span>{renderValue?.(selectedLabel, selectedValue) ?? selectedLabel}</span>
        <ChevronDown size={18} />
      </button>
      {floatingMenu && portalTarget && menu
        ? createPortal(
          <div
            className={`custom-select custom-select-floating-layer open menu-${menuPlacement} ${suspendOutsideClose ? 'dialog-suspended' : ''} ${className}`}
            style={floatingMenuStyle}
          >
            {menu}
          </div>,
          portalTarget
        )
        : menu}
    </div>
  );
}
