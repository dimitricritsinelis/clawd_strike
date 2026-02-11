import * as THREE from "three";

import { hashSeed, lcg, rand01 } from "@clawd-strike/shared";
import { buildPerm, clamp, fbm, lerp, simplex2, smoothstep, voronoi, warpedFbm } from "./noise";

export type ProceduralPbrParams = Readonly<{
  seedKey: string;
  baseColor: readonly [number, number, number];
  contrast: number;
  grime: number;
  tileSize?: number;
  style?: "default" | "stucco" | "cobble" | "tile" | "cloth" | "wood" | "sand" | "metal" | "rug";
}>;

export type ProceduralPbrSet = Readonly<{
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  normalMap: THREE.DataTexture;
  aoMap: THREE.CanvasTexture;
}>;

function makeCanvas(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
}

// ─── Style-specific height field generators ─────────────────────────────

function heightStucco(gx: number, gy: number, perm: Uint8Array, micro: number): number {
  // Base plaster surface: warped FBM for organic, uneven stucco
  const base = warpedFbm(gx * 3, gy * 3, perm, 0.6, { octaves: 5, scale: 1.2 });

  // Crack network: Voronoi edges create realistic fracture lines
  const v = voronoi(gx * 8, gy * 8, perm);
  const crackEdge = smoothstep(0.0, 0.06, v.d2 - v.d1);
  const cracks = 1 - crackEdge; // 1 = in crack, 0 = on surface

  // Erosion channels: domain-warped for organic flow
  const erosion = warpedFbm(gx * 6, gy * 6, perm, 1.2, { octaves: 4, scale: 0.8 });
  const erosionMask = smoothstep(-0.1, 0.3, erosion);

  // Combine: base surface with crack indentations and erosion channels
  let h = base * 0.5 + micro * 0.15;
  h -= cracks * 0.45; // Deep cracks
  h -= (1 - erosionMask) * 0.2; // Erosion channels
  h += fbm(gx * 18, gy * 18, perm, { octaves: 2, scale: 1 }) * 0.08; // Micro grain
  return clamp(h, -1, 1);
}

function heightCobble(gx: number, gy: number, perm: Uint8Array, micro: number): number {
  // Voronoi cells for individual stones with varied sizes
  const v = voronoi(gx * 6, gy * 5, perm);

  // Stone surface: slight bump per stone using cell ID
  const stoneBump = simplex2(gx * 14 + v.cellId * 0.1, gy * 14 + v.cellId * 0.3, perm) * 0.15;

  // Mortar lines: deep grooves at cell boundaries
  const mortarWidth = smoothstep(0.0, 0.08, v.d2 - v.d1);
  const mortar = 1 - mortarWidth; // 1 = in mortar, 0 = on stone

  // Stone edge chips: irregularity near mortar
  const edgeChip = smoothstep(0.08, 0.14, v.d2 - v.d1);
  const chipNoise = fbm(gx * 28, gy * 28, perm, { octaves: 3, scale: 1 });
  const chips = (1 - edgeChip) * clamp(chipNoise, 0, 1) * 0.12;

  let h = 0.3 + stoneBump - mortar * 0.7 - chips;
  h += micro * 0.06; // Surface grain
  return clamp(h, -1, 1);
}

function heightTile(gx: number, gy: number, perm: Uint8Array, micro: number): number {
  // Grid tiles with slight per-tile variation
  const tileX = ((gx * 8) % 1 + 1) % 1;
  const tileY = ((gy * 8) % 1 + 1) % 1;

  // Grout lines
  const groutX = smoothstep(0.0, 0.06, Math.min(tileX, 1 - tileX));
  const groutY = smoothstep(0.0, 0.06, Math.min(tileY, 1 - tileY));
  const grout = Math.min(groutX, groutY);

  // Per-tile surface variation
  const tileId = Math.floor(gx * 8) * 31 + Math.floor(gy * 8) * 17;
  const tileSurface = simplex2(gx * 20 + tileId * 0.1, gy * 20 + tileId * 0.05, perm) * 0.08;

  // Edge chips on tiles
  const edgeDist = Math.min(tileX, 1 - tileX, tileY, 1 - tileY);
  const chipChance = simplex2(gx * 40 + tileId, gy * 40, perm);
  const chip = edgeDist < 0.08 && chipChance > 0.6 ? -0.15 : 0;

  const h = grout * 0.6 - (1 - grout) * 0.5 + tileSurface + chip + micro * 0.04;
  return clamp(h, -1, 1);
}

