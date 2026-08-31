/**
 * Clean-room TypeScript implementation of selected OpenOrCadParser record
 * layouts at commit be0a83ac119390044952cf9bed1e0fb86c448f44.
 * Format authority: src/GenericParser.cpp, src/FutureData.hpp,
 * src/Enums/Structure.hpp, src/PageSettings.cpp,
 * src/Structures/StructWire.cpp,
 * src/Structures/StructAlias.cpp,
 * src/Structures/StructSymbolDisplayProp.cpp,
 * src/Structures/StructPlacedInstance.cpp,
 * src/Structures/StructT0x10.cpp,
 * src/Structures/StructGraphicInst.cpp,
 * src/Structures/StructGlobal.cpp, src/Structures/StructPort.cpp, and
 * src/Structures/StructOffPageConnector.cpp.
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

import type { PreviewBinaryReader } from "./preview-binary-reader"
import {
  OrcadSchematicPreviewComponent,
  OrcadSchematicPreviewNetSymbol,
  OrcadSchematicPreviewT0x10Record,
  OrcadSchematicPreviewWire,
} from "./preview-nodes"
import type {
  OrcadSchematicPreviewDisplayProperty,
  OrcadSchematicPreviewNetAlias,
  OrcadSchematicPreviewNetSymbolKind,
  OrcadSchematicPreviewProperty,
  OrcadSchematicPreviewWarning,
} from "./preview-types"

const STRUCTURE_PAGE = 0x0a
const STRUCTURE_PLACED_INSTANCE = 0x0d
const STRUCTURE_T0X10 = 0x10
const STRUCTURE_WIRE_SCALAR = 0x14
const STRUCTURE_WIRE_BUS = 0x15
const STRUCTURE_PORT = 0x17
const STRUCTURE_GLOBAL = 0x25
const STRUCTURE_OFF_PAGE_CONNECTOR = 0x26
const STRUCTURE_SYMBOL_DISPLAY_PROPERTY = 0x27
const STRUCTURE_ALIAS = 0x31
const RECORD_PREAMBLE = [0xff, 0xe4, 0x5c, 0x39] as const
const LONG_PREFIX_BYTE_LENGTH = 9
const SHORT_PREFIX_BYTE_LENGTH = 3
const MAX_PREFIX_COUNT = 10
const MIN_SPANNED_RECORD_BYTE_LENGTH =
  LONG_PREFIX_BYTE_LENGTH + SHORT_PREFIX_BYTE_LENGTH

export const MAX_PREVIEW_PROPERTIES_PER_RECORD = 1_024
export const MAX_PREVIEW_RECORD_CHILDREN = 4_096
export const MAX_PREVIEW_PAGE_NODES = 50_000
export const MAX_PREVIEW_PAGE_PROPERTIES = 32_768
export const MAX_PREVIEW_WARNINGS_PER_PAGE = 128

export const PREVIEW_PAGE_SETTINGS_BYTE_LENGTH = 156

export interface PreviewRecordContext {
  readonly strings: readonly string[]
  readonly warnings: PreviewWarningCollector
  readonly budget: PreviewPageBudget
  readonly streamPath: string
}

export class PreviewPageBudget {
  #nodeCount = 0
  #propertyCount = 0

  consumeNodes(
    reader: PreviewBinaryReader,
    count: number,
    label: string,
    offset: number,
  ): void {
    if (count > MAX_PREVIEW_PAGE_NODES - this.#nodeCount) {
      throw reader.error(
        `${label} count ${count} exceeds the remaining cumulative Page node budget of ${MAX_PREVIEW_PAGE_NODES - this.#nodeCount}`,
        offset,
      )
    }
    this.#nodeCount += count
  }

  consumeProperties(
    reader: PreviewBinaryReader,
    count: number,
    offset: number,
  ): void {
    if (count > MAX_PREVIEW_PROPERTIES_PER_RECORD) {
      throw reader.error(
        `record property count ${count} exceeds the ${MAX_PREVIEW_PROPERTIES_PER_RECORD}-property per-record ceiling`,
        offset,
      )
    }
    if (count > MAX_PREVIEW_PAGE_PROPERTIES - this.#propertyCount) {
      throw reader.error(
        `record property count ${count} exceeds the remaining cumulative Page property budget of ${MAX_PREVIEW_PAGE_PROPERTIES - this.#propertyCount}`,
        offset,
      )
    }
    this.#propertyCount += count
  }
}

export class PreviewWarningCollector {
  #warnings: OrcadSchematicPreviewWarning[] = []
  #dedupeKeys = new Set<string>()
  #didTruncate = false

  add(
    warning: OrcadSchematicPreviewWarning,
    dedupeKey = `${warning.code}\u0000${warning.streamPath ?? ""}\u0000${warning.offset ?? ""}\u0000${warning.message}`,
  ): void {
    if (this.#didTruncate) return
    if (this.#dedupeKeys.has(dedupeKey)) return
    this.#dedupeKeys.add(dedupeKey)
    if (this.#warnings.length < MAX_PREVIEW_WARNINGS_PER_PAGE - 1) {
      this.#warnings.push(Object.freeze({ ...warning }))
      return
    }
    this.#didTruncate = true
    this.#warnings.push(
      Object.freeze({
        code: "warning_limit_reached",
        message: `Further Preview warnings were suppressed after ${MAX_PREVIEW_WARNINGS_PER_PAGE - 1} unique diagnostics`,
        streamPath: warning.streamPath,
        offset: warning.offset,
      }),
    )
  }

  snapshot(): readonly OrcadSchematicPreviewWarning[] {
    return Object.freeze([...this.#warnings])
  }
}

export interface PreviewPageSettings {
  readonly width: number
  readonly height: number
}

export interface PreviewRecordHeader {
  readonly structureType: number
  readonly startOffset: number
  readonly bodyOffset: number
  readonly endOffset: number
  readonly checkpointOffsets: readonly number[]
  readonly properties: readonly OrcadSchematicPreviewProperty[]
}

interface HeaderCandidate {
  readonly longPrefixCount: number
  readonly shortPrefixOffset: number
  readonly propertyCount: number
  readonly preambleOffset: number
  readonly hasPreamble: boolean
  readonly bodyOffset: number
  readonly endOffsets: readonly number[]
}

export function readPreviewPageRecordHeader(
  reader: PreviewBinaryReader,
  context: PreviewRecordContext,
): PreviewRecordHeader {
  const header = readRecordHeader(reader, [STRUCTURE_PAGE], context)
  validateCheckpointOffsets(reader, header, [
    header.bodyOffset,
    header.endOffset,
  ])
  return header
}

export function readPreviewPageSettings(
  reader: PreviewBinaryReader,
): PreviewPageSettings {
  const startOffset = reader.offset
  reader.skip(8)
  reader.skip(16)
  const width = reader.readUint32()
  const height = reader.readUint32()
  reader.setOffset(startOffset + PREVIEW_PAGE_SETTINGS_BYTE_LENGTH)
  return Object.freeze({ width, height })
}

export function skipPreviewRecord(reader: PreviewBinaryReader): number {
  const startOffset = reader.offset
  if (!reader.hasBytes(1)) {
    throw reader.error("cannot skip a record without its structure byte")
  }
  const structureType = reader.uint8At(startOffset)
  const header = readRecordHeader(reader, [structureType], {
    strings: [],
    warnings: new PreviewWarningCollector(),
    budget: new PreviewPageBudget(),
    streamPath: reader.streamPath,
  })
  reader.setOffset(header.endOffset)
  return structureType
}

/** Skip a record using only the first long-prefix span. */
export function skipPreviewSpannedRecord(
  reader: PreviewBinaryReader,
  expectedType?: number | undefined,
): number {
  const startOffset = reader.offset
  if (!reader.hasBytes(LONG_PREFIX_BYTE_LENGTH)) {
    throw reader.error("cannot skip a record without its first long prefix")
  }
  const structureType = reader.readUint8()
  if (expectedType !== undefined && structureType !== expectedType) {
    throw reader.error(
      `expected structure ${formatStructureType(expectedType)}, got ${formatStructureType(structureType)}`,
      startOffset,
    )
  }
  const span = reader.readUint32()
  reader.skip(4)
  const endOffset = startOffset + LONG_PREFIX_BYTE_LENGTH + span
  if (endOffset <= reader.offset || endOffset > reader.byteLength) {
    throw reader.error(
      `structure ${formatStructureType(structureType)} span ends outside the stream at ${formatOffset(endOffset)}`,
      startOffset + 1,
    )
  }
  reader.setOffset(endOffset)
  return structureType
}

