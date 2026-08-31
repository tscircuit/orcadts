import { describe, expect, test } from "bun:test"
import { PreviewBinaryReader } from "../../lib/preview/preview-binary-reader"
import {
  MAX_PREVIEW_LIBRARY_ALIASES,
  MAX_PREVIEW_LIBRARY_STRING_BYTES,
  MAX_PREVIEW_LIBRARY_STRINGS,
  parsePreviewLibrary,
} from "../../lib/preview/preview-library-parser"
import type { OrcadSchematicPreviewComponent } from "../../lib/preview/preview-nodes"
import {
  computePreviewContentBounds,
  MAX_PREVIEW_THROUGH_WIRE_CHECKS,
  parsePreviewPage,
} from "../../lib/preview/preview-page-parser"
import {
  MAX_PREVIEW_PAGE_NODES,
  MAX_PREVIEW_PAGE_PROPERTIES,
  MAX_PREVIEW_PROPERTIES_PER_RECORD,
  MAX_PREVIEW_RECORD_CHILDREN,
  MAX_PREVIEW_WARNINGS_PER_PAGE,
  PreviewPageBudget,
  PreviewWarningCollector,
  readPreviewPageRecordHeader,
  readPreviewWire,
} from "../../lib/preview/preview-record-reader"
import type {
  OrcadSchematicPreviewWarning,
  OrcadSchematicPreviewWarningCode,
} from "../../lib/preview/preview-types"

const PAGE_STRUCTURE = 0x0a
const WIRE_STRUCTURE = 0x14
const PAGE_SETTINGS_BYTE_LENGTH = 156
const MANDATORY_PAGE_TAIL_COUNT_BYTES = 10

class TestByteWriter {
  readonly #bytes: number[] = []

  get byteLength(): number {
    return this.#bytes.length
  }

  uint8(value: number): this {
    this.#bytes.push(value & 0xff)
    return this
  }

  int16(value: number): this {
    return this.uint16(value < 0 ? value + 0x1_0000 : value)
  }

  uint16(value: number): this {
    this.#bytes.push(value & 0xff, (value >>> 8) & 0xff)
    return this
  }

  int32(value: number): this {
    return this.uint32(value >>> 0)
  }

  uint32(value: number): this {
    this.#bytes.push(
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    )
    return this
  }

  append(bytes: Uint8Array | readonly number[]): this {
    this.#bytes.push(...bytes)
    return this
  }

  zeroes(count: number): this {
    for (let index = 0; index < count; index += 1) this.#bytes.push(0)
    return this
  }

  lengthPrefixedString(value: string): this {
    const bytes = new TextEncoder().encode(value)
    this.uint16(bytes.byteLength).append(bytes).uint8(0)
    return this
  }

  fixedNullTerminatedString(value: string, byteLength: number): this {
    const bytes = new TextEncoder().encode(value)
    if (bytes.byteLength >= byteLength) {
      throw new Error(`Test string does not fit in ${byteLength} bytes`)
    }
    this.append(bytes).zeroes(byteLength - bytes.byteLength)
    return this
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.#bytes)
  }
}

function makeFramedRecord(input: {
  readonly body?: Uint8Array | undefined
  readonly propertyCount?: number | undefined
  readonly propertyPairAt?:
    | ((index: number) => readonly [number, number])
    | undefined
  readonly structureType: number
}): Uint8Array {
  const body = input.body ?? new Uint8Array(0)
  const propertyCount = input.propertyCount ?? -1
  const pairCount = Math.max(0, propertyCount)
  const headerByteLength = 21 + pairCount * 8
  const recordByteLength = headerByteLength + body.byteLength
  const writer = new TestByteWriter()

  writer
    .uint8(input.structureType)
    .uint32(recordByteLength - 9)
    .uint32(0)
    .uint8(input.structureType)
    .uint32(headerByteLength - 18)
    .uint32(0)
    .uint8(input.structureType)
    .int16(propertyCount)
  for (let index = 0; index < pairCount; index += 1) {
    const [nameIndex, valueIndex] = input.propertyPairAt?.(index) ?? [0, 0]
    writer.uint32(nameIndex).uint32(valueIndex)
  }
  return writer.append(body).toUint8Array()
}

