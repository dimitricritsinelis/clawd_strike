import { Group } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { disposeObjectRoot } from "../../utils/disposeObjectRoot";

type UnknownRecord = Record<string, unknown>;

type PropModelEntry = {
  id: string;
  url: string;
  scale: number;
};

function asRecord(value: unknown, context: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context}: expected object`);
  }
  return value as UnknownRecord;
}

function asString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context}: expected non-empty string`);
  }
  return value;
}

function asOptionalNumber(value: unknown, context: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context}: expected finite number`);
  }
  return value;
}

function parseEntries(value: unknown): PropModelEntry[] {
  const root = asRecord(value, "models.json");
  const rawModels = root.models;
  if (!Array.isArray(rawModels)) {
    throw new Error("models.json.models must be an array");
  }

  return rawModels.map((item, index) => {
    const model = asRecord(item, `models[${index}]`);
    return {
      id: asString(model.id, `models[${index}].id`),
      url: asString(model.url, `models[${index}].url`),
      scale: Math.max(0.001, asOptionalNumber(model.scale, `models[${index}].scale`) ?? 1),
    };
  });
}

export class PropModelLibrary {
  private readonly templatesById: Map<string, Group>;

  private constructor(templatesById: Map<string, Group>) {
    this.templatesById = templatesById;
  }

  static async load(manifestUrl: string): Promise<PropModelLibrary> {
    const resolvedManifestUrl = new URL(manifestUrl, window.location.href);
    const response = await fetch(resolvedManifestUrl.toString());
    if (!response.ok) {
      throw new Error(`Failed to fetch prop manifest (${response.status} ${response.statusText})`);
    }

    const manifestJson: unknown = await response.json();
    const entries = parseEntries(manifestJson);
    const loader = new GLTFLoader();
    const templatesById = new Map<string, Group>();

    await Promise.all(
      entries.map(async (entry) => {
        const resolvedModelUrl = new URL(entry.url, resolvedManifestUrl).toString();
        const gltf = await loader.loadAsync(resolvedModelUrl);
        const root = new Group();
        root.name = `prop-template-${entry.id}`;

        const source = gltf.scene;
        if (entry.scale !== 1) {
          source.scale.multiplyScalar(entry.scale);
        }

        source.traverse((node) => {
          const mesh = node as { isMesh?: boolean; castShadow?: boolean; receiveShadow?: boolean };
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        });

        root.add(source);
        templatesById.set(entry.id, root);
      }),
    );

    return new PropModelLibrary(templatesById);
  }

  hasModel(id: string): boolean {
    return this.templatesById.has(id);
  }

  instantiate(id: string): Group {
    const template = this.templatesById.get(id);
    if (!template) {
      throw new Error(`Prop model '${id}' is not available`);
    }
    const clone = template.clone(true);
    clone.traverse((node) => {
      const mesh = node as { isMesh?: boolean; castShadow?: boolean; receiveShadow?: boolean };
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    return clone;
  }

  dispose(): void {
    for (const template of this.templatesById.values()) {
      disposeObjectRoot(template);
      template.clear();
    }
    this.templatesById.clear();
  }
}
