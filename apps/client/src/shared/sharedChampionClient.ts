import {
  parseSharedChampionGetResponse,
  parseSharedChampionRunFinishResponse,
  parseSharedChampionRunStartResponse,
  SHARED_CHAMPION_RUN_FINISH_ENDPOINT,
  SHARED_CHAMPION_RUN_START_ENDPOINT,
  SHARED_CHAMPION_SCORE_WRITE_ENDPOINT,
  type SharedChampion,
  type SharedChampionRunStartRequest,
  type SharedChampionRunSummary,
  type SharedChampionSnapshot,
  type SharedChampionSnapshotStatus,
} from "../../../shared/highScore";
import { isLocalhostHostname } from "./hostEnvironment";

const SHARED_CHAMPION_ENDPOINT = SHARED_CHAMPION_SCORE_WRITE_ENDPOINT;
export type SharedChampionRunSession = {
  runToken: string;
  issuedAt: string;
  expiresAt: string;
};

export type LoadSharedChampionResult = {
  snapshot: SharedChampionSnapshot;
  loadedFromNetwork: boolean;
};

let status: SharedChampionSnapshotStatus = "idle";
let champion: SharedChampion | null = null;
let pendingLoad: Promise<LoadSharedChampionResult> | null = null;

function snapshot(): SharedChampionSnapshot {
  return {
    status,
    champion,
  };
}

export function getSharedChampionSnapshot(): SharedChampionSnapshot {
  return snapshot();
}

function canUseSharedChampionNetwork(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  if (import.meta.env.DEV) {
    return true;
  }
  return !isLocalhostHostname(window.location.hostname);
}

export async function loadSharedChampionWithMeta(options: { force?: boolean } = {}): Promise<LoadSharedChampionResult> {
  if (!canUseSharedChampionNetwork()) {
    status = champion ? "ready" : "unavailable";
    return {
      snapshot: snapshot(),
      loadedFromNetwork: false,
    };
  }
  if (!options.force && status === "ready") {
    return {
      snapshot: snapshot(),
      loadedFromNetwork: false,
    };
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
      return {
        snapshot: snapshot(),
        loadedFromNetwork: true,
      };
    })
    .catch((error) => {
      console.warn("[shared-champion] failed to load", error);
      status = champion ? "ready" : "unavailable";
      return {
        snapshot: snapshot(),
        loadedFromNetwork: false,
      };
    })
    .finally(() => {
      pendingLoad = null;
    });

  return pendingLoad;
}

export async function loadSharedChampion(options: { force?: boolean } = {}): Promise<SharedChampionSnapshot> {
  const result = await loadSharedChampionWithMeta(options);
  return result.snapshot;
}

export async function startSharedChampionRunSession(
  input: SharedChampionRunStartRequest,
): Promise<SharedChampionRunSession | null> {
  if (!canUseSharedChampionNetwork()) {
    return null;
  }
  try {
    const response = await fetch(SHARED_CHAMPION_RUN_START_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(`POST ${SHARED_CHAMPION_RUN_START_ENDPOINT} failed: ${response.status}`);
    }

    const parsed = parseSharedChampionRunStartResponse(await response.json());
    if (!parsed) {
      throw new Error("POST /api/run/start returned an invalid payload.");
    }

    return {
      runToken: parsed.runToken,
      issuedAt: parsed.issuedAt,
      expiresAt: parsed.expiresAt,
    };
  } catch (error) {
    console.warn("[shared-champion] failed to start run session", error);
    return null;
  }
}

export async function submitSharedChampionRunSession(
  session: SharedChampionRunSession,
  summary: SharedChampionRunSummary,
): Promise<{ accepted: boolean; updated: boolean; reason: string | null; snapshot: SharedChampionSnapshot }> {
  if (!canUseSharedChampionNetwork()) {
    status = champion ? "ready" : "unavailable";
    return {
      accepted: false,
      updated: false,
      reason: "shared-champion-network-disabled",
      snapshot: snapshot(),
    };
  }
  try {
    const response = await fetch(SHARED_CHAMPION_RUN_FINISH_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        runToken: session.runToken,
        summary,
      }),
    });

    const payload = await response.json().catch(() => null);
    const parsed = parseSharedChampionRunFinishResponse(payload);

    if (!response.ok) {
      if (parsed) {
        champion = parsed.champion;
        status = "ready";
        return {
          accepted: parsed.accepted,
          updated: parsed.updated,
          reason: parsed.reason,
          snapshot: snapshot(),
        };
      }

      throw new Error(`POST ${SHARED_CHAMPION_RUN_FINISH_ENDPOINT} failed: ${response.status}`);
    }

    if (!parsed) {
      throw new Error("POST /api/run/finish returned an invalid payload.");
    }

    champion = parsed.champion;
    status = "ready";
    return {
      accepted: parsed.accepted,
      updated: parsed.updated,
      reason: parsed.reason,
      snapshot: snapshot(),
    };
  } catch (error) {
    console.warn("[shared-champion] failed to finish run session", error);
    if (!champion) {
      status = "unavailable";
    }
    return {
      accepted: false,
      updated: false,
      reason: error instanceof Error ? error.message : String(error),
      snapshot: snapshot(),
    };
  }
}
