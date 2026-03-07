import { handleSessionRequest } from "../server/sessionToken.js";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleSessionRequest(request);
}

export async function OPTIONS(request: Request): Promise<Response> {
  return handleSessionRequest(request);
}