export function readPreviewWire(input: {
  readonly reader: PreviewBinaryReader
  readonly context: PreviewRecordContext
  readonly sourceOrder: number
}): OrcadSchematicPreviewWire {
  const { reader, context, sourceOrder } = input
  const header = readRecordHeader(
    reader,
    [STRUCTURE_WIRE_SCALAR, STRUCTURE_WIRE_BUS],
    context,
  )
  const opaqueHeaderWords = Object.freeze([
    reader.readUint32(),
    reader.readUint32(),
  ]) as readonly [number, number]
  const color = reader.readUint32()
  const start = Object.freeze({ x: reader.readInt32(), y: reader.readInt32() })
  const end = Object.freeze({ x: reader.readInt32(), y: reader.readInt32() })
  const opaqueAfterEndpoints = reader.readBytes(1)

  const aliases: OrcadSchematicPreviewNetAlias[] = []
  const aliasCount = readBoundedCount(
    reader,
    context,
    "wire alias",
    header.endOffset,
  )
  for (let index = 0; index < aliasCount; index += 1) {
    aliases.push(readAlias(reader, context, sourceOrder, header.endOffset))
  }

  const displayProperties = readDisplayPropertyList(
    reader,
    context,
    header.properties,
    "wire display property",
    header.endOffset,
  )
  const lineWidth = reader.readUint32()
  const lineStyle = reader.readUint32()
  finishRecord(reader, header)

  return new OrcadSchematicPreviewWire({
    sourceOrder,
    kind: header.structureType === STRUCTURE_WIRE_BUS ? "bus" : "wire",
    opaqueHeaderWords,
    color,
    start,
    end,
    aliases,
    displayProperties,
    lineWidth,
    lineStyle,
    opaqueAfterEndpoints,
  })
}

