import test from "node:test";
import assert from "node:assert/strict";
import { Bridge } from "../src/bridge.mjs";

test("HTTP MCP endpoint requires bearer authentication", async (t) => {
  const bridge = new Bridge({ host: "127.0.0.1", port: 0, bearerToken: "http-test-token", mcpProxyToken: "http-test-token", origins: new Set(), allowNoOrigin: true }, () => {});
  await bridge.start();
  const port = await bridge.listenHttp("127.0.0.1", 0, "http-test-token");
  t.after(() => bridge.close());

  const unauthorized = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(unauthorized.status, 401);

  const authorized = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { Authorization: "Bearer http-test-token", "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  assert.equal(authorized.status, 200);
  const payload = await authorized.json();
  assert.equal(payload.result.tools.some((tool) => tool.name === "get_cells"), true);
});

test("HTTP MCP endpoint requires JSON POST content", async (t) => {
  const bridge = new Bridge({ host: "127.0.0.1", port: 0, token: "http-test-token", origins: new Set(), allowNoOrigin: true }, () => {});
  await bridge.start();
  const port = await bridge.listenHttp("127.0.0.1", 0, "http-test-token");
  t.after(() => bridge.close());
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { Authorization: "Bearer http-test-token" },
    body: "{}",
  });
  assert.equal(response.status, 415);
});

test("HTTP MCP endpoint rejects structurally invalid JSON-RPC", async (t) => {
  const bridge = new Bridge({ host: "127.0.0.1", port: 0, token: "http-test-token", origins: new Set(), allowNoOrigin: true }, () => {});
  await bridge.start();
  const port = await bridge.listenHttp("127.0.0.1", 0, "http-test-token");
  t.after(() => bridge.close());
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { Authorization: "Bearer http-test-token", "content-type": "application/json" },
    body: "null",
  });
  assert.equal(response.status, 400);
  assert.equal(await response.text(), "Invalid JSON-RPC");
});

test("HTTP MCP endpoint rejects object-valued JSON-RPC IDs", async (t) => {
  const bridge = new Bridge({ host: "127.0.0.1", port: 0, token: "http-test-token", origins: new Set(), allowNoOrigin: true }, () => {});
  await bridge.start();
  const port = await bridge.listenHttp("127.0.0.1", 0, "http-test-token");
  t.after(() => bridge.close());
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { Authorization: "Bearer http-test-token", "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: {}, method: "tools/call" }),
  });
  assert.equal(response.status, 400);
});

test("HTTP MCP endpoint rejects oversized payloads", async (t) => {
  const bridge = new Bridge({ host: "127.0.0.1", port: 0, token: "http-test-token", origins: new Set(), allowNoOrigin: true }, () => {});
  await bridge.start();
  const port = await bridge.listenHttp("127.0.0.1", 0, "http-test-token");
  t.after(() => bridge.close());
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { Authorization: "Bearer http-test-token", "content-type": "application/json" },
    body: "x".repeat(1024 * 1024 + 1),
  });
  assert.equal(response.status, 413);
});

test("HTTP MCP endpoint provides an authenticated SSE GET stream and checks Origin", async (t) => {
  const bridge = new Bridge({ host: "127.0.0.1", port: 0, token: "http-test-token", origins: new Set(["https://allowed.example"]), allowNoOrigin: true }, () => {});
  await bridge.start();
  const port = await bridge.listenHttp("127.0.0.1", 0, "http-test-token", new Set(["https://allowed.example"]));
  t.after(() => bridge.close());
  const forbidden = await fetch(`http://127.0.0.1:${port}/mcp`, { headers: { Authorization: "Bearer http-test-token", Origin: "https://evil.example" } });
  assert.equal(forbidden.status, 403);
  const stream = await fetch(`http://127.0.0.1:${port}/mcp`, { headers: { Authorization: "Bearer http-test-token", Accept: "text/event-stream" } });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const first = await reader.read();
  await reader.cancel();
  assert.match(Buffer.from(first.value).toString(), /: connected/);
});

test("HTTP MCP POST can return an SSE response", async (t) => {
  const bridge = new Bridge({ host: "127.0.0.1", port: 0, token: "http-test-token", origins: new Set(), allowNoOrigin: true }, () => {});
  await bridge.start();
  const port = await bridge.listenHttp("127.0.0.1", 0, "http-test-token");
  t.after(() => bridge.close());
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { Authorization: "Bearer http-test-token", Accept: "text/event-stream", "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "initialize", params: {} }),
  });
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  assert.match(await response.text(), /id: \d+\nevent: message/);
});

test("SSE clients receive bridge messages", () => {
  const bridge = new Bridge({ host: "127.0.0.1", port: 0, token: "http-test-token", origins: new Set(), allowNoOrigin: true }, () => {});
  let output = "";
  bridge.sseClients.add({ write: (value) => { output += value; } });
  bridge._broadcastSse({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
  assert.match(output, /id: \d+\nevent: message/);
  assert.match(output, /notifications\/tools\/list_changed/);
});

test("SSE reconnect replays events after Last-Event-ID", async (t) => {
  const bridge = new Bridge({ host: "127.0.0.1", port: 0, token: "http-test-token", origins: new Set(), allowNoOrigin: true }, () => {});
  await bridge.start();
  bridge._broadcastSse({ jsonrpc: "2.0", method: "one" });
  bridge._broadcastSse({ jsonrpc: "2.0", method: "two" });
  const port = await bridge.listenHttp("127.0.0.1", 0, "http-test-token");
  t.after(() => bridge.close());
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, { headers: { Authorization: "Bearer http-test-token", "Last-Event-ID": "1" } });
  const reader = response.body.getReader();
  const first = await reader.read();
  await reader.cancel();
  const text = Buffer.from(first.value).toString();
  assert.match(text, /data:.*two/);
  assert.doesNotMatch(text, /data:.*one/);
});

test("HTTP POST waits for a Colab WebSocket response", async (t) => {
  const bridge = new Bridge({ host: "127.0.0.1", port: 0, token: "http-test-token", origins: new Set(), allowNoOrigin: true }, () => {});
  await bridge.start();
  const port = await bridge.listenHttp("127.0.0.1", 0, "http-test-token");
  t.after(() => bridge.close());
  let forwarded;
  let forwardedReady;
  const forwardedPromise = new Promise((resolve) => { forwardedReady = resolve; });
  const connection = new EventTarget();
  connection.send = (value) => { forwarded = JSON.parse(value); forwardedReady(); };
  connection.close = () => {};
  bridge.server.activeConnection = connection;

  const pending = fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { Authorization: "Bearer http-test-token", "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "get_cells", arguments: {} } }),
  });
  await forwardedPromise;
  assert.equal(forwarded.id, 9);
  bridge._handleNotebookMessage(JSON.stringify({ jsonrpc: "2.0", id: 9, result: { content: [] } }));
  const response = await pending;
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).result.content, []);
});
