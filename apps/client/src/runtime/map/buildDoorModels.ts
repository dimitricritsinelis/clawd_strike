import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import type { PropModelLibrary } from "../render/models/PropModelLibrary";

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
};

export const CASTLE_DOOR_ID = "ph_large_castle_door";
export const ROLLERSHUTTER_ID = "ph_rollershutter_window_02";

const _bbox = new Box3();
const _bboxSize = new Vector3();
const DEFAULT_DOOR_OUTWARD_OFFSET_M = -0.01;
const CASTLE_DOOR_OUTWARD_OFFSET_M = -0.09;
const CASTLE_DOOR_BACKING_GEOMETRY = new BoxGeometry(1, 1, 1);
const CASTLE_DOOR_BACKING_MATERIAL = new MeshStandardMaterial({
  color: 0x0c1218,
  roughness: 0.95,
  metalness: 0.0,
});
const CASTLE_DOOR_BACKING_WIDTH_SCALE = 0.752;
const CASTLE_DOOR_BACKING_HEIGHT_SCALE = 0.784;
const CASTLE_DOOR_BACKING_DEPTH_M = 0.03;
const CASTLE_DOOR_BACKING_FRONT_OFFSET_M = 0.05;

function createCastleDoorBacking(
  placement: DoorModelPlacement,
  yawRad: number,
  centerOffsetM: number,
): Mesh {
  const backing = new Mesh(CASTLE_DOOR_BACKING_GEOMETRY, CASTLE_DOOR_BACKING_MATERIAL);
  // Keep the slab centered on the opening and project it forward from the wall
  // by the configured front-face offset.
  backing.position.set(
    placement.wallSurfacePos.x + placement.outwardX * centerOffsetM,
    placement.wallSurfacePos.y,
    placement.wallSurfacePos.z + placement.outwardZ * centerOffsetM,
  );
  backing.rotation.set(0, yawRad, 0);
  backing.scale.set(
    placement.doorW * CASTLE_DOOR_BACKING_WIDTH_SCALE,
    placement.doorH * CASTLE_DOOR_BACKING_HEIGHT_SCALE,
    CASTLE_DOOR_BACKING_DEPTH_M,
  );
  backing.name = "castle-door-backing";
  backing.castShadow = false;
  backing.receiveShadow = true;
  return backing;
}

/**
 * Build 3D door model meshes at placement positions.
 */
export function buildDoorModels(
  placements: readonly DoorModelPlacement[],
  doorModels: PropModelLibrary,
  _wallThicknessM: number,
): Group {
  const root = new Group();
  root.name = "map-door-models";

  if (placements.length === 0) return root;

  // Pre-compute model bounding boxes for scaling
  const modelBboxCache = new Map<string, { width: number; height: number; depth: number; minY: number }>();

  function getModelBbox(modelId: string): { width: number; height: number; depth: number; minY: number } | null {
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

    clone.rotation.set(0, baseRotation + flipPI, 0);

    clone.traverse((node) => {
      const mesh = node as { isMesh?: boolean; castShadow?: boolean; receiveShadow?: boolean };
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    clone.name = `door-model-${placement.modelId}`;
    root.add(clone);
    if (placement.modelId === CASTLE_DOOR_ID) {
      const backingCenterOffset = -(CASTLE_DOOR_BACKING_FRONT_OFFSET_M + CASTLE_DOOR_BACKING_DEPTH_M * 0.5);
      root.add(createCastleDoorBacking(placement, baseRotation + flipPI, backingCenterOffset));
    }
  }

  return root;
}
