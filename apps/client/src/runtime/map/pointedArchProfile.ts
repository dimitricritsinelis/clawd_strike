export type PointedArchShapeBounds = Readonly<{
  widthHalf: number;
  bottomY: number;
  springY: number;
  apexY: number;
}>;

export const POINTED_ARCH_FRAME_OUTER_BOUNDS: PointedArchShapeBounds = Object.freeze({
  widthHalf: 0.5,
  bottomY: -0.5,
  springY: 0.02,
  apexY: 0.5,
});

export const POINTED_ARCH_FRAME_APERTURE_BOUNDS: PointedArchShapeBounds = Object.freeze({
  widthHalf: 0.34,
  bottomY: -0.35,
  springY: 0.01,
  apexY: 0.36,
});

const POINTED_ARCH_FRAME_OUTER_SIZE = getPointedArchBoundsSize(POINTED_ARCH_FRAME_OUTER_BOUNDS);
const POINTED_ARCH_FRAME_APERTURE_SIZE = getPointedArchBoundsSize(POINTED_ARCH_FRAME_APERTURE_BOUNDS);

export const POINTED_ARCH_APERTURE_PANEL_BOUNDS: PointedArchShapeBounds = Object.freeze({
  widthHalf: 0.5,
  bottomY: -0.5,
  springY:
    ((POINTED_ARCH_FRAME_APERTURE_BOUNDS.springY - POINTED_ARCH_FRAME_APERTURE_BOUNDS.bottomY)
      / POINTED_ARCH_FRAME_APERTURE_SIZE.height)
    - 0.5,
  apexY: 0.5,
});

export function getPointedArchBoundsSize(bounds: PointedArchShapeBounds): { width: number; height: number } {
  return {
    width: bounds.widthHalf * 2,
    height: bounds.apexY - bounds.bottomY,
  };
}

export function resolvePointedArchFrameFromAperture(apertureWidth: number, apertureHeight: number): {
  frameWidth: number;
  frameHeight: number;
  frameCenterYOffsetFromSill: number;
  apertureCenterYOffsetFromFrameCenter: number;
} {
  const frameWidth = apertureWidth * (POINTED_ARCH_FRAME_OUTER_SIZE.width / POINTED_ARCH_FRAME_APERTURE_SIZE.width);
  const frameHeight = apertureHeight * (POINTED_ARCH_FRAME_OUTER_SIZE.height / POINTED_ARCH_FRAME_APERTURE_SIZE.height);

  return {
    frameWidth,
    frameHeight,
    frameCenterYOffsetFromSill: -POINTED_ARCH_FRAME_APERTURE_BOUNDS.bottomY * frameHeight,
    apertureCenterYOffsetFromFrameCenter:
      ((POINTED_ARCH_FRAME_APERTURE_BOUNDS.bottomY + POINTED_ARCH_FRAME_APERTURE_BOUNDS.apexY) * 0.5) * frameHeight,
  };
}
