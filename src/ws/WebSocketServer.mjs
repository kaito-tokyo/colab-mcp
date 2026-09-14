// SPDX-FileCopyrightText: 2026 Kaito Udagawa <umireon@kaito.tokyo>
//
// SPDX-License-Identifier: Apache-2.0

import http from "node:http";
import { acceptKey, WebSocketConn } from "./WebSocketConn.mjs";
import { tokenMatches } from "../config.mjs";

export class WebSocketServer extends EventTarget {
  /** @param {{host: string, port: number, token: string, origins: Set<string>, allowNoOrigin: boolean}} config @param {(message: string) => void} log */
  constructor(config, log = console.error) {
    super();
    this.config = config;
    this.log = log;
    this.server = http.createServer((request, response) =>
      this._handleHttpRequest(request, response),
    );
    this.server.on("upgrade", (request, socket) =>
      this._handleUpgrade(request, socket),
    );
    this.activeConnection = null;
    this.port = null;
  }

  /** @returns {Promise<number>} */
  listen() {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.config.port, this.config.host, () => {
        this.server.off("error", reject);
        this.port = this.server.address().port;
        this.log(`listening on http://${this.config.host}:${this.port}`);
        this.log(`websocket: ws://${this.config.host}:${this.port}/`);
        this.log("WebSocket authentication token is available through the authenticated MCP endpoint");
        resolve(this.port);
      });
    });
  }

  /** @returns {Promise<void>} */
  close() {
    this.activeConnection?.close(1001, "server shutting down");
    return new Promise((resolve) => this.server.close(resolve));
  }

  /** @returns {boolean} */
  get connected() {
    return this.activeConnection !== null;
  }

  _handleHttpRequest(request, response) {
    if (new URL(request.url, "http://localhost").pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          ok: true,
          connected: this.connected,
          port: this.port,
        }),
      );
      return;
    }
    response.writeHead(404);
    response.end("not found\n");
  }

  async _handleUpgrade(request, socket) {
    const url = new URL(request.url, "http://localhost");
    const protocols = (request.headers["sec-websocket-protocol"] ?? "")
      .split(",")
      .map((value) => value.trim());
    const originAllowed =
      this.config.origins.has(request.headers.origin) ||
      (this.config.allowNoOrigin && !request.headers.origin);
    const authorization = request.headers.authorization?.trim().split(/\s+/);
    const suppliedToken =
      url.searchParams.get("access_token") ??
      url.searchParams.get("token") ??
      (authorization?.length === 2 &&
      authorization[0].toLowerCase() === "bearer"
        ? authorization[1]
        : null);
    if (url.pathname !== "/" && url.pathname !== "/ws")
      return this._reject(socket, 404, "Not Found");
    if (!originAllowed || !tokenMatches(this.config.mcpProxyToken ?? this.config.token, suppliedToken))
      return this._reject(socket, 403, "Forbidden");
    if (!protocols.includes("mcp"))
      return this._reject(socket, 400, "Bad Request");
    if (this.activeConnection)
      return this._reject(socket, 503, "Service Unavailable");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${await acceptKey(request.headers["sec-websocket-key"])}\r\nSec-WebSocket-Protocol: mcp\r\n\r\n`,
    );
    const connection = new WebSocketConn(socket);
    this.activeConnection = connection;
    connection.addEventListener("close", () => {
      if (this.activeConnection === connection) this.activeConnection = null;
      this.log("websocket disconnected");
    });
    this.dispatchEvent(new CustomEvent("connection", { detail: connection }));
    this.log("websocket connected");
  }

  _reject(socket, status, text) {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  }
}

export const createBridgeServer = (config, log) =>
  new WebSocketServer(config, log);
