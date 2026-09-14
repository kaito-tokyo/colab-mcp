// SPDX-FileCopyrightText: 2026 Kaito Udagawa <umireon@kaito.tokyo>
//
// SPDX-License-Identifier: Apache-2.0

export class WebSocketRxFrame {
  /**
   * @param {boolean} fin
   * @param {number} opcode
   * @param {boolean} masked
   * @param {boolean} rsv1
   * @param {boolean} rsv2
   * @param {boolean} rsv3
   * @param {Buffer} payload
   */
  constructor(fin, opcode, masked, rsv1, rsv2, rsv3, payload) {
    if (!masked) throw new Error("client frame must be masked");
    if (opcode >= 8 && (!fin || payload.length > 125))
      throw new Error("invalid control frame");
    this.fin = fin;
    this.opcode = opcode;
    this.masked = masked;
    this.rsv1 = rsv1;
    this.rsv2 = rsv2;
    this.rsv3 = rsv3;
    this.payload = payload;
  }

  /**
   * @param {number} first
   * @param {number} second
   * @returns {{fin: boolean, opcode: number, masked: boolean, length: number}}
   */
  static parseFrameFlags(first, second) {
    return {
      fin: Boolean(first & 0x80),
      rsv1: Boolean(first & 0x40),
      rsv2: Boolean(first & 0x20),
      rsv3: Boolean(first & 0x10),
      opcode: first & 0x0f,
      masked: Boolean(second & 0x80),
      length: second & 0x7f,
    };
  }

  /**
   * @param {Buffer} data
   * @param {number} initialLength
   * @returns {{length: number, headerLength: number} | null}
   */
  static readPayloadLength(data, initialLength) {
    if (initialLength < 126) return { length: initialLength, headerLength: 2 };
    if (initialLength === 126) {
      if (data.length < 4) return null;
      return { length: data.readUInt16BE(2), headerLength: 4 };
    }
    if (data.length < 10) return null;
    if (data.readUInt32BE(2)) throw new Error("payload too large");
    return { length: data.readUInt32BE(6), headerLength: 10 };
  }

  /**
   * @param {Buffer} payload
   * @param {Buffer} mask
   * @returns {Buffer}
   */
  static unmaskPayload(payload, mask) {
    const result = Buffer.from(payload);
    for (let i = 0; i < result.length; i++) result[i] ^= mask[i % 4];
    return result;
  }

  /**
   * @param {Buffer} data
   * @param {number} headerLength
   * @param {number} frameLength
   * @returns {Buffer}
   */
  static decodePayload(data, headerLength, frameLength) {
    const mask = data.subarray(headerLength, headerLength + 4);
    return this.unmaskPayload(
      data.subarray(headerLength + 4, frameLength),
      mask,
    );
  }

  /**
   * Decode one complete client-to-server frame from the beginning of a buffer.
   *
   * @param {Buffer} data
   * @returns {{frame: WebSocketRxFrame, bytesConsumed: number} | null}
   */
  static decodeFromData(data) {
    if (data.length < 2) return null;
    const flags = this.parseFrameFlags(data[0], data[1]);
    if (!flags.masked) throw new Error("client frame must be masked");
    const lengthInfo = this.readPayloadLength(data, flags.length);
    if (lengthInfo === null) return null;
    const { length, headerLength } = lengthInfo;
    if (length > 16 * 1024 * 1024) throw new Error("payload too large");
    const frameLength = headerLength + 4 + length;
    if (data.length < frameLength) return null;
    return {
      frame: new WebSocketRxFrame(
        flags.fin,
        flags.opcode,
        flags.masked,
        flags.rsv1,
        flags.rsv2,
        flags.rsv3,
        this.decodePayload(data, headerLength, frameLength),
      ),
      bytesConsumed: frameLength,
    };
  }

  /** @returns {boolean} */
  get isControlFrame() {
    return this.opcode >= 8;
  }

  /** @returns {boolean} */
  get isContinuation() {
    return this.opcode === 0;
  }

  /** @returns {boolean} */
  get isText() {
    return this.opcode === 1;
  }
}
