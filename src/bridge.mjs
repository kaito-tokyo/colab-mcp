// SPDX-FileCopyrightText: 2026 Kaito Udagawa <umireon@kaito.tokyo>
//
// SPDX-License-Identifier: Apache-2.0

import { WebSocketServer } from "./ws/WebSocketServer.mjs";
import { COLAB_TOOLS } from "./colabTools.mjs";
import http from "node:http";
import { tokenMatches } from "./config.mjs";

const OPEN_COLAB_TOOL = "open_colab_browser_connection";
const COLAB_CONNECTION_URL = "https://colab.research.google.com/notebooks/empty.ipynb";

export class Bridge {
  /**
   * @param {{host: string, port: number, token: string, origins: Set<string>, allowNoOrigin: boolean}} config
   * @param {(message: string) => void} log
   */
  constructor(config, log = console.error) {
    this.log = log;
    this.server = new WebSocketServer(config, log);
    this.server.addEventListener("connection", (event) =>
      this._handleConnection(event.detail),
    );
    this.pendingRequests = new Map();
    this.httpServer = null;
    this.sseClients = new Set();
    this.sseHeartbeats = new Map();
    this.nextSseEventId = 1;
    this.sseHistory = [];
  }

  /** @returns {Promise<number>} */
  start() {
    return this.server.listen();
  }

  /** @returns {Promise<void>} */
  close() {
    for (const response of this.sseClients) {
      globalThis.clearInterval(this.sseHeartbeats.get(response));
      response.end();
    }
    this.sseClients.clear();
    this.sseHeartbeats.clear();
    return Promise.all([
      this.server.close(),
      this.httpServer
        ? new Promise((resolve) => this.httpServer.close(resolve))
        : Promise.resolve(),
    ]).then(() => undefined);
  }

