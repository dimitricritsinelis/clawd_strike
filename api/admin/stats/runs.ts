import { handleSharedChampionStatsRunsRequest } from "../../../server/highScoreAdminApi.js";
import {
  createPostgresSharedChampionStore,
  hasConfiguredSharedChampionDatabase,
} from "../../../server/highScoreStore.js";

const sharedChampionStore = hasConfiguredSharedChampionDatabase("write")
  && hasConfiguredSharedChampionDatabase("read")
  ? createPostgresSharedChampionStore()
  : null;

export default async function handler(request: Request): Promise<Response> {
  return handleSharedChampionStatsRunsRequest(request, sharedChampionStore);
}

export const GET = handler;