function heightCloth(gx: number, gy: number, perm: Uint8Array, micro: number): number {
  // Warp/weft weave pattern at thread level
  const warpFreq = 48;
  const weftFreq = 50;
  const warp = Math.sin(gx * warpFreq * Math.PI * 2);
  const weft = Math.sin(gy * weftFreq * Math.PI * 2);

  // Thread crossover pattern
  const crossover = Math.sin(gx * warpFreq * Math.PI) * Math.sin(gy * weftFreq * Math.PI);
  const weave = warp * 0.3 + weft * 0.3 + crossover * 0.25;

  // Thread-group variation: slight bunching
  const groupVar = fbm(gx * 8, gy * 8, perm, { octaves: 3, scale: 1 }) * 0.15;

  // Fraying near edges (UV 0 and 1 zones)
  const edgeFray = smoothstep(0.92, 1.0, Math.max(gx, gy));
  const frayNoise = simplex2(gx * 60, gy * 60, perm) * edgeFray * 0.2;

  const h = weave + groupVar + frayNoise + micro * 0.08;
  return clamp(h, -1, 1);
}

function heightWood(gx: number, gy: number, perm: Uint8Array, micro: number): number {
  // Wood grain: stretched noise along one axis with domain warping
  const grainWarp = simplex2(gx * 2, gy * 0.4, perm) * 1.5;
  const grain = fbm(gx * 3 + grainWarp, gy * 28, perm, { octaves: 5, scale: 0.5 });

  // Knot generation at seed points
  const knotX = 0.35 + simplex2(3.7, 8.2, perm) * 0.3;
  const knotY = 0.5 + simplex2(7.1, 2.4, perm) * 0.3;
  const knotDist = Math.sqrt((gx - knotX) ** 2 + (gy - knotY) ** 2);
  const knot = knotDist < 0.08 ? Math.cos(knotDist * Math.PI / 0.08) * 0.3 : 0;
  const knotRings = knotDist < 0.15 ? Math.sin(knotDist * 120) * 0.06 * smoothstep(0.15, 0.04, knotDist) : 0;

  // Weathering cracks along grain direction
  const crackPattern = simplex2(gx * 4, gy * 50, perm);
  const cracks = crackPattern > 0.85 ? -0.2 * (crackPattern - 0.85) / 0.15 : 0;

  const h = grain * 0.55 + knot + knotRings + cracks + micro * 0.08;
  return clamp(h, -1, 1);
}

function heightSand(gx: number, gy: number, perm: Uint8Array, micro: number): number {
  // Large dune waves — coherent wind direction
  const duneWave = Math.sin((gx * 3 + gy * 0.8) * Math.PI * 2) * 0.3;

  // Medium wind ripples — perpendicular to wind
  const ripple = fbm(gx * 0.5 + gy * 12, gy * 0.5 - gx * 0.3, perm, { octaves: 4, scale: 1.5 });

  // Micro grain: individual sand particle noise
  const microGrain = fbm(gx * 40, gy * 40, perm, { octaves: 2, scale: 1 }) * 0.08;

  const h = duneWave + ripple * 0.35 + microGrain + micro * 0.04;
  return clamp(h, -1, 1);
}

function heightMetal(gx: number, gy: number, perm: Uint8Array, micro: number): number {
  // Brushed metal base: directional fine lines
  const brush = fbm(gx * 60, gy * 2, perm, { octaves: 3, scale: 0.5 }) * 0.25;

  // Rust patches: FBM-masked zones
  const rustMask = fbm(gx * 4, gy * 4, perm, { octaves: 5, scale: 0.8 });
  const rustBump = rustMask > 0.2 ? (rustMask - 0.2) * 0.4 : 0;

  // Scratch lines: thin directional marks
  const scratchAngle = simplex2(gx * 3, gy * 3, perm);
  const scratch = simplex2(gx * 40 + scratchAngle * 2, gy * 40 - scratchAngle, perm);
  const scratchLine = scratch > 0.88 ? -0.15 : 0;

  // Dent/impact marks
  const dentDist = voronoi(gx * 3, gy * 3, perm);
  const dent = dentDist.d1 < 0.12 ? -0.1 * (1 - dentDist.d1 / 0.12) : 0;

  const h = brush + rustBump + scratchLine + dent + micro * 0.05;
  return clamp(h, -1, 1);
}

