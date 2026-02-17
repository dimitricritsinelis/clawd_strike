import {
  BoxGeometry,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
} from "three";
import { designToWorldVec3 } from "../map/coordinateTransforms";
import type { RuntimeAnchorsSpec } from "../map/types";

const DEFAULT_MAX_LABELS = 40;
const LABEL_MAX_DISTANCE_M = 120;
const LABEL_MAX_DISTANCE_SQ = LABEL_MAX_DISTANCE_M * LABEL_MAX_DISTANCE_M;
const LABEL_MARGIN_PX = 20;

const DEFAULT_TYPE_COLOR = 0xffffff;
const MARKER_COLOR_BY_TYPE: Record<string, number> = {
  cloth_canopy_span: 0x6ea8ff,
  cover_cluster: 0x8ce5b5,
  hero_landmark: 0xff6b6b,
  landmark: 0xff9f43,
  service_door_anchor: 0xb794f4,
  shopfront_anchor: 0xffd166,
  signage_anchor: 0x4ddfd8,
  spawn_cover: 0xd7f3a2,
};

const DEFAULT_MARKER_SCALE = 0.24;
const MARKER_SCALE_BY_TYPE: Record<string, number> = {
  cloth_canopy_span: 0.34,
  hero_landmark: 0.4,
  landmark: 0.34,
  signage_anchor: 0.2,
};

type AnchorRenderEntry = {
  id: string;
  type: string;
  label: string;
  colorHex: number;
  colorCss: string;
  worldX: number;
  worldY: number;
  worldZ: number;
  markerScale: number;
};

type MarkerBatch = {
  mesh: InstancedMesh<BoxGeometry, MeshBasicMaterial>;
  material: MeshBasicMaterial;
};

export type AnchorsDebugOptions = {
  mountEl: HTMLElement;
  scene: Scene;
  showMarkers: boolean;
  showLabels: boolean;
  anchorTypes: readonly string[];
  maxLabels?: number;
};

export type AnchorsDebugState = {
  markersVisible: boolean;
  labelsVisible: boolean;
  totalAnchors: number;
  filteredAnchors: number;
  shownLabels: number;
  filterTypes: readonly string[];
};

function toCssHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function anchorTypeColor(type: string): number {
  return MARKER_COLOR_BY_TYPE[type] ?? DEFAULT_TYPE_COLOR;
}

function anchorMarkerScale(type: string): number {
  return MARKER_SCALE_BY_TYPE[type] ?? DEFAULT_MARKER_SCALE;
}

