import { OrcadNode } from "../base/orcad-node"
import type {
  OrcadSchematicPreviewAttachmentCandidate,
  OrcadSchematicPreviewBounds,
  OrcadSchematicPreviewComponentValueSource,
  OrcadSchematicPreviewConnectionPoint,
  OrcadSchematicPreviewDisplayProperty,
  OrcadSchematicPreviewLibraryInfo,
  OrcadSchematicPreviewLimitation,
  OrcadSchematicPreviewNetAlias,
  OrcadSchematicPreviewNetNameEntry,
  OrcadSchematicPreviewNetSymbolKind,
  OrcadSchematicPreviewPoint,
  OrcadSchematicPreviewProperty,
  OrcadSchematicPreviewWarning,
  OrcadSchematicPreviewWireKind,
} from "./preview-types"

export interface OrcadSchematicPreviewT0x10RecordInit {
  readonly sourceOrder: number
  readonly opaqueUint16: number
  readonly position: OrcadSchematicPreviewPoint
  readonly opaqueUint32A: number
  readonly opaqueUint32B: number
  readonly properties: readonly OrcadSchematicPreviewProperty[]
  readonly displayProperties: readonly OrcadSchematicPreviewDisplayProperty[]
}

export class OrcadSchematicPreviewT0x10Record extends OrcadNode {
  override readonly type = "orcad_schematic_preview_t0x10_record"
  readonly sourceOrder: number
  readonly opaqueUint16: number
  readonly position: OrcadSchematicPreviewPoint
  readonly opaqueUint32A: number
  readonly opaqueUint32B: number
  readonly properties: readonly OrcadSchematicPreviewProperty[]
  readonly displayProperties: readonly OrcadSchematicPreviewDisplayProperty[]

  constructor(init: OrcadSchematicPreviewT0x10RecordInit) {
    super()
    this.sourceOrder = init.sourceOrder
    this.opaqueUint16 = init.opaqueUint16
    this.position = copyPoint(init.position)
    this.opaqueUint32A = init.opaqueUint32A
    this.opaqueUint32B = init.opaqueUint32B
    this.properties = copyProperties(init.properties)
    this.displayProperties = copyDisplayProperties(init.displayProperties)
  }

  override getChildren(): readonly OrcadNode[] {
    return []
  }
}

export interface OrcadSchematicPreviewComponentInit {
  readonly sourceOrder: number
  readonly packageName: string
  readonly databaseId: number
  readonly reference: string
  readonly position: OrcadSchematicPreviewPoint
  readonly opaqueBeforePackageName: readonly number[]
  readonly opaqueAfterDatabaseId: readonly number[]
  readonly opaqueAfterPosition: readonly number[]
  readonly opaqueAfterDisplayProperties: readonly number[]
  readonly opaqueAfterReference: readonly number[]
  readonly opaqueTrailingString: string
  readonly opaqueAfterTrailingString: readonly number[]
  readonly value: string | null
  readonly valueSource: OrcadSchematicPreviewComponentValueSource
  readonly properties: readonly OrcadSchematicPreviewProperty[]
  readonly displayProperties: readonly OrcadSchematicPreviewDisplayProperty[]
  readonly t0x10Records: readonly OrcadSchematicPreviewT0x10Record[]
}

export class OrcadSchematicPreviewComponent extends OrcadNode {
  override readonly type = "orcad_schematic_preview_component"
  readonly sourceOrder: number
  readonly packageName: string
  readonly databaseId: number
  readonly reference: string
  readonly position: OrcadSchematicPreviewPoint
  readonly opaqueBeforePackageName: readonly number[]
  readonly opaqueAfterDatabaseId: readonly number[]
  readonly opaqueAfterPosition: readonly number[]
  readonly opaqueAfterDisplayProperties: readonly number[]
  readonly opaqueAfterReference: readonly number[]
  readonly opaqueTrailingString: string
  readonly opaqueAfterTrailingString: readonly number[]
  readonly value: string | null
  readonly valueSource: OrcadSchematicPreviewComponentValueSource
  readonly properties: readonly OrcadSchematicPreviewProperty[]
  readonly displayProperties: readonly OrcadSchematicPreviewDisplayProperty[]
  readonly t0x10Records: readonly OrcadSchematicPreviewT0x10Record[]

