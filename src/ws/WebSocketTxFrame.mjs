// SPDX-FileCopyrightText: 2026 Kaito Udagawa <umireon@kaito.tokyo>
//
// SPDX-License-Identifier: Apache-2.0

export class WebSocketTxFrame {
  /**
   * Encode an unmasked server-to-client frame.
   *
   * @param {number} op
   * @param {Buffer} body
   * @returns {Buffer}
   */
  static encode(op, body = Buffer.alloc(0)) {
    if (op >= 8 && body.length > 125) throw Error("control payload too large");
    const first = Buffer.from([0x80 | op]);
    if (body.length <= 125)
      return Buffer.concat([first, Buffer.from([body.length]), body]);
    const length = Buffer.alloc(body.length <= 65535 ? 3 : 9);
    if (body.length <= 65535) {
      length[0] = 126;
      length.writeUInt16BE(body.length, 1);
    } else {
      length[0] = 127;
      length.writeUInt32BE(0, 1);
      length.writeUInt32BE(body.length, 5);
    }
    return Buffer.concat([first, length, body]);
  }

  /**
   * @param {number} opcode
   * @param {Buffer} payload
   */
  constructor(opcode, payload) {
    if (opcode >= 8 && payload.length > 125)
      throw new RangeError("control payload too large");
    this.fin = true;
    this.opcode = opcode;
    this.masked = false;
    this.rsv1 = false;
    this.rsv2 = false;
    this.rsv3 = false;
    this.payload = payload;
  }

  /** @returns {Buffer} */
  toBuffer() {
    return WebSocketTxFrame.encode(this.opcode, this.payload);
  }

  /**
   * @param {string} text
   * @returns {WebSocketTxFrame}
   */
  static text(text) {
    return new WebSocketTxFrame(1, Buffer.from(text));
  }

  /**
   * @param {number} code
   * @param {string} reason
   * @returns {WebSocketTxFrame}
   */
  static close(code, reason = "") {
    return new WebSocketTxFrame(
      8,
      Buffer.from([(code >> 8) & 255, code & 255, ...Buffer.from(reason)]),
    );
  }

  /**
   * @param {Buffer} payload
   * @returns {WebSocketTxFrame}
   */
  static pong(payload) {
    return new WebSocketTxFrame(10, payload);
  }
}