function heightRug(gx: number, gy: number, perm: Uint8Array, micro: number): number {
  // Central medallion: radial pattern
  const cx = gx - 0.5;
  const cy = gy - 0.5;
  const r = Math.sqrt(cx * cx + cy * cy);
  const angle = Math.atan2(cy, cx);
  const medallion = r < 0.25 ? Math.cos(r * Math.PI / 0.25) * 0.3 + Math.sin(angle * 8) * 0.05 : 0;

  // Diamond border pattern
  const borderDist = Math.abs(cx) + Math.abs(cy);
  const diamondBorder = Math.abs(Math.sin(borderDist * 24)) * smoothstep(0.15, 0.35, borderDist) * smoothstep(0.5, 0.38, borderDist) * 0.2;

  // Repeating geometric motif
  const motifX = ((gx * 12) % 1 + 1) % 1;
  const motifY = ((gy * 12) % 1 + 1) % 1;
  const diamond = Math.abs(motifX - 0.5) + Math.abs(motifY - 0.5);
  const motif = diamond < 0.35 ? 0.15 : -0.05;

  // Pile texture (carpet fibers)
  const pile = fbm(gx * 50, gy * 50, perm, { octaves: 2, scale: 1 }) * 0.1;

  const h = medallion + diamondBorder + motif + pile + micro * 0.06;
  return clamp(h, -1, 1);
}

function heightDefault(gx: number, gy: number, perm: Uint8Array, micro: number): number {
  const base = fbm(gx * 4, gy * 4, perm, { octaves: 5, scale: 1 });
  return clamp(base * 0.5 + micro * 0.3, -1, 1);
}

// ─── Color modifiers per style ──────────────────────────────────────────

function colorStucco(
  r: number, g: number, b: number,
  gx: number, gy: number, h: number, perm: Uint8Array
): [number, number, number] {
  // Reveal darker stone underneath in deep cracks / erosion
  const erosion = warpedFbm(gx * 6, gy * 6, perm, 1.2, { octaves: 4, scale: 0.8 });
  const reveal = smoothstep(0.0, -0.3, h); // Deeper = more stone revealed
  const stoneR = clamp(r - 45, 0, 255);
  const stoneG = clamp(g - 40, 0, 255);
  const stoneB = clamp(b - 30, 0, 255);

  // Faded paint patches: subtle teal/indigo shifts
  const paintPatch = fbm(gx * 2.5, gy * 2.5, perm, { octaves: 3, scale: 0.6 });
  const hasPaint = smoothstep(0.2, 0.45, paintPatch);
  const paintFade = smoothstep(-0.1, 0.3, erosion); // More eroded = more faded

  const pr = lerp(r, r - 18, hasPaint * paintFade * 0.3);
  const pg = lerp(g, g + 6, hasPaint * paintFade * 0.3);
  const pb = lerp(b, b + 16, hasPaint * paintFade * 0.3);

  return [
    clamp(Math.round(lerp(pr, stoneR, reveal)), 0, 255),
    clamp(Math.round(lerp(pg, stoneG, reveal)), 0, 255),
    clamp(Math.round(lerp(pb, stoneB, reveal)), 0, 255)
  ];
}

function colorCobble(
  r: number, g: number, b: number,
  gx: number, gy: number, _h: number, perm: Uint8Array
): [number, number, number] {
  const v = voronoi(gx * 6, gy * 5, perm);
  const mortarWidth = smoothstep(0.0, 0.08, v.d2 - v.d1);
  const inMortar = 1 - mortarWidth;

  // Sand accumulation in mortar lines: shift toward warm sand tone
  const sandR = lerp(r, 188, inMortar * 0.5);
  const sandG = lerp(g, 160, inMortar * 0.4);
  const sandB = lerp(b, 115, inMortar * 0.35);

  // Per-stone color variation using cell ID
  const colorShift = (v.cellId % 37) / 37 - 0.5;
  const varR = sandR + colorShift * 22;
  const varG = sandG + colorShift * 18;
  const varB = sandB + colorShift * 12;

  return [
    clamp(Math.round(varR), 0, 255),
    clamp(Math.round(varG), 0, 255),
    clamp(Math.round(varB), 0, 255)
  ];
}

