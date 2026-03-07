import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin, ViteDevServer } from "vite";
import { handleSharedChampionRequest } from "./highScoreApi";
import { createInMemorySharedChampionStore } from "./highScoreStore";
import { handleSessionRequest } from "./sessionToken";

const devStore = createInMemorySharedChampionStore();

async function readRequestBody(request: IncomingMessage): Promise<string | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
      continue;
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks).toString("utf8");
}

async function toWebRequest(request: IncomingMessage): Promise<Request> {
  const body = await readRequestBody(request);
  const origin = `http://${request.headers.host ?? "127.0.0.1:5174"}`;
  const url = new URL(request.url ?? "/", origin);

  const init: RequestInit = {
    method: request.method ?? "GET",
    headers: request.headers as HeadersInit,
  };
  if (body) {
    init.body = body;
  }

  return new Request(url.toString(), init);
}

async function writeWebResponse(response: Response, rawResponse: ServerResponse): Promise<void> {
  rawResponse.statusCode = response.status;
  rawResponse.statusMessage = response.statusText;
  response.headers.forEach((value, key) => {
    rawResponse.setHeader(key, value);
  });
  const payload = Buffer.from(await response.arrayBuffer());
  rawResponse.end(payload);
}

export function createSharedChampionDevPlugin(): Plugin {
  return {
    name: "shared-champion-dev-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (
        request: IncomingMessage,
        response: ServerResponse,
        next: Connect.NextFunction,
      ) => {
        const pathname = request.url ? new URL(request.url, "http://127.0.0.1").pathname : "";

        if (pathname === "/api/session") {
          try {
            const webRequest = await toWebRequest(request);
            const webResponse = handleSessionRequest(webRequest);
            await writeWebResponse(webResponse, response);
          } catch (error) {
            console.error("[session] dev middleware failed", error);
            response.statusCode = 500;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.setHeader("cache-control", "no-store");
            response.end(JSON.stringify({ error: "Session dev middleware failed." }));
          }
          return;
        }

        if (pathname !== "/api/high-score") {
          next();
          return;
        }

        try {
          const webRequest = await toWebRequest(request);
          const webResponse = await handleSharedChampionRequest(webRequest, devStore);
          await writeWebResponse(webResponse, response);
        } catch (error) {
          console.error("[shared-champion] dev middleware failed", error);
          response.statusCode = 500;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("cache-control", "no-store");
          response.end(JSON.stringify({ error: "Shared champion dev middleware failed." }));
        }
      });
    },
  };
}
