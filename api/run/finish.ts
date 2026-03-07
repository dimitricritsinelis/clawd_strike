import { handleSharedChampionRunFinishRequest } from "../../server/highScoreRunApi.js";
import {
  createPostgresSharedChampionStore,
  hasConfiguredSharedChampionDatabase,
} from "../../server/highScoreStore.js";

const sharedChampionStore = hasConfiguredSharedChampionDatabase()
  ? createPostgresSharedChampionStore()
  : null;

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleSharedChampionRunFinishRequest(request, sharedChampionStore);
}
