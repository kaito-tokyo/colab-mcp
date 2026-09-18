// SPDX-FileCopyrightText: 2026 Kaito Udagawa <umireon@kaito.tokyo>
//
// SPDX-License-Identifier: Apache-2.0

import { timingSafeEqual } from "node:crypto";

const MAX_TIMER_DELAY_MS = 2_147_483_647;

function randomToken() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

function parseRequestTimeoutMs(value) {
  const requestTimeoutMs = Number(value);
  if (
    !Number.isFinite(requestTimeoutMs) ||
    requestTimeoutMs <= 0 ||
    requestTimeoutMs > MAX_TIMER_DELAY_MS
  ) {
    throw new Error(
      "COLAB_MCP_REQUEST_TIMEOUT_MS must be between 1 and 2147483647",
    );
  }
  return requestTimeoutMs;
}

export function loadConfig(env = process.env, overrides = {}) {
  const bearerToken = overrides.bearerToken ?? env.COLAB_MCP_BEARER_TOKEN;
  if (!bearerToken) {
    throw new Error(
      "COLAB_MCP_BEARER_TOKEN is not set. Configure it first with PowerShell:\n" +
        "$bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); " +
        "$env:COLAB_MCP_BEARER_TOKEN = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_'); " +
        "[Environment]::SetEnvironmentVariable('COLAB_MCP_BEARER_TOKEN', $env:COLAB_MCP_BEARER_TOKEN, 'User')",
    );
  }
  return {
    host: overrides.host ?? env.COLAB_BRIDGE_LISTEN ?? "127.0.0.1",
    port: Number(overrides.port ?? env.COLAB_BRIDGE_PORT ?? 0),
    httpPort: Number(overrides.httpPort ?? env.COLAB_BRIDGE_HTTP_PORT ?? 62161),
    requestTimeoutMs: parseRequestTimeoutMs(
      overrides.requestTimeoutMs ?? env.COLAB_MCP_REQUEST_TIMEOUT_MS ?? 10 * 60 * 1000,
    ),
    bearerToken,
    mcpProxyToken: overrides.mcpProxyToken ?? randomToken(),
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
