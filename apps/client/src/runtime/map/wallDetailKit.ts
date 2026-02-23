import { BoxGeometry, CylinderGeometry, Group, InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import { resolveBlockoutPalette } from "../render/BlockoutMaterials";

export type WallDetailMeshId =
  | "plinth_strip"
  | "cornice_strip"
  | "vertical_edge_trim"
  | "pilaster"
  | "recessed_panel_frame_h"
  | "recessed_panel_frame_v"
  | "recessed_panel_back"
  | "door_jamb"
  | "door_lintel"
  | "door_arch_lintel"
  | "sign_board"
  | "sign_bracket"
  | "awning_bracket"
  | "cable_segment";

export type WallDetailInstance = {
  meshId: WallDetailMeshId;
  position: {
    x: number;
    y: number;
    z: number;
  };
  scale: {
    x: number;
    y: number;
    z: number;
  };
  yawRad: number;
  pitchRad?: number;
  rollRad?: number;
};

type DetailTemplate = {
  geometry: BoxGeometry | CylinderGeometry;
  material: MeshStandardMaterial;
};

const DETAIL_IDS: WallDetailMeshId[] = [
  "plinth_strip",
  "cornice_strip",
  "vertical_edge_trim",
  "pilaster",
  "recessed_panel_frame_h",
  "recessed_panel_frame_v",
  "recessed_panel_back",
  "door_jamb",
  "door_lintel",
  "door_arch_lintel",
  "sign_board",
  "sign_bracket",
  "awning_bracket",
  "cable_segment",
];

function createTemplates(highVis: boolean): Record<WallDetailMeshId, DetailTemplate> {
  const palette = resolveBlockoutPalette(highVis);

  const stonePrimary = new MeshStandardMaterial({
    color: palette.wall,
    roughness: 0.88,
    metalness: 0.03,
  });
  const stoneTrim = new MeshStandardMaterial({
    color: palette.serviceDoor,
    roughness: 0.84,
    metalness: 0.03,
  });
  const stoneRecess = new MeshStandardMaterial({
    color: palette.filler,
    roughness: 0.9,
    metalness: 0.01,
  });
  const accent = new MeshStandardMaterial({
    color: palette.signage,
    roughness: 0.7,
    metalness: 0.08,
  });
  const bracketMetal = new MeshStandardMaterial({
    color: 0x656c73,
    roughness: 0.58,
    metalness: 0.42,
  });
  const cableMetal = new MeshStandardMaterial({
    color: 0x444b52,
    roughness: 0.64,
    metalness: 0.34,
  });

  return {
    plinth_strip: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    cornice_strip: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    vertical_edge_trim: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    pilaster: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stonePrimary,
    },
    recessed_panel_frame_h: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    recessed_panel_frame_v: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    recessed_panel_back: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneRecess,
    },
    door_jamb: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    door_lintel: {
      geometry: new BoxGeometry(1, 1, 1),
      material: stoneTrim,
    },
    door_arch_lintel: {
      geometry: new CylinderGeometry(0.5, 0.5, 1, 14, 1, false, 0, Math.PI),
      material: stoneTrim,
    },
    sign_board: {
      geometry: new BoxGeometry(1, 1, 1),
      material: accent,
    },
    sign_bracket: {
      geometry: new BoxGeometry(1, 1, 1),
      material: bracketMetal,
    },
    awning_bracket: {
      geometry: new BoxGeometry(1, 1, 1),
      material: bracketMetal,
    },
    cable_segment: {
      geometry: new CylinderGeometry(0.5, 0.5, 1, 10, 1, true),
      material: cableMetal,
    },
  };
}

export function buildWallDetailMeshes(instances: readonly WallDetailInstance[], highVis: boolean): Group {
  const root = new Group();
  root.name = "map-wall-details";
  if (instances.length === 0) {
    return root;
  }

  const templates = createTemplates(highVis);
  const grouped = new Map<WallDetailMeshId, WallDetailInstance[]>();
  for (const meshId of DETAIL_IDS) {
    grouped.set(meshId, []);
  }
  for (const instance of instances) {
    grouped.get(instance.meshId)?.push(instance);
  }

  const dummy = new Object3D();
  for (const meshId of DETAIL_IDS) {
    const bucket = grouped.get(meshId);
    if (!bucket || bucket.length === 0) {
      continue;
    }

    const template = templates[meshId];
    const mesh = new InstancedMesh(template.geometry, template.material, bucket.length);
    mesh.name = `wall-detail-${meshId}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    for (let index = 0; index < bucket.length; index += 1) {
      const instance = bucket[index]!;
      dummy.position.set(instance.position.x, instance.position.y, instance.position.z);
      dummy.rotation.set(instance.pitchRad ?? 0, instance.yawRad, instance.rollRad ?? 0);
      dummy.scale.set(instance.scale.x, instance.scale.y, instance.scale.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
  }

  return root;
}
