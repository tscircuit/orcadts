/**
 * Clean-room TypeScript implementation of the supported OpenOrCadParser Page
 * stream prefix at commit be0a83ac119390044952cf9bed1e0fb86c448f44.
 * Format authority: src/Streams/StreamPage.cpp, src/Enums/Structure.hpp,
 * src/Structures/StructWire.cpp, src/Structures/StructPlacedInstance.cpp,
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

import { PreviewBinaryReader } from "./preview-binary-reader"
import {
  type OrcadSchematicPreviewComponent,
  type OrcadSchematicPreviewNetSymbol,
  OrcadSchematicPreviewPage,
  type OrcadSchematicPreviewWire,
} from "./preview-nodes"
import {
  PreviewPageBudget,
  PreviewWarningCollector,
  readPreviewComponent,
  readPreviewNetSymbol,
  readPreviewPageRecordHeader,
  readPreviewPageSettings,
  readPreviewWire,
  skipPreviewSpannedRecord,
} from "./preview-record-reader"
import type {
  OrcadSchematicPreviewBounds,
  OrcadSchematicPreviewConnectionPoint,
  OrcadSchematicPreviewNetAlias,
  OrcadSchematicPreviewNetNameEntry,
  OrcadSchematicPreviewPoint,
} from "./preview-types"

const STRUCTURE_T0X34 = 0x34
const STRUCTURE_T0X35 = 0x35
const STRUCTURE_TITLE_BLOCK = 0x41
const MIN_SPANNED_RECORD_BYTE_LENGTH = 10
const MANDATORY_TRAILING_PAGE_LIST_COUNT = 5

/** Maximum candidate-point-by-wire tests used by the junction heuristic. */
export const MAX_PREVIEW_THROUGH_WIRE_CHECKS = 1_000_000