  constructor(init: OrcadSchematicPreviewComponentInit) {
    super()
    this.sourceOrder = init.sourceOrder
    this.packageName = init.packageName
    this.databaseId = init.databaseId
    this.reference = init.reference
    this.position = copyPoint(init.position)
    this.opaqueBeforePackageName = copyOpaqueBytes(init.opaqueBeforePackageName)
    this.opaqueAfterDatabaseId = copyOpaqueBytes(init.opaqueAfterDatabaseId)
    this.opaqueAfterPosition = copyOpaqueBytes(init.opaqueAfterPosition)
    this.opaqueAfterDisplayProperties = copyOpaqueBytes(
      init.opaqueAfterDisplayProperties,
    )
    this.opaqueAfterReference = copyOpaqueBytes(init.opaqueAfterReference)
    this.opaqueTrailingString = init.opaqueTrailingString
    this.opaqueAfterTrailingString = copyOpaqueBytes(
      init.opaqueAfterTrailingString,
    )
    this.value = init.value
    this.valueSource = init.valueSource
    this.properties = copyProperties(init.properties)
    this.displayProperties = copyDisplayProperties(init.displayProperties)
    this.t0x10Records = Object.freeze([...init.t0x10Records])
  }

  override getChildren(): readonly OrcadNode[] {
    return this.t0x10Records
  }
}

export interface OrcadSchematicPreviewWireInit {
  readonly sourceOrder: number
  readonly kind: OrcadSchematicPreviewWireKind
  readonly opaqueHeaderWords: readonly [number, number]
  readonly color: number
  readonly start: OrcadSchematicPreviewPoint
  readonly end: OrcadSchematicPreviewPoint
  readonly opaqueAfterEndpoints: readonly number[]
  readonly aliases: readonly OrcadSchematicPreviewNetAlias[]
  readonly displayProperties: readonly OrcadSchematicPreviewDisplayProperty[]
  readonly lineWidth: number
  readonly lineStyle: number
}

export class OrcadSchematicPreviewWire extends OrcadNode {
  override readonly type = "orcad_schematic_preview_wire"
  readonly sourceOrder: number
  readonly kind: OrcadSchematicPreviewWireKind
  readonly opaqueHeaderWords: readonly [number, number]
  readonly color: number
  readonly start: OrcadSchematicPreviewPoint
  readonly end: OrcadSchematicPreviewPoint
  readonly opaqueAfterEndpoints: readonly number[]
  readonly aliases: readonly OrcadSchematicPreviewNetAlias[]
  readonly displayProperties: readonly OrcadSchematicPreviewDisplayProperty[]
  readonly lineWidth: number
  readonly lineStyle: number

  constructor(init: OrcadSchematicPreviewWireInit) {
    super()
    this.sourceOrder = init.sourceOrder
    this.kind = init.kind
    this.opaqueHeaderWords = Object.freeze([
      init.opaqueHeaderWords[0],
      init.opaqueHeaderWords[1],
    ]) as readonly [number, number]
    this.color = init.color
    this.start = copyPoint(init.start)
    this.end = copyPoint(init.end)
    this.opaqueAfterEndpoints = copyOpaqueBytes(init.opaqueAfterEndpoints)
    this.aliases = Object.freeze(
      init.aliases.map((alias) =>
        Object.freeze({ ...alias, position: copyPoint(alias.position) }),
      ),
    )
    this.displayProperties = copyDisplayProperties(init.displayProperties)
    this.lineWidth = init.lineWidth
    this.lineStyle = init.lineStyle
  }

  override getChildren(): readonly OrcadNode[] {
    return []
  }
}

export interface OrcadSchematicPreviewNetSymbolInit {
  readonly sourceOrder: number
  readonly kind: OrcadSchematicPreviewNetSymbolKind
  readonly opaqueGraphicHeaderWords: readonly [number, number]
  readonly symbolName: string
  readonly databaseId: number
  readonly position: OrcadSchematicPreviewPoint
  readonly bounds: OrcadSchematicPreviewBounds
  readonly color: number
  readonly opaqueAfterColor: readonly number[]
  readonly opaqueTargetByte: number
  readonly opaqueRecordTrailer: readonly number[]
  readonly opaquePageEntryTrailer: readonly number[]
  readonly properties: readonly OrcadSchematicPreviewProperty[]
  readonly displayProperties: readonly OrcadSchematicPreviewDisplayProperty[]
  readonly attachmentCandidates: readonly OrcadSchematicPreviewAttachmentCandidate[]
}