export function readPreviewComponent(input: {
  readonly reader: PreviewBinaryReader
  readonly context: PreviewRecordContext
  readonly sourceOrder: number
}): OrcadSchematicPreviewComponent {
  const { reader, context, sourceOrder } = input
  const header = readRecordHeader(reader, [STRUCTURE_PLACED_INSTANCE], context)
  const opaqueBeforePackageName = reader.readBytes(8)
  const packageName = reader.readLengthPrefixedNullTerminatedString()
  const databaseId = reader.readUint32()
  const opaqueAfterDatabaseId = reader.readBytes(8)
  const position = Object.freeze({
    x: reader.readInt16(),
    y: reader.readInt16(),
  })
  const opaqueAfterPosition = reader.readBytes(4)
  const displayProperties = readDisplayPropertyList(
    reader,
    context,
    header.properties,
    "placed-instance display property",
    header.endOffset,
  )
  const opaqueAfterDisplayProperties = reader.readBytes(1)
  const afterDisplayPropertiesOffset = reader.offset
  const reference = reader.readLengthPrefixedNullTerminatedString()
  const opaqueAfterReference = reader.readBytes(14)

  const t0x10Records: OrcadSchematicPreviewT0x10Record[] = []
  const t0x10Count = readBoundedCount(
    reader,
    context,
    "placed-instance T0x10",
    header.endOffset,
  )
  for (let index = 0; index < t0x10Count; index += 1) {
    t0x10Records.push(
      readT0x10Record({
        reader,
        context,
        sourceOrder: index,
        containingEndOffset: header.endOffset,
      }),
    )
  }
  const afterT0x10RecordsOffset = reader.offset

  const opaqueTrailingString = reader.readLengthPrefixedNullTerminatedString()
  const opaqueAfterTrailingString = reader.readBytes(2)
  finishRecord(reader, header, [
    afterDisplayPropertiesOffset,
    afterT0x10RecordsOffset,
  ])

  return new OrcadSchematicPreviewComponent({
    sourceOrder,
    packageName,
    databaseId,
    reference,
    position,
    opaqueBeforePackageName,
    opaqueAfterDatabaseId,
    opaqueAfterPosition,
    opaqueAfterDisplayProperties,
    opaqueAfterReference,
    opaqueTrailingString,
    opaqueAfterTrailingString,
    value: null,
    valueSource: "unresolved",
    properties: header.properties,
    displayProperties,
    t0x10Records,
  })
}