export function parsePreviewPage(input: {
  readonly bytes: Uint8Array
  readonly streamPath: string
  readonly viewName: string
  readonly strings: readonly string[]
}): OrcadSchematicPreviewPage {
  const reader = new PreviewBinaryReader(input)
  const warnings = new PreviewWarningCollector()
  const budget = new PreviewPageBudget()
  const context = {
    strings: input.strings,
    warnings,
    budget,
    streamPath: input.streamPath,
  }
  const pageHeader = readPreviewPageRecordHeader(reader, context)
  if (pageHeader.endOffset !== reader.byteLength) {
    throw reader.error(
      `Page outer span ends at ${pageHeader.endOffset}, not the ${reader.byteLength}-byte stream boundary`,
      pageHeader.startOffset,
    )
  }

  const name = reader.readLengthPrefixedNullTerminatedString()
  const pageSizeName = reader.readLengthPrefixedNullTerminatedString()
  const pageSettings = readPreviewPageSettings(reader)

  skipRecordList(reader, warnings, budget, "title-block", STRUCTURE_TITLE_BLOCK)
  skipRecordList(reader, warnings, budget, "T0x34", STRUCTURE_T0X34)
  skipRecordList(reader, warnings, budget, "T0x35", STRUCTURE_T0X35)

  const netNameTable: OrcadSchematicPreviewNetNameEntry[] = []
  const netNameCount = readPageListCount(reader, budget, "Page net-name", 7)
  for (let index = 0; index < netNameCount; index += 1) {
    netNameTable.push(
      Object.freeze({
        name: reader.readLengthPrefixedNullTerminatedString(),
        opaqueWord: reader.readUint32(),
      }),
    )
  }

  const wires: OrcadSchematicPreviewWire[] = []
  const wireCount = readPageListCount(
    reader,
    budget,
    "Page wire",
    MIN_SPANNED_RECORD_BYTE_LENGTH,
  )
  for (let sourceOrder = 0; sourceOrder < wireCount; sourceOrder += 1) {
    wires.push(readPreviewWire({ reader, context, sourceOrder }))
  }

  const components: OrcadSchematicPreviewComponent[] = []
  const componentCount = readPageListCount(
    reader,
    budget,
    "Page placed-instance",
    MIN_SPANNED_RECORD_BYTE_LENGTH,
  )
  for (let sourceOrder = 0; sourceOrder < componentCount; sourceOrder += 1) {
    components.push(readPreviewComponent({ reader, context, sourceOrder }))
  }

  const ports: OrcadSchematicPreviewNetSymbol[] = []
  const portCount = readPageListCount(
    reader,
    budget,
    "Page port",
    MIN_SPANNED_RECORD_BYTE_LENGTH,
  )
  for (let sourceOrder = 0; sourceOrder < portCount; sourceOrder += 1) {
    ports.push(
      readPreviewNetSymbol({
        reader,
        context,
        sourceOrder,
        kind: "port",
        pageEntryTrailerLength: 0,
      }),
    )
  }

  const globals: OrcadSchematicPreviewNetSymbol[] = []
  const globalCount = readPageListCount(
    reader,
    budget,
    "Page global",
    MIN_SPANNED_RECORD_BYTE_LENGTH + 5,
  )
  for (let sourceOrder = 0; sourceOrder < globalCount; sourceOrder += 1) {
    globals.push(
      readPreviewNetSymbol({
        reader,
        context,
        sourceOrder,
        kind: "global",
        pageEntryTrailerLength: 5,
      }),
    )
  }

  const offPageConnectors: OrcadSchematicPreviewNetSymbol[] = []
  const offPageConnectorCount = readPageListCount(
    reader,
    budget,
    "Page off-page connector",
    MIN_SPANNED_RECORD_BYTE_LENGTH + 5,
  )
  for (
    let sourceOrder = 0;
    sourceOrder < offPageConnectorCount;
    sourceOrder += 1
  ) {
    offPageConnectors.push(
      readPreviewNetSymbol({
        reader,
        context,
        sourceOrder,
        kind: "off_page_connector",
        pageEntryTrailerLength: 5,
      }),
    )
  }

  readMandatoryTrailingPageListCounts(reader)

  const parsedByteLength = reader.offset
  const unparsedByteLength = pageHeader.endOffset - parsedByteLength
  if (unparsedByteLength < 0) {
    throw reader.error("supported Page prefix crossed the outer record span")
  }
  if (unparsedByteLength > 0) {
    warnings.add(
      Object.freeze({
        code: "page_tail_not_decoded",
        message: `${unparsedByteLength} trailing Page bytes are outside the bounded Preview subset`,
        streamPath: input.streamPath,
        offset: parsedByteLength,
      }),
      "page-tail-not-decoded",
    )
  }

  const netAliases = Object.freeze(wires.flatMap((wire) => [...wire.aliases]))
  const symbols = [...globals, ...ports, ...offPageConnectors]
  const contentBounds = computePreviewContentBounds(
    wires,
    components,
    symbols,
    pageSettings,
  )
  const connectionPoints = buildConnectionPoints(
    wires,
    netAliases,
    symbols,
    warnings,
    input.streamPath,
  )
  return new OrcadSchematicPreviewPage({
    streamPath: input.streamPath,
    viewName: input.viewName,
    name,
    pageSizeName,
    byteLength: reader.byteLength,
    parsedByteLength,
    unparsedByteLength,
    contentBounds,
    netNameTable,
    netAliases,
    wires,
    components,
    globals,
    ports,
    offPageConnectors,
    connectionPoints,
    warnings: warnings.snapshot(),
  })
}