export class OrcadSchematicPreviewNetSymbol extends OrcadNode {
  override readonly type = "orcad_schematic_preview_net_symbol"
  readonly sourceOrder: number
  readonly kind: OrcadSchematicPreviewNetSymbolKind
  readonly opaqueGraphicHeaderWords: readonly [number, number]
  readonly symbolName: string
  readonly databaseId: number
  readonly position: OrcadSchematicPreviewPoint
  readonly bounds: OrcadSchematicPreviewBounds
  readonly color: number
  readonly opaqueAfterColor: readonly number[]
  readonly opaqueTargetByte: number
  readonly opaqueRecordTrailer: readonly number[]
  readonly opaquePageEntryTrailer: readonly number[]
  readonly properties: readonly OrcadSchematicPreviewProperty[]
  readonly displayProperties: readonly OrcadSchematicPreviewDisplayProperty[]
  readonly attachmentCandidates: readonly OrcadSchematicPreviewAttachmentCandidate[]

  constructor(init: OrcadSchematicPreviewNetSymbolInit) {
    super()
    this.sourceOrder = init.sourceOrder
    this.kind = init.kind
    this.opaqueGraphicHeaderWords = Object.freeze([
      init.opaqueGraphicHeaderWords[0],
      init.opaqueGraphicHeaderWords[1],
    ]) as readonly [number, number]
    this.symbolName = init.symbolName
    this.databaseId = init.databaseId
    this.position = copyPoint(init.position)
    this.bounds = copyBounds(init.bounds)
    this.color = init.color
    this.opaqueAfterColor = copyOpaqueBytes(init.opaqueAfterColor)
    this.opaqueTargetByte = init.opaqueTargetByte
    this.opaqueRecordTrailer = copyOpaqueBytes(init.opaqueRecordTrailer)
    this.opaquePageEntryTrailer = copyOpaqueBytes(init.opaquePageEntryTrailer)
    this.properties = copyProperties(init.properties)
    this.displayProperties = copyDisplayProperties(init.displayProperties)
    this.attachmentCandidates = Object.freeze(
      init.attachmentCandidates.map((candidate) =>
        Object.freeze({
          ...candidate,
          position: copyPoint(candidate.position),
        }),
      ),
    )
  }

  override getChildren(): readonly OrcadNode[] {
    return []
  }
}

export interface OrcadSchematicPreviewPageInit {
  readonly streamPath: string
  readonly viewName: string
  readonly name: string
  readonly pageSizeName: string
  readonly byteLength: number
  readonly parsedByteLength: number
  readonly unparsedByteLength: number
  readonly contentBounds: OrcadSchematicPreviewBounds | null
  readonly netNameTable: readonly OrcadSchematicPreviewNetNameEntry[]
  readonly netAliases: readonly OrcadSchematicPreviewNetAlias[]
  readonly wires: readonly OrcadSchematicPreviewWire[]
  readonly components: readonly OrcadSchematicPreviewComponent[]
  readonly globals: readonly OrcadSchematicPreviewNetSymbol[]
  readonly ports: readonly OrcadSchematicPreviewNetSymbol[]
  readonly offPageConnectors: readonly OrcadSchematicPreviewNetSymbol[]
  readonly connectionPoints: readonly OrcadSchematicPreviewConnectionPoint[]
  readonly warnings: readonly OrcadSchematicPreviewWarning[]
}

export class OrcadSchematicPreviewPage extends OrcadNode {
  override readonly type = "orcad_schematic_preview_page"
  readonly streamPath: string
  readonly viewName: string
  readonly name: string
  readonly pageSizeName: string
  readonly byteLength: number
  readonly parsedByteLength: number
  readonly unparsedByteLength: number
  readonly contentBounds: OrcadSchematicPreviewBounds | null
  readonly netNameTable: readonly OrcadSchematicPreviewNetNameEntry[]
  readonly netAliases: readonly OrcadSchematicPreviewNetAlias[]
  readonly wires: readonly OrcadSchematicPreviewWire[]
  readonly components: readonly OrcadSchematicPreviewComponent[]
  readonly globals: readonly OrcadSchematicPreviewNetSymbol[]
  readonly ports: readonly OrcadSchematicPreviewNetSymbol[]
  readonly offPageConnectors: readonly OrcadSchematicPreviewNetSymbol[]
  readonly connectionPoints: readonly OrcadSchematicPreviewConnectionPoint[]
  readonly warnings: readonly OrcadSchematicPreviewWarning[]