  /** @param {string} host @param {number} port @param {string} token @param {Set<string>} origins @returns {Promise<number>} */
  listenHttp(host, port, token, origins = new Set()) {
    this.httpServer = http.createServer(async (request, response) => {
      if (request.url !== "/mcp") {
        response.writeHead(404).end();
        return;
      }
      const origin = request.headers.origin;
      if (origin && !origins.has(origin)) {
        response.writeHead(403).end("Forbidden origin");
        return;
      }
      const authorization = request.headers.authorization ?? "";
      const suppliedToken = authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length).trim()
        : null;
      if (!tokenMatches(token, suppliedToken)) {
        response.writeHead(401).end("Unauthorized");
        return;
      }
      if (request.method === "GET") {
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          connection: "keep-alive",
        });
        response.write(": connected\n\n");
        this.sseClients.add(response);
        const lastEventId = Number(request.headers["last-event-id"] ?? 0);
        if (Number.isSafeInteger(lastEventId) && lastEventId > 0) {
          for (const event of this.sseHistory) {
            if (event.id > lastEventId) response.write(event.payload);
          }
        }
        const heartbeat = globalThis.setInterval(() => {
          if (!response.writableEnded) response.write(": heartbeat\n\n");
        }, 15_000);
        this.sseHeartbeats.set(response, heartbeat);
        request.on("close", () => {
          globalThis.clearInterval(heartbeat);
          this.sseClients.delete(response);
          this.sseHeartbeats.delete(response);
          response.end();
        });
        return;
      }
      if (request.method !== "POST") {
        response.writeHead(405, { allow: "GET, POST" }).end();
        return;
      }
      const contentType = request.headers["content-type"] ?? "";
      if (!contentType.toLowerCase().startsWith("application/json")) {
        response.writeHead(415).end("Content-Type must be application/json");
        return;
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 1024 * 1024) {
          response.writeHead(413).end("Payload too large");
          request.destroy();
          return;
        }
        chunks.push(chunk);
      }
      try {
        const message = JSON.parse(Buffer.concat(chunks));
        const result = await new Promise((resolve, reject) => {
          const send = (value) => {
            globalThis.clearTimeout(timer);
            resolve(value);
          };
          const timer = globalThis.setTimeout(() => {
            this._removePending(message.id, send);
            reject(new Error("MCP request timed out"));
          }, 60_000);
          this.handleMcpMessage(message, send);
          if (message.id === undefined) {
            globalThis.clearTimeout(timer);
            resolve(undefined);
          }
        });
      if (result === undefined) {
        response.writeHead(202).end();
        return;
      }
        if ((request.headers.accept ?? "").includes("text/event-stream")) {
          response.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-store",
          });
          response.end(`id: ${this.nextSseEventId++}\nevent: message\ndata: ${JSON.stringify(result)}\n\n`);
        } else {
          response.writeHead(200, {
            "content-type": "application/json",
            "cache-control": "no-store",
            "mcp-protocol-version": "2025-06-18",
          });
          response.end(JSON.stringify(result));
        }
      } catch {
        response.writeHead(400).end("Invalid JSON-RPC");
      }
    });
    return new Promise((resolve, reject) => {
      this.httpServer.once("error", reject);
      this.httpServer.listen(port, host, () => {
        this.httpServer.off("error", reject);
        resolve(this.httpServer.address().port);
      });
    });
  }

  /** @param {import("./ws/WebSocketConn.mjs").WebSocketConn} connection */
  _handleConnection(connection) {
    connection.addEventListener("message", (event) =>
      this._handleNotebookMessage(event.data, connection),
    );
    this._sendInitialize(connection);
  }

  /**
   * @param {string} data
   * @param {import("./ws/WebSocketConn.mjs").WebSocketConn} connection
   * @returns {void}
   */
  _handleNotebookMessage(data, connection = this.server.activeConnection) {
    this.log(`received notebook JSON-RPC: ${data.slice(0, 4096)}`);
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      this.log("received invalid JSON-RPC message");
      if (connection) {
        this._sendMessage(connection, {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        });
      }
      return;
    }
    this._broadcastSse(message);
    if (message.id === undefined) return;
    if (message.id === 0 && message.result?.protocolVersion) {
      const connection = this.server.activeConnection;
      if (connection)
        this._sendMessage(connection, {
          jsonrpc: "2.0",
          method: "notifications/initialized",
        });
      return;
    }
    const pendingQueue = this.pendingRequests.get(message.id);
    if (!pendingQueue?.length) return;
    const pending = pendingQueue.shift();
    if (!pendingQueue.length) this.pendingRequests.delete(message.id);
    pending.send(message);
  }

  /** @param {object} message @returns {void} */
  _broadcastSse(message) {
    const id = this.nextSseEventId++;
    const payload = `id: ${id}\nevent: message\ndata: ${JSON.stringify(message)}\n\n`;
    this.sseHistory.push({ id, payload });
    if (this.sseHistory.length > 100) this.sseHistory.shift();
    for (const response of this.sseClients) response.write(payload);
  }

  _removePending(id, send) {
    const queue = this.pendingRequests.get(id);
    if (!queue) return;
    const remaining = queue.filter((pending) => pending.send !== send);
    if (remaining.length) this.pendingRequests.set(id, remaining);
    else this.pendingRequests.delete(id);
  }

  /** @param {import("./ws/WebSocketConn.mjs").WebSocketConn} connection */
  _sendInitialize(connection) {
    this._sendMessage(connection, {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "colab-mcp-bridge-node", version: "0.1.0" },
      },
    });
  }

  /** @param {import("./ws/WebSocketConn.mjs").WebSocketConn} connection @param {object} message */
  _sendMessage(connection, message) {
    connection.send(JSON.stringify(message));
  }

  /**
   * @param {object} message
   * @param {(message: object) => void} send
   * @returns {void}
   */
  handleMcpMessage(message, send) {
    if (message.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: "colab-mcp-bridge-node", version: "0.1.0" },
        },
      });
      return;
    }
    if (message.method === "notifications/initialized") return;
    if (message.method === "tools/list") {
      send({ jsonrpc: "2.0", id: message.id, result: { tools: COLAB_TOOLS } });
      return;
    }
    if (message.method !== "tools/call") {
      send({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: "Method not found" },
      });
      return;
    }
    if (message.params?.name === OPEN_COLAB_TOOL) {
      const connected = this.server.connected;
      const url = `${COLAB_CONNECTION_URL}#mcpProxyToken=${encodeURIComponent(this.server.config.token)}&mcpProxyPort=${this.server.port}`;
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          content: [{ type: "text", text: url }],
          structuredContent: { url, connected },
        },
      });
      return;
    }
    const connection = this.server.activeConnection;
    if (!connection) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32000, message: "Colab notebook is not connected" },
      });
      return;
    }
    const pendingQueue = this.pendingRequests.get(message.id) ?? [];
    pendingQueue.push({ send });
    this.pendingRequests.set(message.id, pendingQueue);
    this._sendMessage(connection, message);
  }
}
