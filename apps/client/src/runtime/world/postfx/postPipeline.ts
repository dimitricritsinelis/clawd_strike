import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";

const CinematicGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    warmth: { value: 0.07 },
    contrast: { value: 1.06 },
    vignetteStrength: { value: 0.35 },
    grainIntensity: { value: 0.028 },
    time: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float warmth;
    uniform float contrast;
    uniform float vignetteStrength;
    uniform float grainIntensity;
    uniform float time;
    varying vec2 vUv;

    // Simple pseudo-random for film grain
    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);

      // Warm color shift
      c.rgb += vec3(warmth, warmth * 0.42, 0.0);

      // Toe/shoulder curve for better dynamic range (S-curve)
      c.rgb = c.rgb * c.rgb * (3.0 - 2.0 * c.rgb);

      // Contrast boost centered at midpoint
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;

      // Desaturate shadows slightly for cinematic look
      float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      float shadowMask = smoothstep(0.0, 0.35, luma);
      float desatAmount = mix(0.3, 0.0, shadowMask);
      c.rgb = mix(vec3(luma), c.rgb, 1.0 - desatAmount);

      // Vignette: darken corners
      vec2 center = vUv - 0.5;
      float vignette = 1.0 - dot(center, center) * vignetteStrength * 2.0;
      vignette = smoothstep(0.0, 1.0, vignette);
      c.rgb *= mix(0.7, 1.0, vignette);

      // Film grain: time-varying noise
      float grain = (rand(vUv * 400.0 + time) - 0.5) * grainIntensity;
      c.rgb += vec3(grain);

      c.rgb = clamp(c.rgb, 0.0, 1.0);
      gl_FragColor = c;
    }
  `
};

export class PostPipeline {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly gradePass: ShaderPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, width: number, height: number) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    // SSAO: screen-space ambient occlusion for depth and grounding
    const ssao = new SSAOPass(scene, camera as THREE.PerspectiveCamera, width, height);
    ssao.kernelRadius = 0.5;
    ssao.minDistance = 0.001;
    ssao.maxDistance = 0.15;
    ssao.output = SSAOPass.OUTPUT.Default;
    this.composer.addPass(ssao);

    // Bloom: glow on lanterns and sun-lit surfaces
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.25, 0.38, 0.82);
    this.composer.addPass(this.bloom);

    // Cinematic color grading with vignette and film grain
    this.gradePass = new ShaderPass(CinematicGradeShader);
    this.composer.addPass(this.gradePass);
  }

  updateTime(time: number) {
    this.gradePass.uniforms["time"]!.value = time;
  }

  setSize(width: number, height: number) {
    this.composer.setSize(width, height);
    this.bloom.setSize(width, height);
  }

  render() {
    this.composer.render();
  }

  dispose() {
    this.composer.dispose();
  }
}
