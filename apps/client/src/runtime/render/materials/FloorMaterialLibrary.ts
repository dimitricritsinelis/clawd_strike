import {
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
} from "three";

export type FloorTextureQuality = "1k" | "2k" | "4k";

type FloorTextureSet = {
  albedo: string;
  normal: string;
  arm: string;
};

type FloorMaterialEntry = {
  id: string;
  tileSizeM: number;
  tintHex?: string;
  albedoBoost?: number;
  albedoGamma?: number;
  dustStrength?: number;
  roughness?: number;
  normalScale?: number;
  aoIntensity?: number;
  textures: Partial<Record<FloorTextureQuality, FloorTextureSet>>;
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

function asOptionalNumber(value: unknown, context: string): number | undefined {
  if (value === undefined) return undefined;
  return asNumber(value, context);
}

function asOptionalString(value: unknown, context: string): string | undefined {
  if (value === undefined) return undefined;
  return asString(value, context);
}

function parseTextureSet(value: unknown, context: string): FloorTextureSet {
  const record = asRecord(value, context);
  const albedo = asString(record.albedo, `${context}.albedo`);
  const normal = asString(record.normal, `${context}.normal`);
  const arm = asString(record.arm, `${context}.arm`);
  return { albedo, normal, arm };
}

function parseOptionalTextureSet(value: unknown, context: string): FloorTextureSet | undefined {
  if (value === undefined) return undefined;
  return parseTextureSet(value, context);
}

function resolveTextureSetForQuality(
  textures: Partial<Record<FloorTextureQuality, FloorTextureSet>>,
  quality: FloorTextureQuality,
): FloorTextureSet {
  return (
    textures[quality] ??
    textures["4k"] ??
    textures["2k"] ??
    textures["1k"] ??
    (() => {
      throw new Error("Material is missing all supported texture variants");
    })()
  );
}

function parseEntry(value: unknown, index: number): FloorMaterialEntry {
  const context = `materials[${index}]`;
  const record = asRecord(value, context);
  const texturesRaw = asRecord(record.textures, `${context}.textures`);
  const tintHexRaw = asOptionalString(record.tintHex, `${context}.tintHex`);
  const albedoBoostRaw = asOptionalNumber(record.albedoBoost, `${context}.albedoBoost`);
  const albedoGammaRaw = asOptionalNumber(record.albedoGamma, `${context}.albedoGamma`);
  const dustStrengthRaw = asOptionalNumber(record.dustStrength, `${context}.dustStrength`);
  const roughnessRaw = asOptionalNumber(record.roughness, `${context}.roughness`);
  const normalScaleRaw = asOptionalNumber(record.normalScale, `${context}.normalScale`);
  const aoIntensityRaw = asOptionalNumber(record.aoIntensity, `${context}.aoIntensity`);
  if (tintHexRaw !== undefined && !/^#[0-9a-fA-F]{6}$/.test(tintHexRaw)) {
    throw new Error(`${context}.tintHex: expected #RRGGBB hex color`);
  }

  const textures: Partial<Record<FloorTextureQuality, FloorTextureSet>> = {};
  const oneK = parseOptionalTextureSet(texturesRaw["1k"], `${context}.textures.1k`);
  const twoK = parseOptionalTextureSet(texturesRaw["2k"], `${context}.textures.2k`);
  const fourK = parseOptionalTextureSet(texturesRaw["4k"], `${context}.textures.4k`);
  if (oneK) textures["1k"] = oneK;
  if (twoK) textures["2k"] = twoK;
  if (fourK) textures["4k"] = fourK;

  const entry: FloorMaterialEntry = {
    id: asString(record.id, `${context}.id`),
    tileSizeM: Math.max(0.05, asNumber(record.tileSizeM, `${context}.tileSizeM`)),
    textures,
  };

  if (!entry.textures["1k"] && !entry.textures["2k"] && !entry.textures["4k"]) {
    throw new Error(`${context}.textures: expected at least one of 1k, 2k, or 4k`);
  }

  if (albedoBoostRaw !== undefined) entry.albedoBoost = Math.max(0, Math.min(2, albedoBoostRaw));
  if (albedoGammaRaw !== undefined) entry.albedoGamma = Math.max(0.65, Math.min(1.25, albedoGammaRaw));
  if (dustStrengthRaw !== undefined) entry.dustStrength = Math.max(0, Math.min(0.8, dustStrengthRaw));
  if (roughnessRaw !== undefined) entry.roughness = Math.max(0, Math.min(1, roughnessRaw));
  if (normalScaleRaw !== undefined) entry.normalScale = Math.max(0, Math.min(1, normalScaleRaw));
  if (aoIntensityRaw !== undefined) entry.aoIntensity = Math.max(0, Math.min(1, aoIntensityRaw));
  if (tintHexRaw !== undefined) entry.tintHex = tintHexRaw;

  return entry;
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
    const maps = resolveTextureSetForQuality(entry.textures, quality);
    const roughness = entry.roughness ?? 0.96;
    const normalScale = entry.normalScale ?? 0.7;
    const albedoBoost = entry.albedoBoost ?? 1;
    const albedoGamma = entry.albedoGamma ?? 1;
    const dustStrength = entry.dustStrength ?? 0;

    const material = new MeshStandardMaterial({
      color: entry.tintHex ?? 0xffffff,
      roughness,
      metalness: 0,
      normalScale: new Vector2(normalScale, normalScale),
    });
    material.userData.floorAlbedoBoost = albedoBoost;
    material.userData.floorAlbedoGamma = albedoGamma;
    material.userData.floorDustStrength = dustStrength;

    void this.applyMaps(material, entry, maps);
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

  private async applyMaps(
    material: MeshStandardMaterial,
    entry: FloorMaterialEntry,
    maps: FloorTextureSet,
  ): Promise<void> {
    try {
      const [albedoTex, normalTex, armTex] = await Promise.all([
        this.loadTexture(maps.albedo, SRGBColorSpace),
        this.loadTexture(maps.normal, NoColorSpace),
        this.loadTexture(maps.arm, NoColorSpace),
      ]);

      material.map = albedoTex;
      material.normalMap = normalTex;
      material.aoMap = armTex;
      material.aoMapIntensity = entry.aoIntensity ?? 0.7;
      material.roughnessMap = armTex;
      material.metalnessMap = armTex;
      material.roughness = entry.roughness ?? 0.96;
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