function skipRecordList(
  reader: PreviewBinaryReader,
  warnings: PreviewWarningCollector,
  budget: PreviewPageBudget,
  label: string,
  expectedType?: number | undefined,
): void {
  const countOffset = reader.offset
  const count = reader.readUint16()
  if (count === 0) return
  if (count > Math.floor(reader.remaining / MIN_SPANNED_RECORD_BYTE_LENGTH)) {
    throw reader.error(
      `${label} count ${count} cannot fit in ${reader.remaining} remaining Page bytes`,
      countOffset,
    )
  }
  budget.consumeNodes(reader, count, `Page ${label}`, countOffset)
  for (let index = 0; index < count; index += 1) {
    skipPreviewSpannedRecord(reader, expectedType)
  }
  warnings.add(
    Object.freeze({
      code: "unknown_page_record_skipped",
      message: `Skipped ${count} length-framed ${label} record${count === 1 ? "" : "s"} before the supported Page geometry`,
      streamPath: reader.streamPath,
      offset: countOffset,
    }),
    `unknown-page-record-skipped:${label}`,
  )
}

function readPageListCount(
  reader: PreviewBinaryReader,
  budget: PreviewPageBudget,
  label: string,
  minimumEntryByteLength: number,
): number {
  const countOffset = reader.offset
  const count = reader.readUint16()
  if (count > Math.floor(reader.remaining / minimumEntryByteLength)) {
    throw reader.error(
      `${label} count ${count} cannot fit in ${reader.remaining} remaining Page bytes`,
      countOffset,
    )
  }
  budget.consumeNodes(reader, count, label, countOffset)
  return count
}

function readMandatoryTrailingPageListCounts(
  reader: PreviewBinaryReader,
): void {
  const tailOffset = reader.offset
  const minimumByteLength = MANDATORY_TRAILING_PAGE_LIST_COUNT * 2
  if (!reader.hasBytes(minimumByteLength)) {
    throw reader.error(
      `Page tail is truncated: the five mandatory trailing list counts need ${minimumByteLength} bytes, but only ${reader.remaining} remain`,
      tailOffset,
    )
  }
  for (let index = 0; index < MANDATORY_TRAILING_PAGE_LIST_COUNT; index += 1) {
    const countOffset = reader.offset
    if (reader.readUint16() !== 0) {
      // Records in this first unsupported list make subsequent count offsets
      // unknowable. Leave the complete list framing and payload in the opaque
      // Page tail rather than speculatively stepping through it.
      reader.setOffset(countOffset)
      return
    }
  }
}

