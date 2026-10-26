import { ControllerDevicesPage } from './ControllerDevicesPage';
import type { DevicesController } from './use-devices-controller';

export interface DevicesPageProps {
  readonly active: boolean;
  readonly controller: DevicesController;
  readonly pendingAction: string | null;
}

export function DevicesPage({ active, controller, pendingAction }: DevicesPageProps) {
  return (
    <ControllerDevicesPage
      active={active}
      model={controller.model}
      openMenuKey={controller.openMenuKey}
      renameDialog={controller.renameDialog}
      forgetDialog={controller.forgetDialog}
      pendingAction={pendingAction}
      actionError={controller.actionError}
      onStartPairing={() => void controller.startPairing()}
      onToggleMenu={controller.toggleMenu}
      onOpenRename={controller.openRename}
      onUpdateRename={controller.updateRename}
      onCloseRename={controller.closeRename}
      onConfirmRename={controller.confirmRename}
      onOpenForgetAll={controller.openForgetAll}
      onOpenForgetOne={controller.openForgetOne}
      onCloseForget={controller.closeForget}
      onConfirmForget={() => void controller.confirmForget()}
    />
  );
}