function normalizeTypes(types: readonly string[]): string[] {
  const normalized = types
    .map((type) => type.trim().toLowerCase())
    .filter((type) => type.length > 0);
  if (normalized.length === 0) return [];
  return [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
}

function isProjectedVisible(projected: Vector3): boolean {
  return projected.z >= -1 && projected.z <= 1;
}

export class AnchorsDebug {
  private readonly markerGeometry = new BoxGeometry(1, 1, 1);
  private readonly markerRoot = new Group();
  private readonly labelRoot: HTMLDivElement;
  private readonly labelPool: HTMLDivElement[] = [];
  private readonly maxLabels: number;
  private readonly filterTypes: readonly string[];
  private readonly filterTypeSet: ReadonlySet<string>;
  private readonly tempInstanceObject = new Object3D();
  private readonly projected = new Vector3();

  private readonly selectedAnchorIndices: Int32Array;
  private readonly selectedAnchorDistances: Float64Array;
  private readonly selectedAnchorScreenX: Float32Array;
  private readonly selectedAnchorScreenY: Float32Array;

  private markerBatches: MarkerBatch[] = [];
  private anchors: AnchorRenderEntry[] = [];
  private markersVisible: boolean;
  private labelsVisible: boolean;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private selectedCount = 0;
  private selectedFarthestIndex = 0;
  private selectedFarthestDistance = -1;
  private totalAnchors = 0;
  private shownLabelCount = 0;

  constructor(options: AnchorsDebugOptions) {
    this.maxLabels = Math.max(1, options.maxLabels ?? DEFAULT_MAX_LABELS);
    this.filterTypes = normalizeTypes(options.anchorTypes);
    this.filterTypeSet = new Set(this.filterTypes);
    this.markersVisible = options.showMarkers;
    this.labelsVisible = options.showLabels;

    this.selectedAnchorIndices = new Int32Array(this.maxLabels);
    this.selectedAnchorDistances = new Float64Array(this.maxLabels);
    this.selectedAnchorScreenX = new Float32Array(this.maxLabels);
    this.selectedAnchorScreenY = new Float32Array(this.maxLabels);

    this.markerRoot.name = "debug-anchors";
    this.markerRoot.visible = this.markersVisible;
    options.scene.add(this.markerRoot);

    this.labelRoot = document.createElement("div");
    this.labelRoot.style.position = "absolute";
    this.labelRoot.style.inset = "0";
    this.labelRoot.style.pointerEvents = "none";
    this.labelRoot.style.zIndex = "14";
    this.labelRoot.style.display = this.labelsVisible ? "block" : "none";
    options.mountEl.append(this.labelRoot);

    for (let i = 0; i < this.maxLabels; i += 1) {
      const label = document.createElement("div");
      label.style.position = "absolute";
      label.style.display = "none";
      label.style.padding = "2px 6px";
      label.style.borderRadius = "6px";
      label.style.border = "1px solid #94a3b8";
      label.style.background = "rgba(15, 23, 42, 0.82)";
      label.style.color = "#f8fafc";
      label.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      label.style.fontSize = "11px";
      label.style.lineHeight = "1.2";
      label.style.whiteSpace = "nowrap";
      label.style.textShadow = "0 1px 0 rgba(0, 0, 0, 0.45)";
      this.labelRoot.append(label);
      this.labelPool.push(label);
    }
  }

  setViewport(width: number, height: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
  }

  setAnchors(spec: RuntimeAnchorsSpec): void {
    this.clearMarkers();
    this.hideAllLabels();

    const sortedAnchors = [...spec.anchors].sort((a, b) => a.id.localeCompare(b.id));
    this.totalAnchors = sortedAnchors.length;
    this.anchors = [];

    for (const anchor of sortedAnchors) {
      const normalizedType = anchor.type.toLowerCase();
      if (this.filterTypeSet.size > 0 && !this.filterTypeSet.has(normalizedType)) {
        continue;
      }

      const basePos = anchor.endPos
        ? {
            x: (anchor.pos.x + anchor.endPos.x) * 0.5,
            y: (anchor.pos.y + anchor.endPos.y) * 0.5,
            z: (anchor.pos.z + anchor.endPos.z) * 0.5,
          }
        : anchor.pos;

      const colorHex = anchorTypeColor(normalizedType);
      const worldPos = designToWorldVec3(basePos);
      this.anchors.push({
        id: anchor.id,
        type: normalizedType,
        label: `${anchor.id} (${normalizedType})`,
        colorHex,
        colorCss: toCssHex(colorHex),
        worldX: worldPos.x,
        worldY: worldPos.y + 0.2,
        worldZ: worldPos.z,
        markerScale: anchorMarkerScale(normalizedType),
      });
    }

    this.buildMarkers();
  }

  setMarkersVisible(visible: boolean): void {
    this.markersVisible = visible;
    this.markerRoot.visible = visible;
  }

  setLabelsVisible(visible: boolean): void {
    this.labelsVisible = visible;
    this.labelRoot.style.display = visible ? "block" : "none";
    if (!visible) {
      this.hideAllLabels();
    }
  }

  toggleMarkers(): boolean {
    this.setMarkersVisible(!this.markersVisible);
    return this.markersVisible;
  }

  toggleLabels(): boolean {
    this.setLabelsVisible(!this.labelsVisible);
    return this.labelsVisible;
  }

  update(camera: PerspectiveCamera): void {
    if (!this.labelsVisible || this.anchors.length === 0) {
      if (this.shownLabelCount > 0) this.hideAllLabels();
      return;
    }

    camera.updateMatrixWorld();

    this.selectedCount = 0;
    this.selectedFarthestIndex = 0;
    this.selectedFarthestDistance = -1;

    const camX = camera.position.x;
    const camY = camera.position.y;
    const camZ = camera.position.z;

    for (let i = 0; i < this.anchors.length; i += 1) {
      const anchor = this.anchors[i]!;
      const dx = anchor.worldX - camX;
      const dy = anchor.worldY - camY;
      const dz = anchor.worldZ - camZ;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      if (distanceSq > LABEL_MAX_DISTANCE_SQ) continue;

      this.projected.set(anchor.worldX, anchor.worldY, anchor.worldZ).project(camera);
      if (!isProjectedVisible(this.projected)) continue;

      const screenX = (this.projected.x * 0.5 + 0.5) * this.viewportWidth;
      const screenY = (-this.projected.y * 0.5 + 0.5) * this.viewportHeight;
      if (
        screenX < -LABEL_MARGIN_PX ||
        screenX > this.viewportWidth + LABEL_MARGIN_PX ||
        screenY < -LABEL_MARGIN_PX ||
        screenY > this.viewportHeight + LABEL_MARGIN_PX
      ) {
        continue;
      }

      this.pushCandidate(i, distanceSq, screenX, screenY);
    }

    if (this.selectedCount > 1) {
      this.sortSelectedByDistance();
    }

    for (let i = 0; i < this.selectedCount; i += 1) {
      const label = this.labelPool[i]!;
      const anchor = this.anchors[this.selectedAnchorIndices[i]!]!;
      label.textContent = anchor.label;
      label.style.borderColor = anchor.colorCss;
      label.style.transform = `translate(${this.selectedAnchorScreenX[i]!.toFixed(1)}px, ${this.selectedAnchorScreenY[i]!.toFixed(1)}px) translate(-50%, -135%)`;
      label.style.display = "block";
    }

    for (let i = this.selectedCount; i < this.shownLabelCount; i += 1) {
      const label = this.labelPool[i]!;
      label.style.display = "none";
    }

    this.shownLabelCount = this.selectedCount;
  }

  getState(): AnchorsDebugState {
    return {
      markersVisible: this.markersVisible,
      labelsVisible: this.labelsVisible,
      totalAnchors: this.totalAnchors,
      filteredAnchors: this.anchors.length,
      shownLabels: this.shownLabelCount,
      filterTypes: this.filterTypes,
    };
  }

  dispose(scene: Scene): void {
    this.hideAllLabels();
    this.clearMarkers();
    this.labelRoot.remove();
    scene.remove(this.markerRoot);
    this.markerGeometry.dispose();
  }

  private buildMarkers(): void {
    if (this.anchors.length === 0) return;

    const byType = new Map<string, number[]>();
    for (let i = 0; i < this.anchors.length; i += 1) {
      const anchor = this.anchors[i]!;
      const existing = byType.get(anchor.type);
      if (existing) {
        existing.push(i);
      } else {
        byType.set(anchor.type, [i]);
      }
    }

    const sortedTypes = [...byType.keys()].sort((a, b) => a.localeCompare(b));
    for (const type of sortedTypes) {
      const indices = byType.get(type);
      if (!indices || indices.length === 0) continue;

      const material = new MeshBasicMaterial({
        color: anchorTypeColor(type),
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new InstancedMesh(this.markerGeometry, material, indices.length);
      mesh.frustumCulled = false;

      for (let i = 0; i < indices.length; i += 1) {
        const anchor = this.anchors[indices[i]!]!;
        this.tempInstanceObject.position.set(anchor.worldX, anchor.worldY, anchor.worldZ);
        this.tempInstanceObject.scale.setScalar(anchor.markerScale);
        this.tempInstanceObject.updateMatrix();
        mesh.setMatrixAt(i, this.tempInstanceObject.matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      mesh.name = `anchors-${type}`;
      this.markerRoot.add(mesh);
      this.markerBatches.push({ mesh, material });
    }
  }

  private clearMarkers(): void {
    for (const batch of this.markerBatches) {
      this.markerRoot.remove(batch.mesh);
      batch.material.dispose();
    }
    this.markerBatches = [];
  }

  private hideAllLabels(): void {
    for (let i = 0; i < this.shownLabelCount; i += 1) {
      const label = this.labelPool[i]!;
      label.style.display = "none";
    }
    this.shownLabelCount = 0;
  }

  private pushCandidate(anchorIndex: number, distanceSq: number, screenX: number, screenY: number): void {
    if (this.selectedCount < this.maxLabels) {
      const slot = this.selectedCount;
      this.selectedAnchorIndices[slot] = anchorIndex;
      this.selectedAnchorDistances[slot] = distanceSq;
      this.selectedAnchorScreenX[slot] = screenX;
      this.selectedAnchorScreenY[slot] = screenY;
      this.selectedCount += 1;

      if (distanceSq > this.selectedFarthestDistance) {
        this.selectedFarthestDistance = distanceSq;
        this.selectedFarthestIndex = slot;
      }
      return;
    }

    if (distanceSq >= this.selectedFarthestDistance) {
      return;
    }

    const slot = this.selectedFarthestIndex;
    this.selectedAnchorIndices[slot] = anchorIndex;
    this.selectedAnchorDistances[slot] = distanceSq;
    this.selectedAnchorScreenX[slot] = screenX;
    this.selectedAnchorScreenY[slot] = screenY;
    this.recomputeFarthestCandidate();
  }

  private recomputeFarthestCandidate(): void {
    let farthestDistance = -1;
    let farthestIndex = 0;
    for (let i = 0; i < this.selectedCount; i += 1) {
      const distance = this.selectedAnchorDistances[i]!;
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = i;
      }
    }
    this.selectedFarthestDistance = farthestDistance;
    this.selectedFarthestIndex = farthestIndex;
  }

  private sortSelectedByDistance(): void {
    for (let i = 1; i < this.selectedCount; i += 1) {
      const indexValue = this.selectedAnchorIndices[i]!;
      const distValue = this.selectedAnchorDistances[i]!;
      const screenX = this.selectedAnchorScreenX[i]!;
      const screenY = this.selectedAnchorScreenY[i]!;

      let j = i - 1;
      while (j >= 0 && this.selectedAnchorDistances[j]! > distValue) {
        const next = j + 1;
        this.selectedAnchorIndices[next] = this.selectedAnchorIndices[j]!;
        this.selectedAnchorDistances[next] = this.selectedAnchorDistances[j]!;
        this.selectedAnchorScreenX[next] = this.selectedAnchorScreenX[j]!;
        this.selectedAnchorScreenY[next] = this.selectedAnchorScreenY[j]!;
        j -= 1;
      }

      const target = j + 1;
      this.selectedAnchorIndices[target] = indexValue;
      this.selectedAnchorDistances[target] = distValue;
      this.selectedAnchorScreenX[target] = screenX;
      this.selectedAnchorScreenY[target] = screenY;
    }
  }
}
