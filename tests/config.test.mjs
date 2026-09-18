import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.mjs";

const baseEnv = { COLAB_MCP_BEARER_TOKEN: "test-token" };

test("loadConfig accepts a positive finite request timeout", () => {
  assert.equal(loadConfig(baseEnv, { requestTimeoutMs: 1234 }).requestTimeoutMs, 1234);
});

test("loadConfig rejects invalid request timeout values", () => {
  for (const requestTimeoutMs of ["", "not-a-number", "0", "-1", "Infinity"]) {
    assert.throws(
      () => loadConfig({ ...baseEnv, COLAB_MCP_REQUEST_TIMEOUT_MS: requestTimeoutMs }),
      /COLAB_MCP_REQUEST_TIMEOUT_MS must be between 1 and 2147483647/,
    );
  }

  assert.throws(
    () => loadConfig({ ...baseEnv, COLAB_MCP_REQUEST_TIMEOUT_MS: "2147483648" }),
    /COLAB_MCP_REQUEST_TIMEOUT_MS must be between 1 and 2147483647/,
  );
});
