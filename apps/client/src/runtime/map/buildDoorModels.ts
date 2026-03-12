import { Box3, BoxGeometry, BufferGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, Vector3 } from "three";
import type { PropModelLibrary } from "../render/models/PropModelLibrary";
import type { WallMaterialLibrary, WallTextureQuality } from "../render/materials/WallMaterialLibrary";
import { applyWallShaderTweaks } from "../render/materials/applyWallShaderTweaks";
import { DeterministicRng, deriveSubSeed } from "../utils/Rng";
import { resolveWallShaderProfile } from "./wallShaderProfiles";

/**
 * Placement record for a 3D door model.
 * Emitted by the wall-detail placer which has the full segment frame
 * (including outward direction) available.
 */
export type DoorModelPlacement = {
  /** World-space center of the door opening on the wall surface. */
  wallSurfacePos: { x: number; y: number; z: number };
  /** Door opening width (along wall). */
  doorW: number;
  /** Door opening height. */
  doorH: number;
  /** Wall orientation (0 for vertical / N-S walls, PI/2 for horizontal / E-W walls). */
  yawRad: number;
  /** Unit vector pointing outward from the wall (toward the street/viewer). */
  outwardX: number;
  outwardZ: number;
  /** Which model to use. */
  modelId: string;
  trimMaterialId?: string | null;
  trimThicknessM?: number;
  surroundDepthM?: number;
  surroundCenterOffsetM?: number;
  revealWidthM?: number;
  coverShape?: DoorCoverShape;
  coverWidthM?: number;
  coverHeightM?: number;
  coverCenterYOffsetM?: number;
};

export type DoorCoverShape = "arched" | "rect";

export const CASTLE_DOOR_ID = "ph_large_castle_door";
export const ROLLERSHUTTER_ID = "ph_rollershutter_window_02";

const _bbox = new Box3();
const _bboxSize = new Vector3();
const DEFAULT_DOOR_OUTWARD_OFFSET_M = -0.01;
const CASTLE_DOOR_OUTWARD_OFFSET_M = -0.09;
const DOOR_BACKING_MATERIAL = new MeshStandardMaterial({
  color: 0x0c1218,
  roughness: 0.95,
  metalness: 0.0,
});
const DOOR_BACKING_DEPTH_M = 0.03;
const DOOR_BACKING_FRONT_OFFSET_M = 0.05;
const CASTLE_DOOR_MODEL_WIDTH_M = 2.012115716934204;
const CASTLE_DOOR_MODEL_HEIGHT_M = 2.964752435684204;
const FALLBACK_TRIM_COLOR = 0xd2c3a6;

export type DoorSilhouette = {
  widthM: number;
  heightM: number;
  radiusM: number;
  springLineOffsetYM: number;
};

export function resolveCastleDoorSilhouette(heightM: number): DoorSilhouette {
  const scale = heightM / CASTLE_DOOR_MODEL_HEIGHT_M;
  const widthM = CASTLE_DOOR_MODEL_WIDTH_M * scale;
  const radiusM = widthM * 0.5;
  return {
    widthM,
    heightM,
    radiusM,
    springLineOffsetYM: heightM * 0.5 - radiusM,
  };
}

export function resolveCastleDoorRevealWidth(trimThicknessM: number): number {
  return Math.max(0.035, Math.min(0.06, trimThicknessM * 0.24));
}

export function resolveCastleDoorSurroundRevealWidth(trimThicknessM: number): number {
  return Math.max(0.008, Math.min(0.018, trimThicknessM * 0.08));
}

function createCastleDoorBackingGeometry(widthM: number, heightM: number, depthM: number): BufferGeometry {
  const radiusM = widthM * 0.5;
  const springLineOffsetYM = heightM * 0.5 - radiusM;
  const shape = new Shape();
  shape.moveTo(-widthM * 0.5, -heightM * 0.5);
  shape.lineTo(widthM * 0.5, -heightM * 0.5);
  shape.lineTo(widthM * 0.5, springLineOffsetYM);
  shape.absarc(0, springLineOffsetYM, radiusM, 0, Math.PI, false);
  shape.lineTo(-widthM * 0.5, -heightM * 0.5);

  const geometry = new ExtrudeGeometry(shape, {
    depth: depthM,
    bevelEnabled: false,
    curveSegments: 48,
  });
  geometry.translate(0, 0, -depthM * 0.5);
  return geometry;
}

