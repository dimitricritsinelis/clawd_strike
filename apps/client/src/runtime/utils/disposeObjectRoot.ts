import type { Material, Mesh, Object3D } from "three";

export function disposeObjectRoot(root: Object3D): void {
  root.traverse((child) => {
    const maybeMesh = child as Mesh;
    if (maybeMesh.geometry) {
      maybeMesh.geometry.dispose();
    }

    const maybeMaterial = (maybeMesh as { material?: Material | Material[] }).material;
    if (Array.isArray(maybeMaterial)) {
      for (const material of maybeMaterial) {
        material.dispose();
      }
    } else if (maybeMaterial) {
      maybeMaterial.dispose();
    }
  });
}