export function readPreviewNetSymbol(input: {
  readonly reader: PreviewBinaryReader
  readonly context: PreviewRecordContext
  readonly sourceOrder: number
  readonly kind: OrcadSchematicPreviewNetSymbolKind
  readonly pageEntryTrailerLength: number
}): OrcadSchematicPreviewNetSymbol {
  const { reader, context, sourceOrder, kind, pageEntryTrailerLength } = input
  const expectedType =
    kind === "global"
      ? STRUCTURE_GLOBAL
      : kind === "port"
        ? STRUCTURE_PORT
        : STRUCTURE_OFF_PAGE_CONNECTOR
  const header = readRecordHeader(reader, [expectedType], context)
  const opaqueGraphicHeaderWords = Object.freeze([
    reader.readUint32(),
    reader.readUint32(),
  ]) as readonly [number, number]
  const symbolName = reader.readLengthPrefixedNullTerminatedString()
  const databaseId = reader.readUint32()
  const position = Object.freeze({
    y: reader.readInt16(),
    x: reader.readInt16(),
  })
  const y2 = reader.readInt16()
  const x2 = reader.readInt16()
  const x1 = reader.readInt16()
  const y1 = reader.readInt16()
  const color = reader.readUint8()
  const opaqueAfterColor = reader.readBytes(3)
  const displayProperties = readDisplayPropertyList(
    reader,
    context,
    header.properties,
    `${kind} display property`,
    header.endOffset,
  )
  const opaqueTargetByte = reader.readUint8()
  const afterGraphicInstanceOffset = reader.offset
  const opaqueRecordTrailer =
    kind === "port" ? reader.readBytes(9) : Object.freeze([])
  finishRecord(
    reader,
    header,
    kind === "port" ? [afterGraphicInstanceOffset] : [],
  )
  const opaquePageEntryTrailer = reader.readBytes(pageEntryTrailerLength)

  const bounds = Object.freeze({
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
  })

  return new OrcadSchematicPreviewNetSymbol({
    sourceOrder,
    kind,
    opaqueGraphicHeaderWords,
    symbolName,
    databaseId,
    position,
    bounds,
    color,
    opaqueAfterColor,
    opaqueTargetByte,
    opaqueRecordTrailer,
    opaquePageEntryTrailer,
    properties: header.properties,
    displayProperties,
    attachmentCandidates: buildAttachmentCandidates(position, bounds),
  })
}

function readT0x10Record(input: {
  readonly reader: PreviewBinaryReader
  readonly context: PreviewRecordContext
  readonly sourceOrder: number
  readonly containingEndOffset: number
}): OrcadSchematicPreviewT0x10Record {
  const { reader, context, sourceOrder, containingEndOffset } = input
  const header = readRecordHeader(
    reader,
    [STRUCTURE_T0X10],
    context,
    containingEndOffset,
  )
  const opaqueUint16 = reader.readUint16()
  const position = Object.freeze({
    x: reader.readInt16(),
    y: reader.readInt16(),
  })
  const opaqueUint32A = reader.readUint32()
  const opaqueUint32B = reader.readUint32()
  const displayProperties = readDisplayPropertyList(
    reader,
    context,
    header.properties,
    "T0x10 display property",
    header.endOffset,
  )
  finishRecord(reader, header)
  return new OrcadSchematicPreviewT0x10Record({
    sourceOrder,
    opaqueUint16,
    position,
    opaqueUint32A,
    opaqueUint32B,
    properties: header.properties,
    displayProperties,
  })
}

function readAlias(
  reader: PreviewBinaryReader,
  context: PreviewRecordContext,
  wireSourceOrder: number,
  containingEndOffset: number,
): OrcadSchematicPreviewNetAlias {
  const header = readRecordHeader(
    reader,
    [STRUCTURE_ALIAS],
    context,
    containingEndOffset,
  )
  const position = Object.freeze({
    x: reader.readInt32(),
    y: reader.readInt32(),
  })
  const color = reader.readUint32()
  const rotation = reader.readUint32()
  const fontIndex = reader.readUint32()
  const name = reader.readLengthPrefixedNullTerminatedString()
  finishRecord(reader, header)
  return Object.freeze({
    name,
    position,
    color,
    rotation,
    fontIndex,
    wireSourceOrder,
  })
}