function colorTile(
  r: number, g: number, b: number,
  gx: number, gy: number
): [number, number, number] {
  // Per-tile mosaic color shifts: teal, blue, terracotta
  const tileId = Math.floor(gx * 8) * 31 + Math.floor(gy * 8) * 17;
  const colorChoice = Math.abs(tileId) % 5;

  let tr = r;
  let tg = g;
  let tb = b;
  if (colorChoice === 0) { tr -= 15; tg += 8; tb += 28; } // Teal shift
  else if (colorChoice === 1) { tr -= 8; tg -= 4; tb += 18; } // Blue shift
  else if (colorChoice === 2) { tr += 20; tg -= 6; tb -= 12; } // Terracotta shift
  else if (colorChoice === 3) { tr += 6; tg += 10; tb += 12; } // Subtle cool
  // colorChoice 4: no shift — base color

  // Grout is darker
  const tileX = ((gx * 8) % 1 + 1) % 1;
  const tileY = ((gy * 8) % 1 + 1) % 1;
  const groutX = smoothstep(0.0, 0.06, Math.min(tileX, 1 - tileX));
  const groutY = smoothstep(0.0, 0.06, Math.min(tileY, 1 - tileY));
  const grout = Math.min(groutX, groutY);
  const groutDarken = 1 - (1 - grout) * 0.4;

  return [
    clamp(Math.round(tr * groutDarken), 0, 255),
    clamp(Math.round(tg * groutDarken), 0, 255),
    clamp(Math.round(tb * groutDarken), 0, 255)
  ];
}

function colorMetal(
  r: number, g: number, b: number,
  gx: number, gy: number, _h: number, perm: Uint8Array
): [number, number, number] {
  // Rust patches: orange/brown zones
  const rustMask = fbm(gx * 4, gy * 4, perm, { octaves: 5, scale: 0.8 });
  const rustAmount = smoothstep(0.15, 0.5, rustMask);

  // Oxidation patina at edges (green-ish tint)
  const edgePatina = fbm(gx * 7, gy * 7, perm, { octaves: 3, scale: 1.2 });
  const patina = smoothstep(0.3, 0.6, edgePatina) * 0.15;

  const rustR = lerp(r, 148, rustAmount * 0.65);
  const rustG = lerp(g, 72, rustAmount * 0.55);
  const rustB = lerp(b, 38, rustAmount * 0.6);

  return [
    clamp(Math.round(rustR + patina * -8), 0, 255),
    clamp(Math.round(rustG + patina * 12), 0, 255),
    clamp(Math.round(rustB + patina * 8), 0, 255)
  ];
}

function colorRug(
  gx: number,
  gy: number
): [number, number, number] {
  // Multi-color rug: crimson base, indigo/mustard/terracotta/cream zones
  const cx = gx - 0.5;
  const cy = gy - 0.5;
  const borderDist = Math.abs(cx) + Math.abs(cy);

  // Motif pattern for color assignment
  const motifX = ((gx * 12) % 1 + 1) % 1;
  const motifY = ((gy * 12) % 1 + 1) % 1;
  const diamond = Math.abs(motifX - 0.5) + Math.abs(motifY - 0.5);
  const zone = Math.floor(diamond * 5) % 5;

  const colors: [number, number, number][] = [
    [138, 48, 42],   // Deep crimson (base)
    [52, 48, 108],   // Indigo
    [178, 142, 48],  // Mustard
    [168, 82, 52],   // Terracotta
    [218, 198, 168]  // Cream
  ];
  const zoneColor = colors[zone]!;

  // Central medallion is different color
  const rd = Math.sqrt(cx * cx + cy * cy);
  const inMedallion = rd < 0.2 ? 1 : 0;
  const medallionColor: [number, number, number] = [52, 48, 108]; // Indigo center

  // Border stripe
  const inBorder = borderDist > 0.35 && borderDist < 0.45 ? 1 : 0;
  const borderColor: [number, number, number] = [178, 142, 48]; // Mustard border

  let fr = lerp(zoneColor[0], medallionColor[0], inMedallion);
  let fg = lerp(zoneColor[1], medallionColor[1], inMedallion);
  let fb = lerp(zoneColor[2], medallionColor[2], inMedallion);

  fr = lerp(fr, borderColor[0], inBorder);
  fg = lerp(fg, borderColor[1], inBorder);
  fb = lerp(fb, borderColor[2], inBorder);

  // Sun-bleached fading near edges
  const edgeFade = smoothstep(0.4, 0.5, Math.max(Math.abs(cx), Math.abs(cy)));
  fr = lerp(fr, fr + 25, edgeFade);
  fg = lerp(fg, fg + 20, edgeFade);
  fb = lerp(fb, fb + 15, edgeFade);

  return [
    clamp(Math.round(fr), 0, 255),
    clamp(Math.round(fg), 0, 255),
    clamp(Math.round(fb), 0, 255)
  ];
}