function makeLibrary(input: {
  readonly aliasCount?: number | undefined
  readonly countByteLength: 2 | 4
  readonly stringCount?: number | undefined
}): Uint8Array {
  const stringCount = input.stringCount ?? 0
  const aliasCount = input.aliasCount ?? 0
  const writer = new TestByteWriter()

  writer
    .fixedNullTerminatedString("OrCAD Windows Design", 32)
    .uint16(17)
    .uint16(4)
    .zeroes(8)
    .uint32(0)
    .uint16(1)
    .uint16(24)
    .zeroes(48)
    .zeroes(8)
  for (let index = 0; index < 8; index += 1) {
    writer.lengthPrefixedString("")
  }
  writer.zeroes(PAGE_SETTINGS_BYTE_LENGTH)
  if (input.countByteLength === 2) writer.uint16(stringCount)
  else writer.uint32(stringCount)
  for (let index = 0; index < stringCount; index += 1) {
    writer.lengthPrefixedString("")
  }
  writer.uint16(aliasCount)
  for (let index = 0; index < aliasCount; index += 1) {
    writer.lengthPrefixedString("").lengthPrefixedString("")
  }
  return writer.uint32(0).uint32(0).lengthPrefixedString("").toUint8Array()
}

function makeLibraryWithRepeatedStrings(input: {
  readonly count: number
  readonly stringByteLength: number
}): Uint8Array {
  const prefixWriter = new TestByteWriter()
  prefixWriter
    .fixedNullTerminatedString("OrCAD Windows Design", 32)
    .uint16(17)
    .uint16(4)
    .zeroes(8)
    .uint32(0)
    .uint16(1)
    .uint16(24)
    .zeroes(48)
    .zeroes(8)
  for (let index = 0; index < 8; index += 1) {
    prefixWriter.lengthPrefixedString("")
  }
  const prefix = prefixWriter
    .zeroes(PAGE_SETTINGS_BYTE_LENGTH)
    .uint32(input.count)
    .toUint8Array()
  const encodedStringByteLength = input.stringByteLength + 3
  const designTrailerByteLength = 2 + 4 + 4 + 3
  const bytes = new Uint8Array(
    prefix.byteLength +
      input.count * encodedStringByteLength +
      designTrailerByteLength,
  )
  bytes.set(prefix)
  const view = new DataView(bytes.buffer)
  let offset = prefix.byteLength
  for (let index = 0; index < input.count; index += 1) {
    view.setUint16(offset, input.stringByteLength, true)
    offset += 2
    bytes.fill(1, offset, offset + input.stringByteLength)
    offset += input.stringByteLength + 1
  }
  return bytes
}

interface TestWireCoordinates {
  readonly endX: number
  readonly endY: number
  readonly startX: number
  readonly startY: number
}

function makeWire(input: TestWireCoordinates): Uint8Array {
  const body = new TestByteWriter()
    .uint32(0)
    .uint32(0)
    .uint32(0)
    .int32(input.startX)
    .int32(input.startY)
    .int32(input.endX)
    .int32(input.endY)
    .uint8(0)
    .uint16(0)
    .uint16(0)
    .uint32(0)
    .uint32(0)
    .toUint8Array()
  return makeFramedRecord({ body, structureType: WIRE_STRUCTURE })
}

function makeWireEndingAtChildCount(childCount: number): Uint8Array {
  const body = new TestByteWriter()
    .uint32(0)
    .uint32(0)
    .uint32(0)
    .int32(0)
    .int32(0)
    .int32(1)
    .int32(1)
    .uint8(0)
    .uint16(childCount)
    .toUint8Array()
  return makeFramedRecord({ body, structureType: WIRE_STRUCTURE })
}

function makePage(
  input: {
    readonly tail?: Uint8Array | undefined
    readonly wires?: readonly Uint8Array[] | undefined
  } = {},
): Uint8Array {
  const wires = input.wires ?? []
  const settings = new Uint8Array(PAGE_SETTINGS_BYTE_LENGTH)
  const settingsView = new DataView(settings.buffer)
  settingsView.setUint32(24, 1_000, true)
  settingsView.setUint32(28, 800, true)

  const body = new TestByteWriter()
    .lengthPrefixedString("PAGE1")
    .lengthPrefixedString("A")
    .append(settings)
    .uint16(0)
    .uint16(0)
    .uint16(0)
    .uint16(0)
    .uint16(wires.length)
  for (const wire of wires) body.append(wire)
  body
    .uint16(0)
    .uint16(0)
    .uint16(0)
    .uint16(0)
    .append(input.tail ?? new Uint8Array(MANDATORY_PAGE_TAIL_COUNT_BYTES))
  return makeFramedRecord({ body: body.toUint8Array(), structureType: 0x0a })
}

function parsePage(bytes: Uint8Array) {
  return parsePreviewPage({
    bytes,
    streamPath: "Views/SCHEMATIC1/Pages/PAGE1",
    strings: [],
    viewName: "SCHEMATIC1",
  })
}

function warningCodes(
  warnings: readonly OrcadSchematicPreviewWarning[],
): readonly OrcadSchematicPreviewWarningCode[] {
  return warnings.map((warning) => warning.code)
}