function readDisplayPropertyList(
  reader: PreviewBinaryReader,
  context: PreviewRecordContext,
  ownerProperties: readonly OrcadSchematicPreviewProperty[],
  label: string,
  containingEndOffset: number,
): readonly OrcadSchematicPreviewDisplayProperty[] {
  const properties: OrcadSchematicPreviewDisplayProperty[] = []
  const count = readBoundedCount(reader, context, label, containingEndOffset)
  for (let index = 0; index < count; index += 1) {
    properties.push(
      readDisplayProperty(
        reader,
        context,
        ownerProperties,
        containingEndOffset,
      ),
    )
  }
  return Object.freeze(properties)
}

function readDisplayProperty(
  reader: PreviewBinaryReader,
  context: PreviewRecordContext,
  ownerProperties: readonly OrcadSchematicPreviewProperty[],
  containingEndOffset: number,
): OrcadSchematicPreviewDisplayProperty {
  const header = readRecordHeader(
    reader,
    [STRUCTURE_SYMBOL_DISPLAY_PROPERTY],
    context,
    containingEndOffset,
  )
  const propertyNameIndexOffset = reader.offset
  const propertyNameIndex = reader.readUint32()
  const offset = Object.freeze({
    x: reader.readInt16(),
    y: reader.readInt16(),
  })
  const rotationAndFont = reader.readUint16()
  const fontIndex = rotationAndFont & 0x3fff
  const rotationQuarterTurns = (rotationAndFont >>> 14) as 0 | 1 | 2 | 3
  const color = reader.readUint8()
  const opaqueAfterColor = Object.freeze([
    reader.readUint8(),
    reader.readUint8(),
  ]) as readonly [number, number]
  const trailingByteOffset = reader.offset
  const opaqueTrailingByte = reader.readUint8()
  if (opaqueTrailingByte !== 0) {
    throw reader.error(
      `display-property trailing byte is ${opaqueTrailingByte}, expected zero`,
      trailingByteOffset,
    )
  }
  finishRecord(reader, header)

  const propertyName = resolveStringIndex(
    propertyNameIndex,
    propertyNameIndexOffset,
    context,
  )
  const ownerProperty = ownerProperties.find(
    (property) => property.nameIndex === propertyNameIndex,
  )
  return Object.freeze({
    propertyNameIndex,
    propertyName,
    text: ownerProperty?.value ?? null,
    offset,
    fontIndex,
    rotationQuarterTurns,
    color,
    opaqueAfterColor,
    opaqueTrailingByte,
  })
}

function readRecordHeader(
  reader: PreviewBinaryReader,
  expectedTypes: readonly number[],
  context: PreviewRecordContext,
  containingEndOffset = reader.byteLength,
): PreviewRecordHeader {
  const startOffset = reader.offset
  const candidate = findHeaderCandidate(
    reader,
    startOffset,
    expectedTypes,
    containingEndOffset,
  )
  if (!candidate) {
    throw reader.error(
      `could not frame structure ${expectedTypes.map(formatStructureType).join(" or ")}`,
      startOffset,
    )
  }

  for (let index = 0; index < candidate.longPrefixCount; index += 1) {
    const actualType = reader.readUint8()
    assertExpectedType(reader, actualType, expectedTypes, reader.offset - 1)
    reader.readUint32()
    reader.skip(4)
  }
  const structureType = reader.readUint8()
  assertExpectedType(reader, structureType, expectedTypes, reader.offset - 1)
  const propertyCountOffset = reader.offset
  const propertyCount = reader.readInt16()
  const properties: OrcadSchematicPreviewProperty[] = []
  if (propertyCount >= 0) {
    context.budget.consumeProperties(reader, propertyCount, propertyCountOffset)
    for (let index = 0; index < propertyCount; index += 1) {
      const pairOffset = reader.offset
      const nameIndex = reader.readUint32()
      const valueIndex = reader.readUint32()
      properties.push(
        Object.freeze({
          nameIndex,
          valueIndex,
          name: resolveStringIndex(nameIndex, pairOffset, context),
          value: resolveStringIndex(valueIndex, pairOffset + 4, context),
        }),
      )
    }
  }
  if (candidate.hasPreamble) {
    if (!reader.matches(RECORD_PREAMBLE)) {
      throw reader.error("record preamble disappeared after framing")
    }
    reader.skip(RECORD_PREAMBLE.length)
    const preambleOpaqueLength = reader.readUint32()
    reader.skip(preambleOpaqueLength)
  }
  if (reader.offset !== candidate.bodyOffset) {
    throw reader.error("record framing produced an inconsistent body offset")
  }

  const endOffset = candidate.endOffsets[0]
  if (endOffset === undefined) {
    throw reader.error("record has no long prefix span", startOffset)
  }
  return Object.freeze({
    structureType,
    startOffset,
    bodyOffset: candidate.bodyOffset,
    endOffset,
    checkpointOffsets: candidate.endOffsets,
    properties: Object.freeze(properties),
  })
}

