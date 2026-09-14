// SPDX-FileCopyrightText: 2026 Kaito Udagawa <umireon@kaito.tokyo>
//
// SPDX-License-Identifier: Apache-2.0

import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocketServer } from "../src/ws/WebSocketServer.mjs";
import { WebSocketConn } from "../src/ws/WebSocketConn.mjs";

function createConfig() {
  return {
    host: "127.0.0.1",
    port: 0,
    bearerToken: "test-token",
    mcpProxyToken: "test-token",
    origins: new Set(),
    allowNoOrigin: true,
  };
}

test("WebSocketServer passes an upgraded socket to WebSocketConn", async (t) => {
  const server = new WebSocketServer(createConfig(), () => {});
  t.after(() => server.close());
  const connectionReady = once(server, "connection");
  const port = await server.listen();
  const client = new WebSocket(
    `ws://127.0.0.1:${port}/?access_token=test-token`,
    "mcp",
  );
  t.after(() => client.close());

  const [event] = await connectionReady;
  const connection = event.detail;
  assert.equal(connection instanceof WebSocketConn, true);
  assert.equal(connection.readyState, WebSocketConn.OPEN);
  assert.equal(connection.protocol, "mcp");
  assert.equal(server.connected, true);

  await once(client, "open");
  const messageReady = once(connection, "message");
  client.send("hello");
  const [message] = await messageReady;
  assert.equal(message.data, "hello");

  connection.send("reply");
  const [reply] = await once(client, "message");
  assert.equal(reply.data.toString(), "reply");

  const closed = once(connection, "close");
  client.close();
  await closed;
  assert.equal(server.connected, false);
});

test("WebSocketServer rejects an invalid access token", async (t) => {
  const server = new WebSocketServer(createConfig(), () => {});
  t.after(() => server.close());
  const port = await server.listen();
  const client = new WebSocket(
    `ws://127.0.0.1:${port}/?access_token=wrong-token`,
    "mcp",
  );
  t.after(() => client.close());

  const [error] = await once(client, "error");
  assert.ok(error);
  assert.equal(server.connected, false);
});
