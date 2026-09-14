// SPDX-FileCopyrightText: 2026 Kaito Udagawa <umireon@kaito.tokyo>
//
// SPDX-License-Identifier: Apache-2.0

import { timingSafeEqual } from "node:crypto";

function randomToken() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export function loadConfig(env = process.env, overrides = {}) {
  return {
    host: overrides.host ?? env.COLAB_BRIDGE_LISTEN ?? "127.0.0.1",
    port: Number(overrides.port ?? env.COLAB_BRIDGE_PORT ?? 0),
    httpPort: Number(overrides.httpPort ?? env.COLAB_BRIDGE_HTTP_PORT ?? 62161),
    token: overrides.token ?? env.COLAB_MCP_TOKEN ?? randomToken(),
    origins: new Set([
      "https://colab.google.com",
      "https://colab.research.google.com",
      ...(env.COLAB_BRIDGE_EXTRA_ORIGIN ? [env.COLAB_BRIDGE_EXTRA_ORIGIN] : []),
    ]),
    allowNoOrigin: env.COLAB_BRIDGE_ALLOW_NO_ORIGIN === "1",
  };
}
export function tokenMatches(expected, supplied) {
  if (typeof supplied !== "string" || supplied.length !== expected.length)
    return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return timingSafeEqual(expectedBytes, suppliedBytes);
}
