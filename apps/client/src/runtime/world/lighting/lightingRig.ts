import * as THREE from "three";

export type LightingRig = Readonly<{
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  fills: readonly THREE.PointLight[];
}>;

export function createLightingRig(scene: THREE.Scene, highQuality: boolean): LightingRig {
  // Hemisphere: warm sky, dark cool ground
  const hemi = new THREE.HemisphereLight(0xffddb2, 0x5f4d31, 0.62);
  scene.add(hemi);

  // Golden-hour sun: lower angle for longer, more dramatic shadows
  const sun = new THREE.DirectionalLight(0xffc98b, 2.3);
  sun.position.set(48, 22, 18);
  sun.castShadow = true;
  const shadowSize = highQuality ? 4096 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 130;
  sun.shadow.camera.left = -62;
  sun.shadow.camera.right = 62;
  sun.shadow.camera.top = 62;
  sun.shadow.camera.bottom = -62;
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // Fill lights: warm glow at strategic positions for depth
  const fillA = new THREE.PointLight(0xffb46d, 20, 52, 2);
  fillA.position.set(-46, 3.8, 30);
  scene.add(fillA);

  const fillB = new THREE.PointLight(0xffa867, 17, 48, 2);
  fillB.position.set(41, 4.2, -32);
  scene.add(fillB);

  const fillC = new THREE.PointLight(0xffc38f, 12, 34, 2);
  fillC.position.set(2, 5.6, 30);
  scene.add(fillC);

  if (!highQuality) {
    return { hemi, sun, fills: [fillA, fillB, fillC] };
  }

  // Additional fills for dark corners
  const fillD = new THREE.PointLight(0xffbe78, 14, 40, 2);
  fillD.position.set(-34, 3.5, -55);
  scene.add(fillD);

  const fillE = new THREE.PointLight(0xffb060, 12, 36, 2);
  fillE.position.set(42, 3.8, -42);
  scene.add(fillE);

  // Corridor fills for bazaar and west alley
  const fillBazaarA = new THREE.PointLight(0xffc088, 12, 22, 2);
  fillBazaarA.position.set(0, 3.2, 28);
  scene.add(fillBazaarA);

  const fillBazaarB = new THREE.PointLight(0xffb878, 10, 20, 2);
  fillBazaarB.position.set(0, 3.0, 42);
  scene.add(fillBazaarB);

  const fillAlley = new THREE.PointLight(0xffc090, 10, 18, 2);
  fillAlley.position.set(-42, 3.4, 4);
  scene.add(fillAlley);

  return { hemi, sun, fills: [fillA, fillB, fillC, fillD, fillE, fillBazaarA, fillBazaarB, fillAlley] };
}
