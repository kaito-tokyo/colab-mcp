// SPDX-FileCopyrightText: 2026 Kaito Udagawa <umireon@kaito.tokyo>
//
// SPDX-License-Identifier: Apache-2.0

import { WebSocketRxFrame } from "./WebSocketRxFrame.mjs";
import { WebSocketTxFrame } from "./WebSocketTxFrame.mjs";

/**
 * @param {string} key
 * @returns {Promise<string>}
 */
export async function acceptKey(key) {
  const input = new TextEncoder().encode(
    key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-1", input);
  return Buffer.from(digest).toString("base64");
}

export class WebSocketConn extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  /** @param {import("node:net").Socket} socket */
  constructor(socket) {
    super();
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.fragmentOpcode = null;
    this.closed = false;
    this.closeEventDispatched = false;
    this.binaryType = "blob";
    this.url = "";
    this.protocol = "mcp";
    this.extensions = "";
    this.bufferedAmount = 0;
    this.socket.on("data", (data) => this._processIncomingData(data));
    this.socket.on("error", (error) => this._handleSocketError(error));
    this.socket.on("close", () => this._handleSocketClose());
  }

  /** @param {string} data @returns {void} */
  send(data) {
    if (typeof data !== "string")
      throw new TypeError("Only text data is supported");
    if (!this.closed) this.socket.write(WebSocketTxFrame.text(data).toBuffer());
  }

  /** @returns {number} */
  get readyState() {
    return this.closed ? WebSocketConn.CLOSED : WebSocketConn.OPEN;
  }

  /** @param {number} code @param {string} reason @returns {void} */
  close(code = 1000, reason = "") {
    if (this.closed) return;
    this.closed = true;
    this.socket.write(WebSocketTxFrame.close(code, reason).toBuffer());
    this.socket.end();
  }

  /** @param {Buffer} data @returns {void} */
  _processIncomingData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (this.buffer.length > 0) {
      let decoded;
      try {
        decoded = WebSocketRxFrame.decodeFromData(this.buffer);
      } catch (error) {
        this._protocolError(error.message);
        return;
      }
      if (decoded === null) return;
      this.buffer = this.buffer.subarray(decoded.bytesConsumed);
      this._processFrame(decoded.frame);
      if (this.closed) return;
    }
  }

  /** @param {WebSocketRxFrame} frame @returns {void} */
  _processFrame(frame) {
    if (frame.rsv1 || frame.rsv2 || frame.rsv3)
      return this._protocolError("reserved bits are not supported");
    if (frame.isControlFrame) {
      if (frame.opcode === 9)
        this.socket.write(WebSocketTxFrame.pong(frame.payload).toBuffer());
      else if (frame.opcode === 8) {
        this._dispatchCloseEvent();
        this.close();
      }
      return;
    }
    if (frame.opcode === 1 || frame.opcode === 2) {
      if (this.fragmentOpcode !== null)
        return this._protocolError("unexpected data frame");
      this.fragmentOpcode = frame.opcode;
      this.fragments = [frame.payload];
    } else if (frame.isContinuation) {
      if (this.fragmentOpcode === null)
        return this._protocolError("unexpected continuation");
      this.fragments.push(frame.payload);
    } else return this._protocolError("unknown opcode");
    if (frame.fin) this._completeMessage();
  }

  /** @returns {void} */
  _completeMessage() {
    const payload = Buffer.concat(this.fragments);
    const opcode = this.fragmentOpcode;
    this.fragments = [];
    this.fragmentOpcode = null;
    if (opcode === 1)
      this.dispatchEvent(
        new MessageEvent("message", { data: payload.toString("utf8") }),
      );
  }

  /** @param {string} reason @returns {void} */
  _protocolError(reason) {
    this.dispatchEvent(new CustomEvent("error", { detail: reason }));
    this.close(1002, reason);
  }

  /** @param {Error} error @returns {void} */
  _handleSocketError(error) {
    this.dispatchEvent(new CustomEvent("error", { detail: error }));
  }

  /** @returns {void} */
  _handleSocketClose() {
    this.closed = true;
    this._dispatchCloseEvent();
  }

  /** @returns {void} */
  _dispatchCloseEvent() {
    if (this.closeEventDispatched) return;
    this.closeEventDispatched = true;
    this.dispatchEvent(new Event("close"));
  }
}
