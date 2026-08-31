/**
 * Clean-room TypeScript implementation of the OpenOrCadParser Library stream
 * layout at commit be0a83ac119390044952cf9bed1e0fb86c448f44.
 * Format authority: src/Streams/StreamLibrary.cpp,
 * src/Streams/StreamLibrary.hpp, src/PageSettings.cpp, and
 * src/Win32/LOGFONTA.hpp.
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

import {
  PreviewBinaryReadError,
  PreviewBinaryReader,
} from "./preview-binary-reader"
import { readPreviewPageSettings } from "./preview-record-reader"
import type { OrcadSchematicPreviewLibraryInfo } from "./preview-types"

const INTRODUCTION_BYTE_LENGTH = 32
const LOGFONTA_BYTE_LENGTH = 60
const LOGFONTA_QUALITY_OFFSET = 26
const EXPECTED_MISCELLANEOUS_WORD_COUNT = 24
const PART_FIELD_COUNT = 8

export const MAX_PREVIEW_LIBRARY_STRINGS = 262_144
export const MAX_PREVIEW_LIBRARY_ALIASES = 16_384
export const MAX_PREVIEW_LIBRARY_STRING_BYTES = 8 * 1024 * 1024

export interface ParsedPreviewLibrary {
  readonly info: OrcadSchematicPreviewLibraryInfo
  readonly strings: readonly string[]
  readonly databaseKind: "design" | "library"
}

export function parsePreviewLibrary(input: {
  readonly bytes: Uint8Array
  readonly streamPath: string
}): ParsedPreviewLibrary {
  const reader = new PreviewBinaryReader(input)
  const introduction = reader.readFixedNullTerminatedString(
    INTRODUCTION_BYTE_LENGTH,
  )
  let decodedStringBytes = introduction.length
  const databaseKind = classifyIntroduction(reader, introduction)
  const versionMajor = reader.readUint16()
  const versionMinor = reader.readUint16()
  reader.skip(8)
  const requiredZero = reader.readUint32()
  if (requiredZero !== 0) {
    throw reader.error("Library reserved word after timestamps is not zero", 44)
  }

  const fontCountOffset = reader.offset
  const textFontLength = reader.readUint16()
  if (textFontLength === 0) {
    throw reader.error(
      "Library text-font count cannot be zero",
      fontCountOffset,
    )
  }
  for (let index = 0; index < textFontLength - 1; index += 1) {
    const fontOffset = reader.offset
    reader.skip(LOGFONTA_QUALITY_OFFSET)
    const quality = reader.readUint8()
    if (quality > 6) {
      throw reader.error(
        `Library LOGFONTA quality ${quality} is outside the source-supported range 0 through 6`,
        fontOffset + LOGFONTA_QUALITY_OFFSET,
      )
    }
    reader.setOffset(fontOffset + LOGFONTA_BYTE_LENGTH)
  }

  const miscellaneousCountOffset = reader.offset
  const miscellaneousWordCount = reader.readUint16()
  if (miscellaneousWordCount !== EXPECTED_MISCELLANEOUS_WORD_COUNT) {
    throw reader.error(
      `Library miscellaneous-word count is ${miscellaneousWordCount}, expected ${EXPECTED_MISCELLANEOUS_WORD_COUNT}`,
      miscellaneousCountOffset,
    )
  }
  reader.skip(miscellaneousWordCount * 2)
  reader.skip(8)

  for (let index = 0; index < PART_FIELD_COUNT; index += 1) {
    const stringOffset = reader.offset
    decodedStringBytes = addDecodedStringBytes({
      reader,
      current: decodedStringBytes,
      additional: reader.skipLengthPrefixedNullTerminatedString(),
      label: `Library part-field ${index + 1}`,
      offset: stringOffset,
    })
  }
  readPreviewPageSettings(reader)

  const stringTableOffset = reader.offset
  const attempts: PreviewBinaryReadError[] = []
  for (const countByteLength of [2, 4] as const) {
    try {
      const strings = parseStringTableAndTail({
        bytes: input.bytes,
        streamPath: input.streamPath,
        offset: stringTableOffset,
        countByteLength,
        databaseKind,
        initialDecodedStringBytes: decodedStringBytes,
      })
      return Object.freeze({
        info: Object.freeze({
          streamPath: input.streamPath,
          introduction,
          versionMajor,
          versionMinor,
          stringCount: strings.length,
        }),
        strings,
        databaseKind,
      })
    } catch (error) {
      if (error instanceof PreviewBinaryReadError) {
        attempts.push(error)
        continue
      }
      throw error
    }
  }

  const details = attempts.map((error) => error.message).join("; ")
  throw reader.error(
    `Library string table matches neither source-supported count width${details ? ` (${details})` : ""}`,
    stringTableOffset,
  )
}

function parseStringTableAndTail(input: {
  readonly bytes: Uint8Array
  readonly streamPath: string
  readonly offset: number
  readonly countByteLength: 2 | 4
  readonly databaseKind: "design" | "library"
  readonly initialDecodedStringBytes: number
}): readonly string[] {
  const reader = new PreviewBinaryReader(input)
  const countOffset = reader.offset
  const stringCount =
    input.countByteLength === 2 ? reader.readUint16() : reader.readUint32()
  if (stringCount > MAX_PREVIEW_LIBRARY_STRINGS) {
    throw reader.error(
      `Library string count ${stringCount} exceeds the ${MAX_PREVIEW_LIBRARY_STRINGS}-entry Preview ceiling`,
      countOffset,
    )
  }
  const minimumStringBytes = 3
  if (stringCount > Math.floor(reader.remaining / minimumStringBytes)) {
    throw reader.error(
      `Library string count ${stringCount} cannot fit in ${reader.remaining} bytes`,
      countOffset,
    )
  }

  const stringsOffset = reader.offset
  let decodedStringBytes = input.initialDecodedStringBytes
  for (let index = 0; index < stringCount; index += 1) {
    const stringOffset = reader.offset
    decodedStringBytes = addDecodedStringBytes({
      reader,
      current: decodedStringBytes,
      additional: reader.skipLengthPrefixedNullTerminatedString(),
      label: `Library string-table entry ${index}`,
      offset: stringOffset,
    })
  }

  const aliasCountOffset = reader.offset
  const aliasCount = reader.readUint16()
  if (aliasCount > MAX_PREVIEW_LIBRARY_ALIASES) {
    throw reader.error(
      `Library part-alias count ${aliasCount} exceeds the ${MAX_PREVIEW_LIBRARY_ALIASES}-entry Preview ceiling`,
      aliasCountOffset,
    )
  }
  if (aliasCount > Math.floor(reader.remaining / 6)) {
    throw reader.error(
      `Library part-alias count ${aliasCount} cannot fit in ${reader.remaining} bytes`,
      reader.offset - 2,
    )
  }
  for (let index = 0; index < aliasCount; index += 1) {
    for (const role of ["alias", "package"] as const) {
      const stringOffset = reader.offset
      decodedStringBytes = addDecodedStringBytes({
        reader,
        current: decodedStringBytes,
        additional: reader.skipLengthPrefixedNullTerminatedString(),
        label: `Library part-alias ${index} ${role}`,
        offset: stringOffset,
      })
    }
  }

  if (input.databaseKind === "design") {
    const requiredZeroOffset = reader.offset
    if (reader.readUint32() !== 0) {
      throw reader.error(
        "Library Design trailer reserved word is not zero",
        requiredZeroOffset,
      )
    }
    reader.skip(4)
    const schematicNameOffset = reader.offset
    decodedStringBytes = addDecodedStringBytes({
      reader,
      current: decodedStringBytes,
      additional: reader.skipLengthPrefixedNullTerminatedString(),
      label: "Library schematic name",
      offset: schematicNameOffset,
    })
  }
  if (reader.remaining !== 0) {
    throw reader.error(
      `Library has ${reader.remaining} unconsumed byte${reader.remaining === 1 ? "" : "s"}`,
    )
  }
  const stringReader = new PreviewBinaryReader({
    bytes: input.bytes,
    streamPath: input.streamPath,
    offset: stringsOffset,
  })
  const strings = new Array<string>(stringCount)
  for (let index = 0; index < stringCount; index += 1) {
    strings[index] = stringReader.readLengthPrefixedNullTerminatedString()
  }
  return Object.freeze(strings)
}

function addDecodedStringBytes(input: {
  readonly reader: PreviewBinaryReader
  readonly current: number
  readonly additional: number
  readonly label: string
  readonly offset: number
}): number {
  if (input.additional > MAX_PREVIEW_LIBRARY_STRING_BYTES - input.current) {
    throw input.reader.error(
      `${input.label} exceeds the ${MAX_PREVIEW_LIBRARY_STRING_BYTES}-byte cumulative Library string ceiling`,
      input.offset,
    )
  }
  return input.current + input.additional
}

function classifyIntroduction(
  reader: PreviewBinaryReader,
  introduction: string,
): "design" | "library" {
  if (introduction.startsWith("OrCAD Windows Design")) return "design"
  if (introduction.startsWith("OrCAD Windows Library")) return "library"
  throw reader.error(
    `unrecognized Library introduction ${JSON.stringify(introduction)}`,
    0,
  )
}
