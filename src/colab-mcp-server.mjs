// SPDX-FileCopyrightText: 2026 Kaito Udagawa <umireon@kaito.tokyo>
//
// SPDX-License-Identifier: Apache-2.0

import { loadConfig } from "./config.mjs";
import { Bridge } from "./bridge.mjs";

export async function runServer(overrides = {}) {
  const bridge = new Bridge(loadConfig(process.env, overrides));
  await bridge.start();
  const httpPort = await bridge.listenHttp(bridge.server.config.host, bridge.server.config.httpPort, bridge.server.config.bearerToken, bridge.server.config.origins);
  console.error(`MCP HTTP endpoint: http://${bridge.server.config.host}:${httpPort}/mcp`);

  const shutdown = async () => {
    await bridge.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