  constructor(init: OrcadSchematicPreviewPageInit) {
    super()
    this.streamPath = init.streamPath
    this.viewName = init.viewName
    this.name = init.name
    this.pageSizeName = init.pageSizeName
    this.byteLength = init.byteLength
    this.parsedByteLength = init.parsedByteLength
    this.unparsedByteLength = init.unparsedByteLength
    this.contentBounds =
      init.contentBounds === null ? null : copyBounds(init.contentBounds)
    this.netNameTable = Object.freeze(
      init.netNameTable.map((entry) => Object.freeze({ ...entry })),
    )
    this.netAliases = Object.freeze(
      init.netAliases.map((alias) =>
        Object.freeze({ ...alias, position: copyPoint(alias.position) }),
      ),
    )
    this.wires = Object.freeze([...init.wires])
    this.components = Object.freeze([...init.components])
    this.globals = Object.freeze([...init.globals])
    this.ports = Object.freeze([...init.ports])
    this.offPageConnectors = Object.freeze([...init.offPageConnectors])
    this.connectionPoints = Object.freeze(
      init.connectionPoints.map(copyConnectionPoint),
    )
    this.warnings = Object.freeze(
      init.warnings.map((warning) => Object.freeze({ ...warning })),
    )
  }

  override getChildren(): readonly OrcadNode[] {
    return [
      ...this.wires,
      ...this.components,
      ...this.globals,
      ...this.ports,
      ...this.offPageConnectors,
    ]
  }
}

export interface OrcadSchematicPreviewDocumentInit {
  readonly fileName: string | null
  readonly byteLength: number
  readonly library: OrcadSchematicPreviewLibraryInfo | null
  readonly pages: readonly OrcadSchematicPreviewPage[]
  readonly warnings: readonly OrcadSchematicPreviewWarning[]
  readonly limitations: readonly OrcadSchematicPreviewLimitation[]
}

export class OrcadSchematicPreviewDocument extends OrcadNode {
  override readonly type = "orcad_schematic_preview_document"
  readonly format = "orcad-capture-dsn-cfb-preview"
  readonly fileName: string | null
  readonly byteLength: number
  readonly library: OrcadSchematicPreviewLibraryInfo | null
  readonly pages: readonly OrcadSchematicPreviewPage[]
  readonly warnings: readonly OrcadSchematicPreviewWarning[]
  readonly limitations: readonly OrcadSchematicPreviewLimitation[]

  constructor(init: OrcadSchematicPreviewDocumentInit) {
    super()
    this.fileName = init.fileName
    this.byteLength = init.byteLength
    this.library =
      init.library === null ? null : Object.freeze({ ...init.library })
    this.pages = Object.freeze([...init.pages])
    this.warnings = Object.freeze(
      init.warnings.map((warning) => Object.freeze({ ...warning })),
    )
    this.limitations = Object.freeze(
      init.limitations.map((limitation) => Object.freeze({ ...limitation })),
    )
  }

  override getChildren(): readonly OrcadNode[] {
    return this.pages
  }
}

/** Short renderer-facing name for the explicitly partial root document. */
export type OrcadDsnPreview = OrcadSchematicPreviewDocument

function copyPoint(
  point: OrcadSchematicPreviewPoint,
): OrcadSchematicPreviewPoint {
  return Object.freeze({ x: point.x, y: point.y })
}

function copyBounds(
  bounds: OrcadSchematicPreviewBounds,
): OrcadSchematicPreviewBounds {
  return Object.freeze({
    minX: bounds.minX,
    minY: bounds.minY,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
  })
}

function copyOpaqueBytes(bytes: readonly number[]): readonly number[] {
  return Object.freeze([...bytes])
}

function copyProperties(
  properties: readonly OrcadSchematicPreviewProperty[],
): readonly OrcadSchematicPreviewProperty[] {
  return Object.freeze(
    properties.map((property) => Object.freeze({ ...property })),
  )
}

function copyDisplayProperties(
  properties: readonly OrcadSchematicPreviewDisplayProperty[],
): readonly OrcadSchematicPreviewDisplayProperty[] {
  return Object.freeze(
    properties.map((property) =>
      Object.freeze({
        ...property,
        offset: copyPoint(property.offset),
        opaqueAfterColor: Object.freeze([
          property.opaqueAfterColor[0],
          property.opaqueAfterColor[1],
        ]) as readonly [number, number],
      }),
    ),
  )
}

function copyConnectionPoint(
  point: OrcadSchematicPreviewConnectionPoint,
): OrcadSchematicPreviewConnectionPoint {
  return Object.freeze({
    ...point,
    position: copyPoint(point.position),
    wireEndpointSourceOrders: Object.freeze([
      ...point.wireEndpointSourceOrders,
    ]),
    wireThroughSourceOrders: Object.freeze([...point.wireThroughSourceOrders]),
    aliasNames: Object.freeze([...point.aliasNames]),
    netSymbolDatabaseIds: Object.freeze([...point.netSymbolDatabaseIds]),
  })
}
