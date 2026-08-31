/**
 * Clean-room TypeScript implementation of the byte-reading conventions used by
 * OpenOrCadParser at commit be0a83ac119390044952cf9bed1e0fb86c448f44.
 * Format authority: src/DataStream.hpp and src/DataStream.cpp.
 *
 * Copyright (c) 2021 Dominik Wernberger
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const MAX_ZERO_TERMINATED_STRING_BYTES = 3_499

export class PreviewBinaryReadError extends Error {
  readonly streamPath: string
  readonly offset: number

  constructor(input: {
    readonly message: string
    readonly streamPath: string
    readonly offset: number
  }) {
    super(
      `${input.streamPath} at byte ${formatOffset(input.offset)}: ${input.message}`,
    )
    this.name = "PreviewBinaryReadError"
    this.streamPath = input.streamPath
    this.offset = input.offset
  }
}

/** A bounded little-endian cursor over one extracted CFB stream. */
export class PreviewBinaryReader {
  readonly streamPath: string
  readonly byteLength: number
  #bytes: Uint8Array
  #view: DataView
  #offset = 0

  constructor(input: {
    readonly bytes: Uint8Array
    readonly streamPath: string
    readonly offset?: number | undefined
  }) {
    if (!(input.bytes instanceof Uint8Array)) {
      throw new TypeError("Preview stream bytes must be a Uint8Array")
    }
    this.streamPath = input.streamPath
    // Parsing is synchronous and this cursor never exposes the supplied view.
    // Borrowing it avoids another whole-stream allocation for every bounded
    // framing attempt.
    this.#bytes = input.bytes
    this.#view = new DataView(
      this.#bytes.buffer,
      this.#bytes.byteOffset,
      this.#bytes.byteLength,
    )
    this.byteLength = this.#bytes.byteLength
    this.setOffset(input.offset ?? 0)
  }

  get offset(): number {
    return this.#offset
  }

  get remaining(): number {
    return this.byteLength - this.#offset
  }

  setOffset(offset: number): void {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > this.byteLength
    ) {
      throw this.error(
        `offset must be an integer from 0 through ${this.byteLength}: ${offset}`,
        this.#offset,
      )
    }
    this.#offset = offset
  }

  hasBytes(length: number, offset = this.#offset): boolean {
    return (
      Number.isSafeInteger(length) &&
      length >= 0 &&
      Number.isSafeInteger(offset) &&
      offset >= 0 &&
      offset <= this.byteLength &&
      length <= this.byteLength - offset
    )
  }

  matches(bytes: readonly number[], offset = this.#offset): boolean {
    if (!this.hasBytes(bytes.length, offset)) return false
    for (let index = 0; index < bytes.length; index += 1) {
      if (this.#bytes[offset + index] !== bytes[index]) return false
    }
    return true
  }

  uint8At(offset: number): number {
    this.#require(1, offset)
    const value = this.#bytes[offset]
    if (value === undefined) throw this.error("byte is unavailable", offset)
    return value
  }

  int16At(offset: number): number {
    this.#require(2, offset)
    return this.#view.getInt16(offset, true)
  }

  uint16At(offset: number): number {
    this.#require(2, offset)
    return this.#view.getUint16(offset, true)
  }

  int32At(offset: number): number {
    this.#require(4, offset)
    return this.#view.getInt32(offset, true)
  }

  uint32At(offset: number): number {
    this.#require(4, offset)
    return this.#view.getUint32(offset, true)
  }

  readUint8(): number {
    const value = this.uint8At(this.#offset)
    this.#offset += 1
    return value
  }

  readInt16(): number {
    const value = this.int16At(this.#offset)
    this.#offset += 2
    return value
  }

  readUint16(): number {
    const value = this.uint16At(this.#offset)
    this.#offset += 2
    return value
  }

  readInt32(): number {
    const value = this.int32At(this.#offset)
    this.#offset += 4
    return value
  }

  readUint32(): number {
    const value = this.uint32At(this.#offset)
    this.#offset += 4
    return value
  }

  readBytes(length: number): readonly number[] {
    this.#require(length, this.#offset)
    const start = this.#offset
    this.#offset += length
    return Object.freeze(Array.from(this.#bytes.subarray(start, this.#offset)))
  }

  skip(length: number): void {
    this.#require(length, this.#offset)
    this.#offset += length
  }

  readFixedNullTerminatedString(byteLength: number): string {
    this.#require(byteLength, this.#offset)
    const start = this.#offset
    const stop = start + byteLength
    let terminator = start
    while (terminator < stop && this.#bytes[terminator] !== 0) terminator += 1
    if (terminator === stop) {
      throw this.error(
        `fixed ${byteLength}-byte string has no null terminator`,
        start,
      )
    }
    const value = decodeOpaqueByteString(
      this.#bytes.subarray(start, terminator),
    )
    this.#offset = stop
    return value
  }

  readLengthPrefixedNullTerminatedString(): string {
    const span = this.#readLengthPrefixedNullTerminatedStringSpan()
    return decodeOpaqueByteString(
      this.#bytes.subarray(span.startOffset, span.terminatorOffset),
    )
  }

  /** Validate and advance past a string without allocating its decoded value. */
  skipLengthPrefixedNullTerminatedString(): number {
    return this.#readLengthPrefixedNullTerminatedStringSpan().byteLength
  }

  #readLengthPrefixedNullTerminatedStringSpan(): {
    readonly byteLength: number
    readonly startOffset: number
    readonly terminatorOffset: number
  } {
    const lengthOffset = this.#offset
    const byteLength = this.readUint16()
    if (byteLength > MAX_ZERO_TERMINATED_STRING_BYTES) {
      throw this.error(
        `length-prefixed string declares ${byteLength} bytes, above the ${MAX_ZERO_TERMINATED_STRING_BYTES}-byte source limit`,
        lengthOffset,
      )
    }
    this.#require(byteLength + 1, this.#offset)
    const start = this.#offset
    const terminatorOffset = start + byteLength
    for (let offset = start; offset < terminatorOffset; offset += 1) {
      if (this.#bytes[offset] === 0) {
        throw this.error(
          "length-prefixed string contains an early null byte",
          offset,
        )
      }
    }
    if (this.#bytes[terminatorOffset] !== 0) {
      throw this.error(
        `length-prefixed string declared at ${formatOffset(lengthOffset)} is not null terminated`,
        terminatorOffset,
      )
    }
    this.#offset = terminatorOffset + 1
    return { byteLength, startOffset: start, terminatorOffset }
  }

  error(message: string, offset = this.#offset): PreviewBinaryReadError {
    return new PreviewBinaryReadError({
      message,
      streamPath: this.streamPath,
      offset,
    })
  }

  #require(length: number, offset: number): void {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw this.error(`byte length must be a non-negative integer: ${length}`)
    }
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw this.error(`byte offset must be a non-negative integer: ${offset}`)
    }
    if (!this.hasBytes(length, offset)) {
      throw this.error(
        `need ${length} byte${length === 1 ? "" : "s"}, but only ${Math.max(0, this.byteLength - offset)} remain`,
        offset,
      )
    }
  }
}

/**
 * Maps each source byte to the same-valued Unicode code point. The MIT format
 * authority exposes these fields only as raw one-byte strings and does not
 * establish a character encoding, so this deliberately makes no code-page
 * claim and remains reversible for every byte value.
 */
function decodeOpaqueByteString(bytes: Uint8Array): string {
  let value = ""
  for (const byte of bytes) value += String.fromCharCode(byte)
  return value
}

function formatOffset(offset: number): string {
  return `0x${offset.toString(16).padStart(8, "0")}`
}
