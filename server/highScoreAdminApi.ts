import {
  authorizeStatsAdminRequest,
} from "./highScoreSecurity.js";
import {
  parseListLimit,
  parseRunStatsFilters,
  parseStatsFilters,
  toDailyResponse,
  toNamesResponse,
  toOverviewResponse,
  toRunsResponse,
  type SharedChampionStatsDailyResponse,
  type SharedChampionStatsNamesResponse,
  type SharedChampionStatsOverviewResponse,
  type SharedChampionStatsRunsResponse,
} from "./highScoreStats.js";
import type { SharedChampionStore } from "./highScoreStore.js";

const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
} as const;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

function errorResponse(status: number, error: string): Response {
  return jsonResponse({ error }, { status });
}

function authorize(request: Request): Response | null {
  const auth = authorizeStatsAdminRequest(request);
  if (auth.ok === true) return null;
  return errorResponse(auth.status, auth.error);
}

function guardRequest(request: Request, store: SharedChampionStore | null): Response | null {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed.");
  }
  if (store === null) {
    return errorResponse(
      503,
      "Shared champion storage is unavailable. Configure supported Postgres write/read env vars.",
    );
  }
  return authorize(request);
}

export async function handleSharedChampionStatsOverviewRequest(
  request: Request,
  store: SharedChampionStore | null,
): Promise<Response> {
  const guard = guardRequest(request, store);
  if (guard) return guard;

  try {
    const url = new URL(request.url);
    const filters = parseStatsFilters(url);
    const overview = await store!.getStatsOverview(filters);
    const response: SharedChampionStatsOverviewResponse = toOverviewResponse(overview, filters);
    return jsonResponse(response);
  } catch (error) {
    return errorResponse(400, error instanceof Error ? error.message : "Invalid stats query.");
  }
}

export async function handleSharedChampionStatsRunsRequest(
  request: Request,
  store: SharedChampionStore | null,
): Promise<Response> {
  const guard = guardRequest(request, store);
  if (guard) return guard;

  try {
    const url = new URL(request.url);
    const filters = parseRunStatsFilters(url);
    const result = await store!.listRuns(filters);
    const response: SharedChampionStatsRunsResponse = toRunsResponse({
      items: result.items,
      nextCursor: result.nextCursor,
      filters,
    });
    return jsonResponse(response);
  } catch (error) {
    return errorResponse(400, error instanceof Error ? error.message : "Invalid stats query.");
  }
}

export async function handleSharedChampionStatsNamesRequest(
  request: Request,
  store: SharedChampionStore | null,
): Promise<Response> {
  const guard = guardRequest(request, store);
  if (guard) return guard;

  try {
    const url = new URL(request.url);
    const filters = parseStatsFilters(url);
    const limit = parseListLimit(url);
    const items = await store!.listNames(filters, limit);
    const response: SharedChampionStatsNamesResponse = toNamesResponse({
      items,
      nextCursor: null,
      limit,
      filters,
      cursor: null,
    });
    return jsonResponse(response);
  } catch (error) {
    return errorResponse(400, error instanceof Error ? error.message : "Invalid stats query.");
  }
}

export async function handleSharedChampionStatsDailyRequest(
  request: Request,
  store: SharedChampionStore | null,
): Promise<Response> {
  const guard = guardRequest(request, store);
  if (guard) return guard;

  try {
    const url = new URL(request.url);
    const filters = parseStatsFilters(url);
    const limit = parseListLimit(url);
    const items = await store!.listDaily(filters, limit);
    const response: SharedChampionStatsDailyResponse = toDailyResponse({
      items,
      nextCursor: null,
      limit,
      filters,
      cursor: null,
    });
    return jsonResponse(response);
  } catch (error) {
    return errorResponse(400, error instanceof Error ? error.message : "Invalid stats query.");
  }
}
