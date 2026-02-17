import {
  parseAnchorsSpec,
  parseBlockoutSpec,
  parseShotsSpec,
  type RuntimeMapAssets,
} from "./types";

export class RuntimeMapLoadError extends Error {
  readonly url: string;
  readonly status: number | null;

  constructor(url: string, message: string, status: number | null = null) {
    super(`[map-load] ${message}`);
    this.name = "RuntimeMapLoadError";
    this.url = url;
    this.status = status;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RuntimeMapLoadError(url, `Network error: ${detail}`);
  }

  if (!response.ok) {
    throw new RuntimeMapLoadError(url, `HTTP ${response.status} ${response.statusText}`.trim(), response.status);
  }

  try {
    return await response.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RuntimeMapLoadError(url, `Invalid JSON: ${detail}`, response.status);
  }
}

export async function loadMap(mapId: string): Promise<RuntimeMapAssets> {
  const mapSpecUrl = `/maps/${mapId}/map_spec.json`;
  const shotsUrl = `/maps/${mapId}/shots.json`;

  const [mapSpecJson, shotsJson] = await Promise.all([
    fetchJson(mapSpecUrl),
    fetchJson(shotsUrl),
  ]);

  try {
    return {
      blockout: parseBlockoutSpec(mapSpecJson, mapSpecUrl),
      anchors: parseAnchorsSpec(mapSpecJson, mapSpecUrl),
      shots: parseShotsSpec(shotsJson, shotsUrl),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RuntimeMapLoadError(`/maps/${mapId}/`, detail);
  }
}
