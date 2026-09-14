#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 Kaito Udagawa <umireon@kaito.tokyo>
//
// SPDX-License-Identifier: Apache-2.0

import { runServer } from "../src/colab-mcp-server.mjs";

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
const token = option("--token");
const httpPort = option("--http-port");
if (args.includes("--help")) {
  console.log("Usage: colab-mcp-server [--token TOKEN] [--http-port PORT]");
  process.exit(0);
}
await runServer({
  ...(token ? { token } : {}),
  ...(httpPort ? { httpPort: Number(httpPort) } : {}),
});
