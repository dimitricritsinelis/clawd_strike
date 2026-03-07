import {
  parseSharedChampionGetResponse,
  parseSharedChampionPostResponse,
  type SharedChampion,
  type SharedChampionPostRequest,
  type SharedChampionSnapshot,
  type SharedChampionSnapshotStatus,
} from "../../../shared/highScore";

const SHARED_CHAMPION_ENDPOINT = "/api/high-score";

let status: SharedChampionSnapshotStatus = "idle";
let champion: SharedChampion | null = null;
let pendingLoad: Promise<SharedChampionSnapshot> | null = null;

function snapshot(): SharedChampionSnapshot {
  return {
    status,
    champion,
  };
}

export function getSharedChampionSnapshot(): SharedChampionSnapshot {
  return snapshot();
}

export async function loadSharedChampion(options: { force?: boolean } = {}): Promise<SharedChampionSnapshot> {
  if (!options.force && status === "ready") {
    return snapshot();
  }
  if (pendingLoad) {
    return pendingLoad;
  }

  status = "loading";
  pendingLoad = fetch(SHARED_CHAMPION_ENDPOINT, {
    method: "GET",
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`GET /api/high-score failed: ${response.status}`);
      }

      const parsed = parseSharedChampionGetResponse(await response.json());
      if (!parsed) {
        throw new Error("GET /api/high-score returned an invalid payload.");
      }

      champion = parsed.champion;
      status = "ready";
      return snapshot();
    })
    .catch((error) => {
      console.warn("[shared-champion] failed to load", error);
      status = champion ? "ready" : "unavailable";
      return snapshot();
    })
    .finally(() => {
      pendingLoad = null;
    });

  return pendingLoad;
}

export async function submitSharedChampionCandidate(
  candidate: SharedChampionPostRequest,
  sessionToken: string | null,
): Promise<{ updated: boolean; snapshot: SharedChampionSnapshot }> {
  try {
    const response = await fetch(SHARED_CHAMPION_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ ...candidate, sessionToken }),
    });
    if (!response.ok) {
      throw new Error(`POST /api/high-score failed: ${response.status}`);
    }

    const parsed = parseSharedChampionPostResponse(await response.json());
    if (!parsed) {
      throw new Error("POST /api/high-score returned an invalid payload.");
    }

    champion = parsed.champion;
    status = "ready";
    return {
      updated: parsed.updated,
      snapshot: snapshot(),
    };
  } catch (error) {
    console.warn("[shared-champion] failed to submit", error);
    if (!champion) {
      status = "unavailable";
    }
    return {
      updated: false,
      snapshot: snapshot(),
    };
  }
}
