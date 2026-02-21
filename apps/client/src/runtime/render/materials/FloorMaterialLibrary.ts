import {
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
} from "three";

export type FloorTextureQuality = "1k" | "2k";

type FloorTextureSet = {
  albedo: string;
  normal: string;
  arm: string;
};

type FloorMaterialEntry = {
  id: string;
  tileSizeM: number;
  textures: Record<FloorTextureQuality, FloorTextureSet>;
};

type UnknownRecord = Record<string, unknown>;

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

function asNumber(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context}: expected finite number`);
  }
  return value;
}

function parseTextureSet(value: unknown, context: string): FloorTextureSet {
  const record = asRecord(value, context);
  const albedo = asString(record.albedo, `${context}.albedo`);
  const normal = asString(record.normal, `${context}.normal`);
  const arm = asString(record.arm, `${context}.arm`);
  return { albedo, normal, arm };
}

function parseEntry(value: unknown, index: number): FloorMaterialEntry {
  const context = `materials[${index}]`;
  const record = asRecord(value, context);
  const texturesRaw = asRecord(record.textures, `${context}.textures`);
  return {
    id: asString(record.id, `${context}.id`),
    tileSizeM: Math.max(0.05, asNumber(record.tileSizeM, `${context}.tileSizeM`)),
    textures: {
      "1k": parseTextureSet(texturesRaw["1k"], `${context}.textures.1k`),
      "2k": parseTextureSet(texturesRaw["2k"], `${context}.textures.2k`),
    },
  };
}

function parseManifest(value: unknown): FloorMaterialEntry[] {
  const root = asRecord(value, "materials.json");
  const materials = root.materials;
  if (!Array.isArray(materials) || materials.length === 0) {
    throw new Error("materials.json.materials must be a non-empty array");
  }
  return materials.map((entry, index) => parseEntry(entry, index));
}

export class FloorMaterialLibrary {
  private static readonly textureCache = new Map<string, Promise<Texture>>();

  private readonly materialsById = new Map<string, FloorMaterialEntry>();
  private readonly textureLoader = new TextureLoader();

  private constructor(private readonly baseDirUrl: string, materials: FloorMaterialEntry[]) {
    for (const material of materials) {
      this.materialsById.set(material.id, material);
    }
  }

  static async load(manifestUrl: string): Promise<FloorMaterialLibrary> {
    const resolvedManifestUrl = new URL(manifestUrl, window.location.href);
    const response = await fetch(resolvedManifestUrl.toString());
    if (!response.ok) {
      throw new Error(`Failed to fetch floor manifest (${response.status} ${response.statusText})`);
    }

    let manifestJson: unknown;
    try {
      manifestJson = await response.json();
    } catch (error) {
      throw new Error(
        `Failed to parse floor manifest JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const materials = parseManifest(manifestJson);
    const baseDirUrl = new URL("./", resolvedManifestUrl).toString();
    return new FloorMaterialLibrary(baseDirUrl, materials);
  }

  getTileSizeM(materialId: string): number {
    return this.requireMaterial(materialId).tileSizeM;
  }

  createStandardMaterial(materialId: string, quality: FloorTextureQuality): MeshStandardMaterial {
    const entry = this.requireMaterial(materialId);
    const maps = entry.textures[quality];

    const material = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.96,
      metalness: 0,
      normalScale: new Vector2(0.7, 0.7),
    });

    void this.applyMaps(material, maps);
    return material;
  }

  private requireMaterial(materialId: string): FloorMaterialEntry {
    const entry = this.materialsById.get(materialId);
    if (!entry) {
      throw new Error(`Floor material '${materialId}' is not defined in materials.json`);
    }
    return entry;
  }

  private resolveTextureUrl(relativeOrAbsoluteUrl: string): string {
    return new URL(relativeOrAbsoluteUrl, this.baseDirUrl).toString();
  }

  private async applyMaps(material: MeshStandardMaterial, maps: FloorTextureSet): Promise<void> {
    try {
      const [albedoTex, normalTex, armTex] = await Promise.all([
        this.loadTexture(maps.albedo, SRGBColorSpace),
        this.loadTexture(maps.normal, NoColorSpace),
        this.loadTexture(maps.arm, NoColorSpace),
      ]);

      material.map = albedoTex;
      material.normalMap = normalTex;
      material.aoMap = armTex;
      material.aoMapIntensity = 0.7;
      material.roughnessMap = armTex;
      material.metalnessMap = armTex;
      material.roughness = 0.96;
      material.metalness = 0;
      material.needsUpdate = true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`[floors] failed to load PBR floor textures: ${detail}`);
    }
  }

  private loadTexture(url: string, colorSpace: Texture["colorSpace"]): Promise<Texture> {
    const resolvedUrl = this.resolveTextureUrl(url);
    let promise = FloorMaterialLibrary.textureCache.get(resolvedUrl);
    if (!promise) {
      promise = this.textureLoader.loadAsync(resolvedUrl).then((texture) => {
        texture.colorSpace = colorSpace;
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        texture.anisotropy = 8;
        texture.needsUpdate = true;
        return texture;
      }).catch((error: unknown) => {
        FloorMaterialLibrary.textureCache.delete(resolvedUrl);
        throw error;
      });
      FloorMaterialLibrary.textureCache.set(resolvedUrl, promise);
    }
    return promise;
  }
}
