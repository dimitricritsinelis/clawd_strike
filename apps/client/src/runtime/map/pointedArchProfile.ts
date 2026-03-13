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

export const SPAWN_WINDOW_POINTED_ARCH_FRAME_OUTER_BOUNDS: PointedArchShapeBounds = Object.freeze({
  widthHalf: 0.5,
  bottomY: -0.5,
  springY: 0.02,
  apexY: 0.5,
});

export const SPAWN_WINDOW_POINTED_ARCH_FRAME_APERTURE_BOUNDS: PointedArchShapeBounds = Object.freeze({
  widthHalf: 0.38,
  bottomY: -0.43,
  springY: -0.02,
  apexY: 0.41,
});

const SPAWN_WINDOW_POINTED_ARCH_FRAME_OUTER_SIZE = getPointedArchBoundsSize(SPAWN_WINDOW_POINTED_ARCH_FRAME_OUTER_BOUNDS);
const SPAWN_WINDOW_POINTED_ARCH_FRAME_APERTURE_SIZE = getPointedArchBoundsSize(SPAWN_WINDOW_POINTED_ARCH_FRAME_APERTURE_BOUNDS);

export const SPAWN_WINDOW_POINTED_ARCH_APERTURE_PANEL_BOUNDS: PointedArchShapeBounds = Object.freeze({
  widthHalf: 0.5,
  bottomY: -0.5,
  springY:
    ((SPAWN_WINDOW_POINTED_ARCH_FRAME_APERTURE_BOUNDS.springY - SPAWN_WINDOW_POINTED_ARCH_FRAME_APERTURE_BOUNDS.bottomY)
      / SPAWN_WINDOW_POINTED_ARCH_FRAME_APERTURE_SIZE.height)
    - 0.5,
  apexY: 0.5,
});

export const HERO_POINTED_ARCH_FRAME_OUTER_BOUNDS: PointedArchShapeBounds = Object.freeze({
  widthHalf: 0.5,
  bottomY: -0.5,
  springY: 0.3181818182,
  apexY: 0.5,
});

export const HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS: PointedArchShapeBounds = Object.freeze({
  widthHalf: 0.35,
  bottomY: -0.4050847458,
  springY: 0.2669152542,
  apexY: 0.3949152542,
});

const HERO_POINTED_ARCH_FRAME_OUTER_SIZE = getPointedArchBoundsSize(HERO_POINTED_ARCH_FRAME_OUTER_BOUNDS);
const HERO_POINTED_ARCH_FRAME_APERTURE_SIZE = getPointedArchBoundsSize(HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS);

export const HERO_POINTED_ARCH_APERTURE_PANEL_BOUNDS: PointedArchShapeBounds = Object.freeze({
  widthHalf: 0.5,
  bottomY: -0.5,
  springY:
    ((HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS.springY - HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS.bottomY)
      / HERO_POINTED_ARCH_FRAME_APERTURE_SIZE.height)
    - 0.5,
  apexY: 0.5,
});

export const SPAWN_HERO_POINTED_ARCH_FRAME_OUTER_BOUNDS: PointedArchShapeBounds = Object.freeze({
  widthHalf: 0.5,
  bottomY: -0.5,
  springY: -0.05,
  apexY: 0.5,
});

export const SPAWN_HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS: PointedArchShapeBounds = Object.freeze({
  widthHalf: 0.39,
  bottomY: -0.44,
  springY: -0.08,
  apexY: 0.42,
});

const SPAWN_HERO_POINTED_ARCH_FRAME_OUTER_SIZE = getPointedArchBoundsSize(SPAWN_HERO_POINTED_ARCH_FRAME_OUTER_BOUNDS);
const SPAWN_HERO_POINTED_ARCH_FRAME_APERTURE_SIZE = getPointedArchBoundsSize(SPAWN_HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS);

export const SPAWN_HERO_POINTED_ARCH_APERTURE_PANEL_BOUNDS: PointedArchShapeBounds = Object.freeze({
  widthHalf: 0.5,
  bottomY: -0.5,
  springY:
    ((SPAWN_HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS.springY - SPAWN_HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS.bottomY)
      / SPAWN_HERO_POINTED_ARCH_FRAME_APERTURE_SIZE.height)
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

export function resolveHeroPointedArchFrameFromAperture(apertureWidth: number, apertureHeight: number): {
  frameWidth: number;
  frameHeight: number;
  frameCenterYOffsetFromSill: number;
  apertureCenterYOffsetFromFrameCenter: number;
} {
  const frameWidth = apertureWidth * (HERO_POINTED_ARCH_FRAME_OUTER_SIZE.width / HERO_POINTED_ARCH_FRAME_APERTURE_SIZE.width);
  const frameHeight = apertureHeight * (HERO_POINTED_ARCH_FRAME_OUTER_SIZE.height / HERO_POINTED_ARCH_FRAME_APERTURE_SIZE.height);

  return {
    frameWidth,
    frameHeight,
    frameCenterYOffsetFromSill: -HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS.bottomY * frameHeight,
    apertureCenterYOffsetFromFrameCenter:
      ((HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS.bottomY + HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS.apexY) * 0.5) * frameHeight,
  };
}

export function resolveSpawnWindowPointedArchFrameFromAperture(apertureWidth: number, apertureHeight: number): {
  frameWidth: number;
  frameHeight: number;
  frameCenterYOffsetFromSill: number;
  apertureCenterYOffsetFromFrameCenter: number;
} {
  const frameWidth =
    apertureWidth * (SPAWN_WINDOW_POINTED_ARCH_FRAME_OUTER_SIZE.width / SPAWN_WINDOW_POINTED_ARCH_FRAME_APERTURE_SIZE.width);
  const frameHeight =
    apertureHeight * (SPAWN_WINDOW_POINTED_ARCH_FRAME_OUTER_SIZE.height / SPAWN_WINDOW_POINTED_ARCH_FRAME_APERTURE_SIZE.height);

  return {
    frameWidth,
    frameHeight,
    frameCenterYOffsetFromSill: -SPAWN_WINDOW_POINTED_ARCH_FRAME_APERTURE_BOUNDS.bottomY * frameHeight,
    apertureCenterYOffsetFromFrameCenter:
      ((SPAWN_WINDOW_POINTED_ARCH_FRAME_APERTURE_BOUNDS.bottomY + SPAWN_WINDOW_POINTED_ARCH_FRAME_APERTURE_BOUNDS.apexY) * 0.5)
      * frameHeight,
  };
}

export function resolveSpawnHeroPointedArchFrameFromAperture(apertureWidth: number, apertureHeight: number): {
  frameWidth: number;
  frameHeight: number;
  frameCenterYOffsetFromSill: number;
  apertureCenterYOffsetFromFrameCenter: number;
} {
  const frameWidth =
    apertureWidth * (SPAWN_HERO_POINTED_ARCH_FRAME_OUTER_SIZE.width / SPAWN_HERO_POINTED_ARCH_FRAME_APERTURE_SIZE.width);
  const frameHeight =
    apertureHeight * (SPAWN_HERO_POINTED_ARCH_FRAME_OUTER_SIZE.height / SPAWN_HERO_POINTED_ARCH_FRAME_APERTURE_SIZE.height);

  return {
    frameWidth,
    frameHeight,
    frameCenterYOffsetFromSill: -SPAWN_HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS.bottomY * frameHeight,
    apertureCenterYOffsetFromFrameCenter:
      ((SPAWN_HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS.bottomY + SPAWN_HERO_POINTED_ARCH_FRAME_APERTURE_BOUNDS.apexY) * 0.5)
      * frameHeight,
  };
}
