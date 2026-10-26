import { useEffect, useRef, useState } from 'react';
import type { AppRuntime } from '../../composition/app-runtime';
import type { ShellNotificationFocusTarget } from './ShellNotifications';

/** How long a row the Overview pointed at stays highlighted. */
export const NOTIFICATION_FOCUS_MS = 2200;

/**
 * The window bar's notifications menu: open state, closing on an outside click
 * or Escape, the row highlight the Overview asks for, and the toggles it shares
 * with Settings.
 */
export function useNotificationsMenu(runtime: AppRuntime) {
  const { snapshot, pendingAction, runAction } = runtime;
  const [menuOpen, setMenuOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState<ShellNotificationFocusTarget | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const focusTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (focusTimerRef.current !== null) {
      window.clearTimeout(focusTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  function clearFocus() {
    setFocusTarget(null);
  }

  /** Opens the menu with the given rows highlighted for a moment. */
  function focus(target: ShellNotificationFocusTarget) {
    setMenuOpen(true);
    setFocusTarget(target);
    if (focusTimerRef.current !== null) {
      window.clearTimeout(focusTimerRef.current);
    }
    focusTimerRef.current = window.setTimeout(() => {
      setFocusTarget(null);
      focusTimerRef.current = null;
    }, NOTIFICATION_FOCUS_MS);
  }

  function toggleControllerNotifications() {
    if (!snapshot) return;
    void runAction('notify-controller', () => (
      window.bridge.setNotifyControllerConnection(!snapshot.settings.notifyControllerConnection)
    ));
  }

  function toggleLowBatteryNotifications() {
    if (!snapshot) return;
    void runAction('notify-battery', () => window.bridge.setNotifyLowBattery(!snapshot.settings.notifyLowBattery));
  }

  function testNotification() {
    void runAction('notify-test', () => window.bridge.testNotification());
  }

  return {
    rootRef,
    menuOpen,
    focusTarget,
    model: {
      menuOpen,
      controllerEnabled: Boolean(snapshot?.settings.notifyControllerConnection),
      lowBatteryEnabled: Boolean(snapshot?.settings.notifyLowBattery),
      controlsDisabled: pendingAction !== null,
      focusTarget
    },
    open: () => setMenuOpen(true),
    close: () => setMenuOpen(false),
    toggle: () => setMenuOpen((value) => !value),
    focus,
    clearFocus,
    toggleControllerNotifications,
    toggleLowBatteryNotifications,
    testNotification
  };
}

export type NotificationsMenu = ReturnType<typeof useNotificationsMenu>;
