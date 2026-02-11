import http from "node:http";

import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";

import { FpsRoom } from "./room/FpsRoom";

const port = Number(process.env.PORT ?? 2567);

const server = http.createServer();
const gameServer = new Server({
  transport: new WebSocketTransport({ server })
});

gameServer.define("fps", FpsRoom);

server.listen(port, () => {
  console.warn(`[server] listening on ws://localhost:${port}`);
});