function createCastleDoorBacking(
  placement: DoorModelPlacement,
  yawRad: number,
  centerOffsetM: number,
  widthM: number,
  heightM: number,
  tangentOffsetM = 0,
): Mesh {
  const backing = new Mesh(
    createCastleDoorBackingGeometry(widthM, heightM, DOOR_BACKING_DEPTH_M),
    DOOR_BACKING_MATERIAL,
  );
  const tangentX = Math.cos(yawRad);
  const tangentZ = -Math.sin(yawRad);
  // Keep the slab centered on the opening and project it forward from the wall
  // by the configured front-face offset.
  backing.position.set(
    placement.wallSurfacePos.x + placement.outwardX * centerOffsetM + tangentX * tangentOffsetM,
    placement.wallSurfacePos.y + (placement.coverCenterYOffsetM ?? 0),
    placement.wallSurfacePos.z + placement.outwardZ * centerOffsetM + tangentZ * tangentOffsetM,
  );
  backing.rotation.set(0, yawRad, 0);
  backing.name = "castle-door-backing";
  backing.castShadow = false;
  backing.receiveShadow = false;
  return backing;
}

function createRectDoorBacking(
  placement: DoorModelPlacement,
  yawRad: number,
  centerOffsetM: number,
  widthM: number,
  heightM: number,
  tangentOffsetM = 0,
): Mesh {
  const backing = new Mesh(
    new BoxGeometry(widthM, heightM, DOOR_BACKING_DEPTH_M),
    DOOR_BACKING_MATERIAL,
  );
  const tangentX = Math.cos(yawRad);
  const tangentZ = -Math.sin(yawRad);
  backing.position.set(
    placement.wallSurfacePos.x + placement.outwardX * centerOffsetM + tangentX * tangentOffsetM,
    placement.wallSurfacePos.y + (placement.coverCenterYOffsetM ?? 0),
    placement.wallSurfacePos.z + placement.outwardZ * centerOffsetM + tangentZ * tangentOffsetM,
  );
  backing.rotation.set(0, yawRad, 0);
  backing.name = "door-backing-rect";
  backing.castShadow = false;
  backing.receiveShadow = false;
  return backing;
}

function createSmoothArchBandGeometry(
  innerWidthM: number,
  innerHeightM: number,
  bandWidthM: number,
  depthM: number,
  closeBottomBand = true,
): BufferGeometry {
  const innerRadiusM = innerWidthM * 0.5;
  const springLineOffsetYM = innerHeightM * 0.5 - innerRadiusM;
  const outerRadiusM = innerRadiusM + bandWidthM;
  const outerWidthM = innerWidthM + bandWidthM * 2;
  const shape = new Shape();
  if (closeBottomBand) {
    shape.moveTo(-outerWidthM * 0.5, springLineOffsetYM - bandWidthM);
    shape.lineTo(outerWidthM * 0.5, springLineOffsetYM - bandWidthM);
    shape.lineTo(outerWidthM * 0.5, springLineOffsetYM);
    shape.absarc(0, springLineOffsetYM, outerRadiusM, 0, Math.PI, false);
    shape.lineTo(-outerWidthM * 0.5, springLineOffsetYM - bandWidthM);

    const hole = new Shape();
    hole.moveTo(-innerWidthM * 0.5, springLineOffsetYM);
    hole.absarc(0, springLineOffsetYM, innerRadiusM, Math.PI, 0, true);
    hole.lineTo(-innerWidthM * 0.5, springLineOffsetYM);
    shape.holes.push(hole);
  } else {
    shape.moveTo(-outerWidthM * 0.5, springLineOffsetYM);
    shape.absarc(0, springLineOffsetYM, outerRadiusM, Math.PI, 0, true);
    shape.lineTo(innerWidthM * 0.5, springLineOffsetYM);
    shape.absarc(0, springLineOffsetYM, innerRadiusM, 0, Math.PI, false);
    shape.lineTo(-outerWidthM * 0.5, springLineOffsetYM);
  }

  const geometry = new ExtrudeGeometry(shape, {
    depth: depthM,
    bevelEnabled: false,
    curveSegments: 64,
  });
  geometry.translate(0, 0, -depthM * 0.5);
  return geometry;
}