describe("Preview parser resource ceilings", () => {
  test("rejects a Library string count above the ceiling before decoding entries", () => {
    const stringCount = MAX_PREVIEW_LIBRARY_STRINGS + 1
    const bytes = makeLibrary({ countByteLength: 4, stringCount })

    expect(() => parsePreviewLibrary({ bytes, streamPath: "Library" })).toThrow(
      new RegExp(`string count ${stringCount}.*ceiling`, "u"),
    )
  })

  test("rejects a Library alias count above the ceiling before decoding pairs", () => {
    const aliasCount = MAX_PREVIEW_LIBRARY_ALIASES + 1
    const bytes = makeLibrary({ aliasCount, countByteLength: 2 })

    expect(() => parsePreviewLibrary({ bytes, streamPath: "Library" })).toThrow(
      new RegExp(`alias count ${aliasCount}.*ceiling`, "u"),
    )
  })

  test("rejects cumulative Library string bytes before decoded-value allocation", () => {
    const stringByteLength = 3_499
    const count =
      Math.floor(MAX_PREVIEW_LIBRARY_STRING_BYTES / stringByteLength) + 1
    const bytes = makeLibraryWithRepeatedStrings({ count, stringByteLength })

    expect(() => parsePreviewLibrary({ bytes, streamPath: "Library" })).toThrow(
      /cumulative Library string ceiling/u,
    )
  })

  test("rejects per-record property and child counts above their ceilings", () => {
    const propertyCount = MAX_PREVIEW_PROPERTIES_PER_RECORD + 1
    const propertyRecord = makeFramedRecord({
      propertyCount,
      structureType: PAGE_STRUCTURE,
    })
    const propertyReader = new PreviewBinaryReader({
      bytes: propertyRecord,
      streamPath: "property-record",
    })
    expect(() =>
      readPreviewPageRecordHeader(propertyReader, {
        budget: new PreviewPageBudget(),
        streamPath: propertyReader.streamPath,
        strings: [""],
        warnings: new PreviewWarningCollector(),
      }),
    ).toThrow(new RegExp(`property count ${propertyCount}.*ceiling`, "u"))

    const childCount = MAX_PREVIEW_RECORD_CHILDREN + 1
    const childReader = new PreviewBinaryReader({
      bytes: makeWireEndingAtChildCount(childCount),
      streamPath: "child-record",
    })
    expect(() =>
      readPreviewWire({
        context: {
          budget: new PreviewPageBudget(),
          streamPath: childReader.streamPath,
          strings: [],
          warnings: new PreviewWarningCollector(),
        },
        reader: childReader,
        sourceOrder: 0,
      }),
    ).toThrow(new RegExp(`wire alias count ${childCount}.*ceiling`, "u"))

    const truncatedChildReader = new PreviewBinaryReader({
      bytes: makeWireEndingAtChildCount(1),
      streamPath: "truncated-child-record",
    })
    expect(() =>
      readPreviewWire({
        context: {
          budget: new PreviewPageBudget(),
          streamPath: truncatedChildReader.streamPath,
          strings: [],
          warnings: new PreviewWarningCollector(),
        },
        reader: truncatedChildReader,
        sourceOrder: 0,
      }),
    ).toThrow(/wire alias count 1 cannot fit in the enclosing record/u)
  })

  test("enforces cumulative Page node and property budgets", () => {
    const reader = new PreviewBinaryReader({
      bytes: new Uint8Array(0),
      streamPath: "budget",
    })
    const nodeBudget = new PreviewPageBudget()
    nodeBudget.consumeNodes(reader, MAX_PREVIEW_PAGE_NODES, "test nodes", 0)
    expect(() => nodeBudget.consumeNodes(reader, 1, "test nodes", 0)).toThrow(
      /remaining cumulative Page node budget of 0/u,
    )

    const propertyBudget = new PreviewPageBudget()
    for (
      let consumed = 0;
      consumed < MAX_PREVIEW_PAGE_PROPERTIES;
      consumed += MAX_PREVIEW_PROPERTIES_PER_RECORD
    ) {
      propertyBudget.consumeProperties(
        reader,
        MAX_PREVIEW_PROPERTIES_PER_RECORD,
        0,
      )
    }
    expect(() => propertyBudget.consumeProperties(reader, 1, 0)).toThrow(
      /remaining cumulative Page property budget of 0/u,
    )
  })

  test("caps distinct string-index diagnostics and records suppression", () => {
    const warnings = new PreviewWarningCollector()
    const propertyCount = Math.ceil(MAX_PREVIEW_WARNINGS_PER_PAGE / 2) + 1
    const reader = new PreviewBinaryReader({
      bytes: makeFramedRecord({
        propertyCount,
        propertyPairAt: (index) => [index * 2 + 1, index * 2 + 2],
        structureType: PAGE_STRUCTURE,
      }),
      streamPath: "warning-record",
    })

    const header = readPreviewPageRecordHeader(reader, {
      budget: new PreviewPageBudget(),
      streamPath: reader.streamPath,
      strings: [],
      warnings,
    })
    const warningSnapshot = warnings.snapshot()

    expect(header.properties).toHaveLength(propertyCount)
    expect(warningSnapshot).toHaveLength(MAX_PREVIEW_WARNINGS_PER_PAGE)
    expect(
      warningCodes(warningSnapshot).filter(
        (code) => code === "warning_limit_reached",
      ),
    ).toHaveLength(1)
    expect(warningSnapshot.at(-1)?.code).toBe("warning_limit_reached")
  })
})