// ─── Main generator ─────────────────────────────────────────────────────

export function createProceduralPbr(params: ProceduralPbrParams): ProceduralPbrSet {
  const size = params.tileSize ?? 512;
  const style = params.style ?? "default";
  const seed = hashSeed(params.seedKey);
  const next = lcg(seed);
  const perm = buildPerm(seed);

  const colorCanvas = makeCanvas(size);
  const roughCanvas = makeCanvas(size);
  const aoCanvas = makeCanvas(size);

  const colorCtx = colorCanvas.getContext("2d");
  const roughCtx = roughCanvas.getContext("2d");
  const aoCtx = aoCanvas.getContext("2d");
  if (!colorCtx || !roughCtx || !aoCtx) {
    throw new Error("Could not create procedural texture contexts.");
  }

  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const aoImg = aoCtx.createImageData(size, size);
  const height = new Float32Array(size * size);

  // ─── Pass 1: Generate height field ────────────────────────────────

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const gx = x / size;
      const gy = y / size;
      const micro = (rand01(next) * 2 - 1) * 0.55 + (rand01(next) * 2 - 1) * 0.45;

      let h: number;
      switch (style) {
        case "stucco":  h = heightStucco(gx, gy, perm, micro); break;
        case "cobble":  h = heightCobble(gx, gy, perm, micro); break;
        case "tile":    h = heightTile(gx, gy, perm, micro); break;
        case "cloth":   h = heightCloth(gx, gy, perm, micro); break;
        case "wood":    h = heightWood(gx, gy, perm, micro); break;
        case "sand":    h = heightSand(gx, gy, perm, micro); break;
        case "metal":   h = heightMetal(gx, gy, perm, micro); break;
        case "rug":     h = heightRug(gx, gy, perm, micro); break;
        default:        h = heightDefault(gx, gy, perm, micro); break;
      }

      height[i] = h;
    }
  }

  // ─── Pass 2: Generate color, roughness, AO from height field ──────

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const px = i * 4;
      const gx = x / size;
      const gy = y / size;
      const h = height[i]!;

      // --- Grime system: layered dirt, moisture, dust ---
      const baseDirt = clamp((rand01(next) - 0.5) * 0.6 + (h * 0.5 + 0.5), 0, 1) * params.grime;
      const moistureStain = smoothstep(0.8, 1.0, gy) * params.grime * 0.3; // Bottom of texture = wet
      const dustLayer = smoothstep(0.2, 0.0, gy) * params.grime * 0.15; // Top = dusty
      const grimeMask = clamp(baseDirt + moistureStain - dustLayer, 0, 1);

      const wear = (rand01(next) - 0.5) * params.contrast;

      // Base color with wear
      let r = clamp(Math.round(params.baseColor[0] + wear - grimeMask * 30), 0, 255);
      let g = clamp(Math.round(params.baseColor[1] + wear - grimeMask * 25), 0, 255);
      let b = clamp(Math.round(params.baseColor[2] + wear - grimeMask * 18), 0, 255);

      // Style-specific color modifiers
      if (style === "stucco") {
        [r, g, b] = colorStucco(r, g, b, gx, gy, h, perm);
      } else if (style === "cobble") {
        [r, g, b] = colorCobble(r, g, b, gx, gy, h, perm);
      } else if (style === "tile") {
        [r, g, b] = colorTile(r, g, b, gx, gy);
      } else if (style === "metal") {
        [r, g, b] = colorMetal(r, g, b, gx, gy, h, perm);
      } else if (style === "rug") {
        [r, g, b] = colorRug(gx, gy);
      } else if (style === "wood") {
        // Darken grain valleys
        const grainDarken = smoothstep(0.0, -0.2, h) * 18;
        r = clamp(Math.round(r - grainDarken), 0, 255);
        g = clamp(Math.round(g - grainDarken * 0.8), 0, 255);
        b = clamp(Math.round(b - grainDarken * 0.5), 0, 255);
      } else if (style === "cloth") {
        // Subtle thread-group color variation
        const threadVar = simplex2(gx * 8, gy * 8, perm) * 12;
        r = clamp(Math.round(r + threadVar), 0, 255);
        g = clamp(Math.round(g + threadVar * 0.6), 0, 255);
        b = clamp(Math.round(b + threadVar * 0.3), 0, 255);
      }

      colorImg.data[px + 0] = r;
      colorImg.data[px + 1] = g;
      colorImg.data[px + 2] = b;
      colorImg.data[px + 3] = 255;

      // --- Roughness ---
      let rough: number;
      if (style === "metal") {
        // Rust is rougher, polished metal is smoother
        const rustMask = fbm(gx * 4, gy * 4, perm, { octaves: 5, scale: 0.8 });
        const rustAmount = smoothstep(0.15, 0.5, rustMask);
        rough = clamp(Math.round(100 + rustAmount * 90 + grimeMask * 40), 0, 255);
      } else if (style === "cloth" || style === "sand") {
        rough = clamp(Math.round(200 + grimeMask * 40 + (rand01(next) - 0.5) * 16), 0, 255);
      } else if (style === "tile") {
        // Glazed tiles are smoother
        const tileX = ((gx * 8) % 1 + 1) % 1;
        const tileY = ((gy * 8) % 1 + 1) % 1;
        const groutX = smoothstep(0.0, 0.06, Math.min(tileX, 1 - tileX));
        const groutY = smoothstep(0.0, 0.06, Math.min(tileY, 1 - tileY));
        const onTile = Math.min(groutX, groutY);
        rough = clamp(Math.round(lerp(200, 110, onTile) + grimeMask * 30), 0, 255);
      } else {
        rough = clamp(Math.round(170 + grimeMask * 65 + (1 - (h * 0.5 + 0.5)) * 20), 0, 255);
      }
      roughImg.data[px + 0] = rough;
      roughImg.data[px + 1] = rough;
      roughImg.data[px + 2] = rough;
      roughImg.data[px + 3] = 255;

      // --- AO: darken concavities ---
      // Sample neighborhood for local occlusion
      const sampleRadius = 3;
      let aoSum = 0;
      let aoCount = 0;
      for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
        for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
          const sx = (x + dx + size) % size;
          const sy = (y + dy + size) % size;
          const neighborH = height[sy * size + sx]!;
          if (neighborH > h) {
            aoSum += (neighborH - h);
          }
          aoCount++;
        }
      }
      const aoOcclusion = clamp(aoSum / aoCount * 4, 0, 0.7);
      const aoValue = clamp(Math.round((1 - aoOcclusion) * 255), 0, 255);
      aoImg.data[px + 0] = aoValue;
      aoImg.data[px + 1] = aoValue;
      aoImg.data[px + 2] = aoValue;
      aoImg.data[px + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  aoCtx.putImageData(aoImg, 0, 0);

  // ─── Normal map: central-difference from height field ─────────────

  const normalData = new Uint8Array(size * size * 4);
  const normalStrength = style === "cobble" ? 1.4 : style === "stucco" ? 1.2 : style === "wood" ? 1.1 : style === "metal" ? 0.9 : 1.0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const px = idx * 4;

      // Central difference for smoother normals
      const x0 = (x - 1 + size) % size;
      const x1 = (x + 1) % size;
      const y0 = (y - 1 + size) % size;
      const y1 = (y + 1) % size;

      const hL = height[y * size + x0]!;
      const hR = height[y * size + x1]!;
      const hD = height[y0 * size + x]!;
      const hU = height[y1 * size + x]!;

      const sx = (hR - hL) * normalStrength;
      const sy = (hU - hD) * normalStrength;
      const nz = 1;
      const len = Math.hypot(sx, sy, nz) || 1;

      normalData[px + 0] = Math.round((sx / len * 0.5 + 0.5) * 255);
      normalData[px + 1] = Math.round((sy / len * 0.5 + 0.5) * 255);
      normalData[px + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
      normalData[px + 3] = 255;
    }
  }

  // ─── Create Three.js textures ─────────────────────────────────────

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = 8;

  const normalMap = new THREE.DataTexture(normalData, size, size, THREE.RGBAFormat);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.needsUpdate = true;

  const aoMap = new THREE.CanvasTexture(aoCanvas);
  aoMap.wrapS = THREE.RepeatWrapping;
  aoMap.wrapT = THREE.RepeatWrapping;
  aoMap.anisotropy = 8;

  return { map, roughnessMap, normalMap, aoMap };
}
