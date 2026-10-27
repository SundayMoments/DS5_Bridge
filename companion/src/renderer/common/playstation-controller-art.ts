import dualSenseArt from '@product-assets/controllers/dualsense-official-color-front.svg';
import dualSenseEdgeArt from '@product-assets/controllers/dualsense-edge-official-color-front.svg';

// Sony's official controller line art (see NOTICE), as Kitsune Input uses it.
export type PlayStationControllerArt = Readonly<{
  source: string;
  variant: 'dualsense' | 'dualsense-edge';
}>;

/** DualSense art for a DualSense; DualSense Edge art for an Edge or an unknown controller. */
export function playStationControllerArt(controllerType: string | null | undefined): PlayStationControllerArt {
  if (controllerType === 'dualsense') {
    return { source: dualSenseArt, variant: 'dualsense' };
  }
  return { source: dualSenseEdgeArt, variant: 'dualsense-edge' };
}
