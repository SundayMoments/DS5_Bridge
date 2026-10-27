import { describe, expect, it } from 'vitest';
import { playStationControllerArt } from './playstation-controller-art';

describe('playStationControllerArt', () => {
  it('shows DualSense art for a DualSense and Edge art otherwise', () => {
    expect(playStationControllerArt('dualsense')).toMatchObject({ variant: 'dualsense' });
    expect(playStationControllerArt('dualsense').source).toContain('dualsense-official-color-front');
    expect(playStationControllerArt('dualsense-edge')).toMatchObject({ variant: 'dualsense-edge' });
    expect(playStationControllerArt('dualsense-edge').source).toContain('dualsense-edge-official-color-front');
    expect(playStationControllerArt('unknown').variant).toBe('dualsense-edge');
    expect(playStationControllerArt(null).variant).toBe('dualsense-edge');
  });
});