function findHeaderCandidate(
  reader: PreviewBinaryReader,
  startOffset: number,
  expectedTypes: readonly number[],
  containingEndOffset: number,
): HeaderCandidate | null {
  const candidates: HeaderCandidate[] = []
  let prefixOffset = startOffset
  const endOffsets: number[] = []

  for (
    let longPrefixCount = 0;
    longPrefixCount < MAX_PREFIX_COUNT;
    longPrefixCount += 1
  ) {
    const shortCandidate = inspectShortPrefix(
      reader,
      prefixOffset,
      expectedTypes,
      endOffsets,
      longPrefixCount,
      containingEndOffset,
    )
    if (shortCandidate) candidates.push(shortCandidate)

    if (!reader.hasBytes(LONG_PREFIX_BYTE_LENGTH, prefixOffset)) break
    const type = reader.uint8At(prefixOffset)
    if (!expectedTypes.includes(type)) break
    const span = reader.uint32At(prefixOffset + 1)
    const endOffset = prefixOffset + LONG_PREFIX_BYTE_LENGTH + span
    const outerEnd = endOffsets[0] ?? endOffset
    if (
      !Number.isSafeInteger(endOffset) ||
      endOffset <= prefixOffset + LONG_PREFIX_BYTE_LENGTH ||
      endOffset > reader.byteLength ||
      endOffset > containingEndOffset ||
      endOffset > outerEnd
    ) {
      break
    }
    endOffsets.push(endOffset)
    prefixOffset += LONG_PREFIX_BYTE_LENGTH
  }

  const candidatesWithPreamble = candidates.filter(
    (candidate) => candidate.hasPreamble,
  )
  return candidatesWithPreamble.at(-1) ?? candidates.at(-1) ?? null
}

function inspectShortPrefix(
  reader: PreviewBinaryReader,
  prefixOffset: number,
  expectedTypes: readonly number[],
  endOffsets: readonly number[],
  longPrefixCount: number,
  containingEndOffset: number,
): HeaderCandidate | null {
  if (!reader.hasBytes(SHORT_PREFIX_BYTE_LENGTH, prefixOffset)) return null
  if (!expectedTypes.includes(reader.uint8At(prefixOffset))) return null
  const propertyCount = reader.int16At(prefixOffset + 1)
  const pairCount = propertyCount < 0 ? 0 : propertyCount
  const pairByteLength = pairCount * 8
  if (!Number.isSafeInteger(pairByteLength)) {
    return null
  }
  const preambleOffset =
    prefixOffset + SHORT_PREFIX_BYTE_LENGTH + pairByteLength
  const hasPreamble = reader.matches(RECORD_PREAMBLE, preambleOffset)
  if (hasPreamble && !reader.hasBytes(8, preambleOffset)) return null
  const opaqueLength = hasPreamble ? reader.uint32At(preambleOffset + 4) : 0
  const bodyOffset = preambleOffset + (hasPreamble ? 8 + opaqueLength : 0)
  if (!reader.hasBytes(0, bodyOffset)) return null
  if (bodyOffset > containingEndOffset) return null
  if (endOffsets.length === 0) return null
  for (const endOffset of endOffsets) {
    if (endOffset < bodyOffset) return null
  }
  return {
    longPrefixCount,
    shortPrefixOffset: prefixOffset,
    propertyCount,
    preambleOffset,
    hasPreamble,
    bodyOffset,
    endOffsets: Object.freeze([...endOffsets]),
  }
}