function resolveMaterialUvOffset(seed: number, materialId: string): { x: number; y: number } {
  const offsetSeed = deriveSubSeed(seed, `wall-uvoffset:${materialId}`);
  const offsetRng = new DeterministicRng(offsetSeed);
  return {
    x: offsetRng.int(0, 4),
    y: offsetRng.int(0, 4),
  };
}

function createCastleDoorSurround(
  placement: DoorModelPlacement,
  yawRad: number,
  trimMaterial: MeshStandardMaterial,
  widthM: number,
  heightM: number,
  trimThicknessM: number,
  depthM: number,
  centerOffsetM: number,
  tangentOffsetM = 0,
): Group {
  const surround = new Group();
  surround.name = "castle-door-surround";
  const tangentX = Math.cos(yawRad);
  const tangentZ = -Math.sin(yawRad);
  const centerX = placement.wallSurfacePos.x + placement.outwardX * centerOffsetM + tangentX * tangentOffsetM;
  const centerY = placement.wallSurfacePos.y;
  const centerZ = placement.wallSurfacePos.z + placement.outwardZ * centerOffsetM + tangentZ * tangentOffsetM;
  const jambWidthM = trimThicknessM;
  const revealWidthM = placement.revealWidthM ?? resolveCastleDoorSurroundRevealWidth(trimThicknessM);
  const openingWidthM = widthM + revealWidthM * 2;

  const createJamb = (side: -1 | 1): Mesh => {
    const jamb = new Mesh(new BoxGeometry(jambWidthM, heightM, depthM), trimMaterial);
    jamb.position.set(side * (openingWidthM + jambWidthM) * 0.5, 0, 0);
    jamb.castShadow = true;
    jamb.receiveShadow = false;
    jamb.name = `castle-door-jamb-${side < 0 ? "l" : "r"}`;
    return jamb;
  };

  const createRevealSide = (side: -1 | 1): Mesh => {
    const reveal = new Mesh(new BoxGeometry(revealWidthM, heightM, depthM), trimMaterial);
    reveal.position.set(side * (widthM + revealWidthM) * 0.5, 0, 0);
    reveal.castShadow = true;
    reveal.receiveShadow = false;
    reveal.name = `castle-door-reveal-${side < 0 ? "l" : "r"}`;
    return reveal;
  };

  surround.add(createJamb(-1));
  surround.add(createJamb(1));
  surround.add(createRevealSide(-1));
  surround.add(createRevealSide(1));

  const revealArch = new Mesh(
    createSmoothArchBandGeometry(widthM, heightM, revealWidthM, depthM, false),
    trimMaterial,
  );
  revealArch.castShadow = true;
  revealArch.receiveShadow = false;
  revealArch.name = "castle-door-reveal-arch";
  surround.add(revealArch);

  const outerArch = new Mesh(
    createSmoothArchBandGeometry(openingWidthM, heightM + revealWidthM, trimThicknessM, depthM, false),
    trimMaterial,
  );
  outerArch.castShadow = true;
  outerArch.receiveShadow = false;
  outerArch.name = "castle-door-outer-arch";
  surround.add(outerArch);
  surround.position.set(centerX, centerY, centerZ);
  surround.rotation.set(0, yawRad, 0);
  surround.updateMatrixWorld();
  return surround;
}

/**
 * Build 3D door model meshes at placement positions.
 */
