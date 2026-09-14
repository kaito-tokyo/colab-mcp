// SPDX-FileCopyrightText: 2026 Kaito Udagawa <umireon@kaito.tokyo>
//
// SPDX-License-Identifier: Apache-2.0

import test from "node:test";
import assert from "node:assert/strict";
import { WebSocketRxFrame } from "../src/ws/WebSocketRxFrame.mjs";
import { WebSocketTxFrame } from "../src/ws/WebSocketTxFrame.mjs";

test("WebSocketTxFrame creates an unmasked text frame", () => {
  const tx = WebSocketTxFrame.text("hello");
  const bytes = tx.toBuffer();

  assert.equal(tx.masked, false);
  assert.equal(bytes[0], 0x81);
  assert.equal(bytes[1], 5);
  assert.equal(bytes.subarray(2).toString(), "hello");
});

test("WebSocketRxFrame exposes received frame semantics", () => {
  const rx = new WebSocketRxFrame(
    true,
    1,
    true,
    false,
    false,
    false,
    Buffer.from("hello"),
  );

  assert.equal(rx.isText, true);
  assert.equal(rx.isControlFrame, false);
  assert.equal(rx.isContinuation, false);
  assert.equal(rx.payload.toString(), "hello");
});

test("frame models enforce RFC 6455 direction invariants", () => {
  assert.throws(
    () =>
      new WebSocketRxFrame(
        true,
        1,
        false,
        false,
        false,
        false,
        Buffer.alloc(0),
      ),
    /must be masked/,
  );
  assert.throws(
    () => WebSocketTxFrame.close(1000, "x".repeat(124)),
    /control payload too large/,
  );
});

test("WebSocketRxFrame decodes one complete frame", () => {
  const encoded = Buffer.from([
    0x81,
    0x85,
    1,
    2,
    3,
    4,
    104 ^ 1,
    101 ^ 2,
    108 ^ 3,
    108 ^ 4,
    111 ^ 1,
  ]);
  const decoded = WebSocketRxFrame.decodeFromData(encoded);

  assert.equal(decoded.bytesConsumed, encoded.length);
  assert.equal(decoded.frame.isText, true);
  assert.equal(decoded.frame.payload.toString(), "hello");
});

test("WebSocketRxFrame returns null for incomplete input", () => {
  assert.equal(WebSocketRxFrame.decodeFromData(Buffer.alloc(0)), null);
  assert.equal(WebSocketRxFrame.decodeFromData(Buffer.from([0x81])), null);
  assert.equal(
    WebSocketRxFrame.decodeFromData(Buffer.from([0x81, 0x85])),
    null,
  );
});

test("WebSocketRxFrame decodes extended payload lengths", () => {
  const payload = Buffer.alloc(126, 0x61);
  const mask = Buffer.from([1, 2, 3, 4]);
  const encoded = Buffer.concat([
    Buffer.from([0x81, 0xfe, 0, 126]),
    mask,
    Buffer.from(payload.map((value, index) => value ^ mask[index % 4])),
  ]);
  const decoded = WebSocketRxFrame.decodeFromData(encoded);

  assert.equal(decoded.bytesConsumed, encoded.length);
  assert.equal(decoded.frame.payload.equals(payload), true);
});

test("WebSocketRxFrame rejects unmasked and fragmented control frames", () => {
  assert.throws(
    () => WebSocketRxFrame.decodeFromData(Buffer.from([0x81, 0x00])),
    /must be masked/,
  );

  const maskedPing = Buffer.from([0x09, 0x80, 1, 2, 3, 4]);
  assert.throws(
    () => WebSocketRxFrame.decodeFromData(maskedPing),
    /invalid control frame/,
  );
});

test("WebSocketTxFrame creates close and pong frames", () => {
  const close = WebSocketTxFrame.close(1000, "bye").toBuffer();
  const pong = WebSocketTxFrame.pong(Buffer.from("ping")).toBuffer();

  assert.deepEqual([...close], [0x88, 5, 3, 232, 98, 121, 101]);
  assert.deepEqual([...pong], [0x8a, 4, 112, 105, 110, 103]);
});

test("WebSocketTxFrame encodes an extended payload", () => {
  const payload = Buffer.alloc(126, 0x61);
  const bytes = new WebSocketTxFrame(2, payload).toBuffer();

  assert.equal(bytes[0], 0x82);
  assert.equal(bytes[1], 126);
  assert.equal(bytes.readUInt16BE(2), 126);
  assert.equal(bytes.subarray(4).equals(payload), true);
});
