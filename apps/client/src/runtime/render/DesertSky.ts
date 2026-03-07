import { DirectionalLight, PerspectiveCamera, Scene, Vector3 } from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

export type DesertSkyPreset = "midday" | "late-afternoon";

export type DesertSkyHandle = {
  sky: Sky;
  update: () => void;
  dispose: () => void;
};

export function installDesertSky(opts: {
  scene: Scene;
  camera: PerspectiveCamera;
  sunLight: DirectionalLight;
  preset?: DesertSkyPreset;
}): DesertSkyHandle {
  // Remove previous if it exists (hot reload safety)
  const existing = opts.scene.getObjectByName("desert-sky");
  if (existing) opts.scene.remove(existing);

  const sky = new Sky();
  sky.name = "desert-sky";
  sky.frustumCulled = false;

  // MUST be within camera.far or it clips
  sky.scale.setScalar(opts.camera.far * 0.95);

  // Keep behind all world geo
  sky.renderOrder = -1000;
  sky.material.depthWrite = false;
  sky.material.depthTest = true;
  sky.material.fog = false;

  const u = sky.material.uniforms;

  // Desert tuning:
  // - turbidity up = more dust
  // - rayleigh down = less saturated blue
  // - mie up = stronger haze / sun glow
  const preset = opts.preset ?? "late-afternoon";
  if (preset === "midday") {
    u["turbidity"]!.value = 12;
    u["rayleigh"]!.value = 1.05;
    u["mieCoefficient"]!.value = 0.012;
    u["mieDirectionalG"]!.value = 0.88;
  } else {
    u["turbidity"]!.value = 14;        // less haze (was 18)
    u["rayleigh"]!.value = 0.90;       // slightly more blue (was 0.75)
    u["mieCoefficient"]!.value = 0.015; // less forward scatter (was 0.020)
    u["mieDirectionalG"]!.value = 0.92;
  }

  const sunDir = new Vector3();

  const updateSun = (): void => {
    // DirectionalLight points from position -> target, but sky expects direction TO the sun.
    // So we use (sun.position - sun.target.position).
    sunDir
      .subVectors(opts.sunLight.position, opts.sunLight.target.position)
      .normalize();
    u["sunPosition"]!.value.copy(sunDir); // magnitude not important; shader normalizes
  };

  const update = (): void => {
    // Sky must follow camera translation so it never feels "near".
    // DO NOT parent sky to camera (that would rotate it with view).
    sky.position.copy(opts.camera.position);
    updateSun();
  };

  update();
  opts.scene.add(sky);

  const dispose = (): void => {
    opts.scene.remove(sky);
    sky.geometry.dispose();
    sky.material.dispose();
  };

  return { sky, update, dispose };
}