export function buildDoorModels(
  placements: readonly DoorModelPlacement[],
  doorModels: PropModelLibrary,
  _wallThicknessM: number,
  wallMaterials: WallMaterialLibrary | null,
  quality: WallTextureQuality,
  seed: number,
): Group {
  const root = new Group();
  root.name = "map-door-models";

  if (placements.length === 0) return root;

  // Pre-compute model bounding boxes for scaling
  const modelBboxCache = new Map<string, { width: number; height: number; depth: number; minY: number; centerX: number }>();
  const trimMaterialCache = new Map<string, MeshStandardMaterial>();

  function getTrimMaterial(materialId: string | null | undefined): MeshStandardMaterial {
    const resolvedId = materialId?.trim() || "__fallback";
    const cached = trimMaterialCache.get(resolvedId);
    if (cached) return cached;

    const material = materialId && wallMaterials
      ? wallMaterials.createStandardMaterial(materialId, quality)
      : new MeshStandardMaterial({ color: FALLBACK_TRIM_COLOR, roughness: 0.92, metalness: 0.0 });
    if (materialId && wallMaterials) {
      const albedoBoost =
        typeof material.userData.wallAlbedoBoost === "number" && Number.isFinite(material.userData.wallAlbedoBoost)
          ? material.userData.wallAlbedoBoost
          : 1;
      applyWallShaderTweaks(material, {
        albedoBoost,
        macroColorAmplitude: 0.08,
        macroRoughnessAmplitude: 0.05,
        macroFrequency: 0.18,
        macroSeed: deriveSubSeed(seed, `wall-macro:${materialId}`),
        tileSizeM: wallMaterials.getTileSizeM(materialId),
        uvOffset: resolveMaterialUvOffset(seed, materialId),
        dirtEnabled: true,
        floorTopY: 0,
        dirtHeightM: 1.5,
        dirtDarken: 0.22,
        dirtRoughnessBoost: 0.12,
        ...resolveWallShaderProfile(materialId, "detail"),
      });
    }
    trimMaterialCache.set(resolvedId, material);
    return material;
  }

  function getModelBbox(modelId: string): { width: number; height: number; depth: number; minY: number; centerX: number } | null {
    const cached = modelBboxCache.get(modelId);
    if (cached) return cached;

    if (!doorModels.hasModel(modelId)) return null;

    const template = doorModels.instantiate(modelId);
    _bbox.setFromObject(template);
    _bbox.getSize(_bboxSize);

    const result = {
      width: _bboxSize.x,
      height: _bboxSize.y,
      depth: _bboxSize.z,
      minY: _bbox.min.y,
      centerX: (_bbox.min.x + _bbox.max.x) * 0.5,
    };
    modelBboxCache.set(modelId, result);
    return result;
  }

  for (const placement of placements) {
    const modelBbox = getModelBbox(placement.modelId);
    if (!modelBbox) continue;

    const clone = doorModels.instantiate(placement.modelId);

    // For the rollershutter, remove the graffiti variant
    if (placement.modelId === ROLLERSHUTTER_ID) {
      const graffitiNode = clone.getObjectByName("rollershutter_window_02_graffiti");
      if (graffitiNode) graffitiNode.removeFromParent();
    }
    // Scale model to fit the door opening (uniform scale, fit within bounds)
    const scaleByH = placement.doorH / modelBbox.height;
    const scaleByW = placement.doorW / modelBbox.width;
    const uniformScale = Math.min(scaleByH, scaleByW);
    clone.scale.setScalar(uniformScale);

    // Position at base of door opening.
    // wallSurfacePos.y is the center of the door void; base = center - doorH/2.
    const baseY = placement.wallSurfacePos.y - placement.doorH * 0.5;
    const modelBaseOffset = -modelBbox.minY * uniformScale;

    // wallSurfacePos sits on the zone boundary line (segment.coord).
    // The wall mesh extends OUTWARD from the boundary (into the building mass),
    // so the street-facing wall surface is at the boundary itself.
    // Place the door slightly INWARD of the boundary (negative outward = toward
    // the street) so it sits in front of the wall's street-facing surface.
    const outwardOffset = placement.modelId === CASTLE_DOOR_ID
      ? CASTLE_DOOR_OUTWARD_OFFSET_M
      : DEFAULT_DOOR_OUTWARD_OFFSET_M;

    const worldX = placement.wallSurfacePos.x + placement.outwardX * outwardOffset;
    const worldZ = placement.wallSurfacePos.z + placement.outwardZ * outwardOffset;
    clone.position.set(worldX, baseY + modelBaseOffset, worldZ);

    // The GLTF model is wide in X and thin in Z.
    // The wall's width direction is perpendicular to outward — i.e., along the tangent.
    // yawRad=0 → wall runs N-S (tangent along Z), outward along X → model width must align with Z.
    // yawRad=PI/2 → wall runs E-W (tangent along X), outward along Z → model width must align with X.
    // Adding PI/2 to the yaw rotates the model's X-axis (width) to align with the wall's tangent.
    // Additionally, we need to orient the model's front face (z-) outward.
    // The sign of outward determines whether to add or subtract PI.
    const baseRotation = placement.yawRad + Math.PI * 0.5;
    // Determine if we need to flip 180°: check if the outward direction matches
    // the expected "model front after rotation" direction.
    // After baseRotation, the model's z-axis points in a specific direction.
    // If that doesn't align with outward, flip by PI.
    const rotatedModelZx = -Math.sin(baseRotation);
    const rotatedModelZz = -Math.cos(baseRotation);
    const dot = rotatedModelZx * placement.outwardX + rotatedModelZz * placement.outwardZ;
    const flipPI = dot < 0 ? Math.PI : 0;
    const finalRotationY = baseRotation + flipPI;
    const tangentOffsetM = placement.modelId === CASTLE_DOOR_ID ? -modelBbox.centerX * uniformScale : 0;
    const tangentX = Math.cos(finalRotationY);
    const tangentZ = -Math.sin(finalRotationY);

    clone.rotation.set(0, finalRotationY, 0);
    clone.position.set(
      worldX + tangentX * tangentOffsetM,
      baseY + modelBaseOffset,
      worldZ + tangentZ * tangentOffsetM,
    );

    clone.traverse((node) => {
      const mesh = node as { isMesh?: boolean; castShadow?: boolean; receiveShadow?: boolean };
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
    });

    clone.name = `door-model-${placement.modelId}`;
    root.add(clone);
    if (placement.modelId === CASTLE_DOOR_ID) {
      const silhouette = resolveCastleDoorSilhouette(placement.doorH);
      const backingCenterOffset = -(DOOR_BACKING_FRONT_OFFSET_M + DOOR_BACKING_DEPTH_M * 0.5);
      root.add(createCastleDoorBacking(
        placement,
        finalRotationY,
        backingCenterOffset,
        placement.coverWidthM ?? silhouette.widthM,
        placement.coverHeightM ?? silhouette.heightM,
        tangentOffsetM,
      ));
      if (
        placement.trimThicknessM != null
        && placement.surroundDepthM != null
        && placement.surroundCenterOffsetM != null
      ) {
        root.add(createCastleDoorSurround(
          placement,
          finalRotationY,
          getTrimMaterial(placement.trimMaterialId),
          silhouette.widthM,
          silhouette.heightM,
          placement.trimThicknessM,
          placement.surroundDepthM,
          placement.surroundCenterOffsetM,
          tangentOffsetM,
        ));
      }
    } else {
      const backingCenterOffset = -(DOOR_BACKING_FRONT_OFFSET_M + DOOR_BACKING_DEPTH_M * 0.5);
      root.add(createRectDoorBacking(
        placement,
        finalRotationY,
        backingCenterOffset,
        placement.coverWidthM ?? placement.doorW,
        placement.coverHeightM ?? placement.doorH,
      ));
    }
  }

  return root;
}
