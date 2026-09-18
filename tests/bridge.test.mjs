// SPDX-FileCopyrightText: 2026 Kaito Udagawa <umireon@kaito.tokyo>
//
// SPDX-License-Identifier: Apache-2.0

import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { Bridge } from "../src/bridge.mjs";

test("Node test suite is configured under tests", () => {
  assert.ok(true);
});

test("bridge returns a JSON-RPC parse error for malformed notebook messages", () => {
  const bridge = new Bridge({
    host: "127.0.0.1",
    port: 0,
    bearerToken: "test-token",
    mcpProxyToken: "test-token",
    origins: new Set(),
    allowNoOrigin: true,
  }, () => {});
  const connection = {
    send: (data) => { connection.message = JSON.parse(data); },
  };

  bridge._handleNotebookMessage("{invalid", connection);

  assert.deepEqual(connection.message, {
    jsonrpc: "2.0",
    id: null,
    error: { code: -32700, message: "Parse error" },
  });
});

test("Colab disconnect rejects and removes forwarded requests", () => {
  const bridge = new Bridge({
    host: "127.0.0.1",
    port: 0,
    bearerToken: "test-token",
    mcpProxyToken: "test-token",
    origins: new Set(),
    allowNoOrigin: true,
  }, () => {});
  const connection = new EventTarget();
  connection.send = () => {};
  bridge.server.activeConnection = connection;
  bridge._handleConnection(connection);

  let rejected;
  bridge.handleMcpMessage(
    { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "get_cells", arguments: {} } },
    () => {},
    connection,
    (error) => { rejected = error; },
  );

  assert.equal(bridge.pendingRequests.size, 1);
  connection.dispatchEvent(new Event("close"));
  assert.equal(rejected.message, "Colab notebook connection closed");
  assert.equal(bridge.pendingRequests.size, 0);
});

test("silent Colab requests expire and are removed", async () => {
  const bridge = new Bridge({
    host: "127.0.0.1",
    port: 0,
    bearerToken: "test-token",
    mcpProxyToken: "test-token",
    requestTimeoutMs: 10,
    origins: new Set(),
    allowNoOrigin: true,
  }, () => {});
  const connection = new EventTarget();
  connection.send = () => {};
  bridge.server.activeConnection = connection;

  let rejected;
  bridge.handleMcpMessage(
    { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "get_cells", arguments: {} } },
    () => {},
    connection,
    (error) => { rejected = error; },
  );
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(rejected.message, "MCP request timed out");
  assert.equal(bridge.pendingRequests.size, 0);
});

test("built-in WebSocket completes the Colab connection sequence", async (t) => {
  const bridge = new Bridge({
    host: "127.0.0.1",
    port: 0,
    token: "test-token",
    origins: new Set(),
    allowNoOrigin: true,
  }, () => {});
  const port = await bridge.start();
  const token = "test-token";
  t.after(() => bridge.close());
  const ws = new WebSocket(
    `ws://127.0.0.1:${port}/?access_token=${encodeURIComponent(token)}`,
    "mcp",
  );
  t.after(() => ws.close());
  await Promise.race([
    once(ws, "open"),
    once(ws, "error").then(([error]) => {
      throw error;
    }),
  ]);
  assert.equal(ws.protocol, "mcp");

  const initialize = await once(ws, "message");
  const message = JSON.parse(initialize[0].data.toString());
  assert.deepEqual(message, {
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "colab-mcp-bridge-node", version: "0.1.0" },
    },
  });

  const health = await fetch(`http://127.0.0.1:${port}/health`).then(
    (response) => response.json(),
  );
  assert.deepEqual(health, { ok: true, connected: true, port: Number(port) });
  ws.close(1000, "test complete");
  await once(ws, "close");
});
