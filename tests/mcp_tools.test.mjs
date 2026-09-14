// SPDX-FileCopyrightText: 2026 Kaito Udagawa <umireon@kaito.tokyo>
//
// SPDX-License-Identifier: Apache-2.0

import test from "node:test";
import assert from "node:assert/strict";
import { Bridge } from "../src/bridge.mjs";

test("MCP tools/list returns the embedded Colab tool definitions", () => {
  const bridge = new Bridge({
    host: "127.0.0.1",
    port: 0,
    bearerToken: "test",
    mcpProxyToken: "test",
    origins: new Set(),
    allowNoOrigin: true,
  }, () => {});
  const responses = [];
  bridge.handleMcpMessage(
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    (response) => responses.push(response),
  );
  assert.equal(responses.length, 1);
  assert.deepEqual(responses[0].result.tools.map((tool) => tool.name), [
    "open_colab_browser_connection",
    "add_code_cell",
    "add_text_cell",
    "delete_cell",
    "get_cells",
    "move_cell",
    "run_code_cell",
    "update_cell",
  ]);
  return bridge.close();
});