describe("Preview Page structural hardening", () => {
  test("rejects every zero-through-nine-byte truncation of the mandatory trailing counts", () => {
    for (
      let tailByteLength = 0;
      tailByteLength < MANDATORY_PAGE_TAIL_COUNT_BYTES;
      tailByteLength += 1
    ) {
      expect(() =>
        parsePage(makePage({ tail: new Uint8Array(tailByteLength) })),
      ).toThrow(/Page tail is truncated.*10 bytes/u)
    }
  })

  test("consumes five zero trailing counts but preserves a nonzero tail conservatively", () => {
    const fullyConsumed = parsePage(makePage())
    expect(fullyConsumed.parsedByteLength).toBe(fullyConsumed.byteLength)
    expect(fullyConsumed.unparsedByteLength).toBe(0)
    expect(warningCodes(fullyConsumed.warnings)).not.toContain(
      "page_tail_not_decoded",
    )

    const nonzeroTail = Uint8Array.of(1, 0, 0xaa, 0xbb, 0xcc, 0xdd, 0, 0, 0, 0)
    const preserved = parsePage(makePage({ tail: nonzeroTail }))
    expect(preserved.unparsedByteLength).toBe(nonzeroTail.byteLength)
    expect(warningCodes(preserved.warnings)).toContain("page_tail_not_decoded")
  })

  test("skips all through-wire inference when its operation budget is exceeded", () => {
    const wireCount =
      Math.floor(Math.sqrt(MAX_PREVIEW_THROUGH_WIRE_CHECKS / 2)) + 1
    const wires = Array.from({ length: wireCount }, (_, index) =>
      makeWire({
        endX: index * 3 + 1,
        endY: 0,
        startX: index * 3,
        startY: 0,
      }),
    )

    const page = parsePage(makePage({ wires }))

    expect(page.connectionPoints).toHaveLength(wireCount * 2)
    expect(
      page.connectionPoints.every(
        (point) => point.wireEndpointSourceOrders.length === 1,
      ),
    ).toBe(true)
    expect(
      page.connectionPoints.every(
        (point) => point.wireThroughSourceOrders.length === 0,
      ),
    ).toBe(true)
    expect(
      warningCodes(page.warnings).filter(
        (code) => code === "connection_inference_skipped",
      ),
    ).toHaveLength(1)
  })

  test("uses exact orientation for extreme signed-32-bit coordinates", () => {
    const point = { x: 2_147_483_646, y: 2_147_483_645 }
    const page = parsePage(
      makePage({
        wires: [
          makeWire({
            endX: 2_147_483_647,
            endY: 2_147_483_646,
            startX: -2_147_483_648,
            startY: -2_147_483_648,
          }),
          makeWire({
            endX: point.x,
            endY: point.y + 1,
            startX: point.x,
            startY: point.y,
          }),
        ],
      }),
    )

    const connectionPoint = page.connectionPoints.find(
      (candidate) =>
        candidate.position.x === point.x && candidate.position.y === point.y,
    )
    expect(connectionPoint?.wireEndpointSourceOrders).toEqual([1])
    expect(connectionPoint?.wireThroughSourceOrders).toEqual([])
  })

  test("computes bounds for more points than a safe function-call argument list", () => {
    const sharedComponent = {
      position: { x: -2_147_483_648, y: 2_147_483_647 },
    } as unknown as OrcadSchematicPreviewComponent
    const components = new Array<OrcadSchematicPreviewComponent>(800_001).fill(
      sharedComponent,
    )

    expect(
      computePreviewContentBounds([], components, [], {
        height: 800,
        width: 1_000,
      }),
    ).toEqual({
      maxX: -2_147_483_648,
      maxY: 2_147_483_647,
      minX: -2_147_483_648,
      minY: 2_147_483_647,
    })
  })
})
