import {
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
} from "three";

export type WallTextureQuality = "1k" | "2k";

type WallTextureSet = {
  albedo: string;
  normal: string;
  arm: string;
};

type WallMaterialEntry = {
  id: string;
  tileSizeM: number;
  tintHex?: string;
  albedoBoost?: number;
  roughness?: number;
  normalScale?: number;
  aoIntensity?: number;
  textures: Record<WallTextureQuality, WallTextureSet>;
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

function parseTextureSet(value: unknown, context: string): WallTextureSet {
  const record = asRecord(value, context);
  return {
    albedo: asString(record.albedo, `${context}.albedo`),
    normal: asString(record.normal, `${context}.normal`),
    arm: asString(record.arm, `${context}.arm`),
  };
}

function parseEntry(value: unknown, index: number): WallMaterialEntry {
  const context = `materials[${index}]`;
  const record = asRecord(value, context);
  const texturesRaw = asRecord(record.textures, `${context}.textures`);

  const tintHex = asOptionalString(record.tintHex, `${context}.tintHex`);
  const albedoBoost = asOptionalNumber(record.albedoBoost, `${context}.albedoBoost`);
  const roughness = asOptionalNumber(record.roughness, `${context}.roughness`);
  const normalScale = asOptionalNumber(record.normalScale, `${context}.normalScale`);
  const aoIntensity = asOptionalNumber(record.aoIntensity, `${context}.aoIntensity`);

  const entry: WallMaterialEntry = {
    id: asString(record.id, `${context}.id`),
    tileSizeM: Math.max(0.05, asNumber(record.tileSizeM, `${context}.tileSizeM`)),
    textures: {
      "1k": parseTextureSet(texturesRaw["1k"], `${context}.textures.1k`),
      "2k": parseTextureSet(texturesRaw["2k"], `${context}.textures.2k`),
    },
  };

  if (tintHex !== undefined) entry.tintHex = tintHex;
  if (albedoBoost !== undefined) entry.albedoBoost = albedoBoost;
  if (roughness !== undefined) entry.roughness = roughness;
  if (normalScale !== undefined) entry.normalScale = normalScale;
  if (aoIntensity !== undefined) entry.aoIntensity = aoIntensity;
  return entry;
}

export class WallMaterialLibrary {
  private static readonly textureCache = new Map<string, Promise<Texture>>();

  private readonly materialIds: string[] = [];
  private readonly materialsById = new Map<string, WallMaterialEntry>();
  private readonly textureLoader = new TextureLoader();

  private constructor(private readonly baseDirUrl: string, materials: WallMaterialEntry[]) {
    for (const material of materials) {
      this.materialIds.push(material.id);
      this.materialsById.set(material.id, material);
    }
  }

  static async load(manifestUrl: string): Promise<WallMaterialLibrary> {
    const resolvedManifestUrl = new URL(manifestUrl, window.location.href);
    const response = await fetch(resolvedManifestUrl.toString());
    if (!response.ok) {
      throw new Error(`Failed to fetch wall manifest (${response.status} ${response.statusText})`);
    }

    const manifestJson: unknown = await response.json();
    const root = asRecord(manifestJson, "materials.json");
    if (!Array.isArray(root.materials) || root.materials.length === 0) {
      throw new Error("materials.json.materials must be a non-empty array");
    }

    const materials = root.materials.map((entry, index) => parseEntry(entry, index));
    const baseDirUrl = new URL("./", resolvedManifestUrl).toString();
    return new WallMaterialLibrary(baseDirUrl, materials);
  }

  getMaterialIds(): readonly string[] {
    return this.materialIds;
  }

  getTileSizeM(materialId: string): number {
    const entry = this.materialsById.get(materialId);
    if (!entry) throw new Error(`Wall material '${materialId}' not found`);
    return entry.tileSizeM;
  }

  createStandardMaterial(materialId: string, quality: WallTextureQuality): MeshStandardMaterial {
    const entry = this.materialsById.get(materialId);
    if (!entry) throw new Error(`Wall material '${materialId}' not found`);

    const maps = entry.textures[quality];
    const material = new MeshStandardMaterial({
      color: entry.tintHex ?? 0xffffff,
      roughness: entry.roughness ?? 0.95,
      metalness: 0,
      normalScale: new Vector2(entry.normalScale ?? 0.55, entry.normalScale ?? 0.55),
    });

    material.userData.wallAlbedoBoost = entry.albedoBoost ?? 1;
    void this.applyMaps(material, entry, maps);
    return material;
  }

  private resolveTextureUrl(relativeOrAbsoluteUrl: string): string {
    return new URL(relativeOrAbsoluteUrl, this.baseDirUrl).toString();
  }

  private async applyMaps(
    material: MeshStandardMaterial,
    entry: WallMaterialEntry,
    maps: WallTextureSet,
  ): Promise<void> {
    const [albedoTex, normalTex, armTex] = await Promise.all([
      this.loadTexture(maps.albedo, SRGBColorSpace),
      this.loadTexture(maps.normal, NoColorSpace),
      this.loadTexture(maps.arm, NoColorSpace),
    ]);

    material.map = albedoTex;
    material.normalMap = normalTex;
    material.aoMap = armTex;
    material.aoMapIntensity = entry.aoIntensity ?? 0.55;
    material.roughnessMap = armTex;
    material.metalnessMap = armTex;
    material.needsUpdate = true;
  }

  private loadTexture(url: string, colorSpace: Texture["colorSpace"]): Promise<Texture> {
    const resolvedUrl = this.resolveTextureUrl(url);
    let promise = WallMaterialLibrary.textureCache.get(resolvedUrl);
    if (!promise) {
      promise = this.textureLoader.loadAsync(resolvedUrl).then((texture) => {
        texture.colorSpace = colorSpace;
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        texture.anisotropy = 8;
        texture.needsUpdate = true;
        return texture;
      });
      WallMaterialLibrary.textureCache.set(resolvedUrl, promise);
    }
    return promise;
  }
}