function finishRecord(
  reader: PreviewBinaryReader,
  header: PreviewRecordHeader,
  intermediateCheckpointOffsets: readonly number[] = [],
): void {
  if (reader.offset !== header.endOffset) {
    throw reader.error(
      `structure ${formatStructureType(header.structureType)} ended at ${formatOffset(reader.offset)}, expected ${formatOffset(header.endOffset)}`,
      reader.offset,
    )
  }
  validateCheckpointOffsets(reader, header, [
    header.bodyOffset,
    ...intermediateCheckpointOffsets,
    reader.offset,
  ])
}

function validateCheckpointOffsets(
  reader: PreviewBinaryReader,
  header: PreviewRecordHeader,
  expectedOffsets: readonly number[],
): void {
  const actual = [...header.checkpointOffsets].sort(
    (left, right) => left - right,
  )
  const expected = [...expectedOffsets].sort((left, right) => left - right)
  if (
    actual.length !== expected.length ||
    actual.some((offset, index) => offset !== expected[index])
  ) {
    throw reader.error(
      `structure ${formatStructureType(header.structureType)} checkpoint spans ${actual.map(formatOffset).join(", ")} do not match parsed checkpoints ${expected.map(formatOffset).join(", ")}`,
      header.startOffset,
    )
  }
}

function readBoundedCount(
  reader: PreviewBinaryReader,
  context: PreviewRecordContext,
  label: string,
  containingEndOffset: number,
): number {
  const countOffset = reader.offset
  const count = reader.readUint16()
  if (count > MAX_PREVIEW_RECORD_CHILDREN) {
    throw reader.error(
      `${label} count ${count} exceeds the ${MAX_PREVIEW_RECORD_CHILDREN}-child per-record ceiling`,
      countOffset,
    )
  }
  const remainingInRecord = containingEndOffset - reader.offset
  if (
    remainingInRecord < 0 ||
    count > Math.floor(remainingInRecord / MIN_SPANNED_RECORD_BYTE_LENGTH)
  ) {
    throw reader.error(
      `${label} count ${count} cannot fit in the enclosing record's ${Math.max(0, remainingInRecord)} remaining bytes`,
      countOffset,
    )
  }
  context.budget.consumeNodes(reader, count, label, countOffset)
  return count
}

function resolveStringIndex(
  index: number,
  offset: number,
  context: PreviewRecordContext,
): string | null {
  const value = context.strings[index]
  if (value !== undefined) return value
  context.warnings.add(
    Object.freeze({
      code: "string_index_out_of_range",
      message: `Library string index ${index} is outside the ${context.strings.length}-entry table`,
      streamPath: context.streamPath,
      offset,
    }),
    `string-index-out-of-range:${index}`,
  )
  return null
}

function assertExpectedType(
  reader: PreviewBinaryReader,
  actualType: number,
  expectedTypes: readonly number[],
  offset: number,
): void {
  if (!expectedTypes.includes(actualType)) {
    throw reader.error(
      `expected structure ${expectedTypes.map(formatStructureType).join(" or ")}, got ${formatStructureType(actualType)}`,
      offset,
    )
  }
}

function buildAttachmentCandidates(
  position: { readonly x: number; readonly y: number },
  bounds: {
    readonly minX: number
    readonly minY: number
    readonly maxX: number
    readonly maxY: number
  },
) {
  const middleX = (bounds.minX + bounds.maxX) / 2
  const middleY = (bounds.minY + bounds.maxY) / 2
  return Object.freeze([
    Object.freeze({ position, reason: "placement_origin" as const }),
    Object.freeze({
      position: Object.freeze({ x: bounds.minX, y: middleY }),
      reason: "left_edge_midpoint" as const,
    }),
    Object.freeze({
      position: Object.freeze({ x: bounds.maxX, y: middleY }),
      reason: "right_edge_midpoint" as const,
    }),
    Object.freeze({
      position: Object.freeze({ x: middleX, y: bounds.minY }),
      reason: "top_edge_midpoint" as const,
    }),
    Object.freeze({
      position: Object.freeze({ x: middleX, y: bounds.maxY }),
      reason: "bottom_edge_midpoint" as const,
    }),
  ])
}

function formatStructureType(value: number): string {
  return `0x${value.toString(16).padStart(2, "0")}`
}

function formatOffset(offset: number): string {
  return `0x${offset.toString(16).padStart(8, "0")}`
}