export function computePreviewContentBounds(
  wires: readonly OrcadSchematicPreviewWire[],
  components: readonly OrcadSchematicPreviewComponent[],
  symbols: readonly OrcadSchematicPreviewNetSymbol[],
  pageSettings: { readonly width: number; readonly height: number },
): OrcadSchematicPreviewBounds {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  const include = (point: OrcadSchematicPreviewPoint): void => {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  for (const wire of wires) {
    include(wire.start)
    include(wire.end)
  }
  for (const component of components) include(component.position)
  for (const symbol of symbols) {
    include({ x: symbol.bounds.minX, y: symbol.bounds.minY })
    include({ x: symbol.bounds.maxX, y: symbol.bounds.maxY })
    include(symbol.position)
  }
  if (minX === Number.POSITIVE_INFINITY) {
    return Object.freeze({
      minX: 0,
      minY: 0,
      maxX: pageSettings.width,
      maxY: pageSettings.height,
    })
  }
  return Object.freeze({ minX, minY, maxX, maxY })
}

interface MutableConnectionPoint {
  readonly position: OrcadSchematicPreviewPoint
  readonly wireEndpointSourceOrders: Set<number>
  readonly aliasNames: Set<string>
  readonly netSymbolDatabaseIds: Set<number>
}

function buildConnectionPoints(
  wires: readonly OrcadSchematicPreviewWire[],
  aliases: readonly OrcadSchematicPreviewNetAlias[],
  symbols: readonly OrcadSchematicPreviewNetSymbol[],
  warnings: PreviewWarningCollector,
  streamPath: string,
): readonly OrcadSchematicPreviewConnectionPoint[] {
  const points = new Map<string, MutableConnectionPoint>()
  const pointAt = (position: OrcadSchematicPreviewPoint) => {
    const key = pointKey(position)
    let point = points.get(key)
    if (!point) {
      point = {
        position: Object.freeze({ x: position.x, y: position.y }),
        wireEndpointSourceOrders: new Set(),
        aliasNames: new Set(),
        netSymbolDatabaseIds: new Set(),
      }
      points.set(key, point)
    }
    return point
  }

  for (const wire of wires) {
    pointAt(wire.start).wireEndpointSourceOrders.add(wire.sourceOrder)
    pointAt(wire.end).wireEndpointSourceOrders.add(wire.sourceOrder)
  }
  for (const alias of aliases)
    pointAt(alias.position).aliasNames.add(alias.name)
  for (const symbol of symbols) {
    for (const candidate of symbol.attachmentCandidates) {
      pointAt(candidate.position).netSymbolDatabaseIds.add(symbol.databaseId)
    }
  }

  const throughWireCheckCount = points.size * wires.length
  const inferThroughWires =
    throughWireCheckCount <= MAX_PREVIEW_THROUGH_WIRE_CHECKS
  if (!inferThroughWires) {
    warnings.add(
      Object.freeze({
        code: "connection_inference_skipped",
        message: `Skipped heuristic through-wire inference because ${points.size} candidate points across ${wires.length} wires require ${throughWireCheckCount} checks, above the ${MAX_PREVIEW_THROUGH_WIRE_CHECKS}-check ceiling`,
        streamPath,
        offset: null,
      }),
      "connection-inference-skipped",
    )
  }

  const result: OrcadSchematicPreviewConnectionPoint[] = []
  for (const point of points.values()) {
    const throughOrders: number[] = []
    if (inferThroughWires) {
      for (const wire of wires) {
        if (isStrictlyInsideSegment(point.position, wire)) {
          throughOrders.push(wire.sourceOrder)
        }
      }
    }
    const endpointOrders = [...point.wireEndpointSourceOrders].sort(
      (left, right) => left - right,
    )
    result.push(
      Object.freeze({
        position: point.position,
        wireEndpointSourceOrders: Object.freeze(endpointOrders),
        wireThroughSourceOrders: Object.freeze(throughOrders),
        aliasNames: Object.freeze([...point.aliasNames]),
        netSymbolDatabaseIds: Object.freeze([...point.netSymbolDatabaseIds]),
        isJunctionCandidate: endpointOrders.length + throughOrders.length >= 3,
      }),
    )
  }
  result.sort(
    (left, right) =>
      left.position.y - right.position.y || left.position.x - right.position.x,
  )
  return Object.freeze(result)
}

function isStrictlyInsideSegment(
  point: OrcadSchematicPreviewPoint,
  wire: OrcadSchematicPreviewWire,
): boolean {
  if (
    pointKey(point) === pointKey(wire.start) ||
    pointKey(point) === pointKey(wire.end)
  ) {
    return false
  }
  const deltaX = wire.end.x - wire.start.x
  const deltaY = wire.end.y - wire.start.y
  const relativeX = point.x - wire.start.x
  const relativeY = point.y - wire.start.y
  if (
    toExactCoordinate(relativeX) * toExactCoordinate(deltaY) !==
    toExactCoordinate(relativeY) * toExactCoordinate(deltaX)
  ) {
    return false
  }
  return (
    point.x >= Math.min(wire.start.x, wire.end.x) &&
    point.x <= Math.max(wire.start.x, wire.end.x) &&
    point.y >= Math.min(wire.start.y, wire.end.y) &&
    point.y <= Math.max(wire.start.y, wire.end.y)
  )
}

function toExactCoordinate(value: number): bigint {
  // Parsed coordinates are integers; inferred edge midpoints can be half-units.
  // Scaling by two retains both forms exactly before BigInt multiplication.
  const doubled = value * 2
  if (!Number.isSafeInteger(doubled)) {
    throw new TypeError(
      `Preview coordinate is not an exact half-integer: ${value}`,
    )
  }
  return BigInt(doubled)
}

function pointKey(point: OrcadSchematicPreviewPoint): string {
  return `${point.x},${point.y}`
}
