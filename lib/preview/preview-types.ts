export interface OrcadSchematicPreviewPoint {
  readonly x: number
  readonly y: number
}

export interface OrcadSchematicPreviewBounds {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

export interface OrcadSchematicPreviewLibraryInfo {
  readonly streamPath: string
  readonly introduction: string
  readonly versionMajor: number
  readonly versionMinor: number
  readonly stringCount: number
}

export interface OrcadSchematicPreviewProperty {
  readonly nameIndex: number
  readonly valueIndex: number
  readonly name: string | null
  readonly value: string | null
}

/**
 * A text/display placement attached to a component, structure-`0x10` record,
 * wire, or net symbol. `offset` is retained in source coordinates; this Preview
 * parser does not claim it is an absolute page position for every OrCAD record
 * variant.
 */
export interface OrcadSchematicPreviewDisplayProperty {
  readonly propertyNameIndex: number
  readonly propertyName: string | null
  readonly text: string | null
  readonly offset: OrcadSchematicPreviewPoint
  readonly fontIndex: number
  readonly rotationQuarterTurns: 0 | 1 | 2 | 3
  readonly color: number
  readonly opaqueAfterColor: readonly [number, number]
  readonly opaqueTrailingByte: number
}

export interface OrcadSchematicPreviewNetNameEntry {
  readonly name: string
  readonly opaqueWord: number
}

export interface OrcadSchematicPreviewNetAlias {
  readonly name: string
  readonly position: OrcadSchematicPreviewPoint
  readonly color: number
  readonly rotation: number
  readonly fontIndex: number
  readonly wireSourceOrder: number
}

export type OrcadSchematicPreviewNetSymbolKind =
  | "global"
  | "port"
  | "off_page_connector"

export type OrcadSchematicPreviewAttachmentReason =
  | "placement_origin"
  | "left_edge_midpoint"
  | "right_edge_midpoint"
  | "top_edge_midpoint"
  | "bottom_edge_midpoint"

export interface OrcadSchematicPreviewAttachmentCandidate {
  readonly position: OrcadSchematicPreviewPoint
  readonly reason: OrcadSchematicPreviewAttachmentReason
}

/**
 * Source coordinates useful when deciding where a renderer may need a
 * junction dot. `isJunctionCandidate` is an explicitly conservative inference,
 * not a decoded OrCAD junction object.
 */
export interface OrcadSchematicPreviewConnectionPoint {
  readonly position: OrcadSchematicPreviewPoint
  readonly wireEndpointSourceOrders: readonly number[]
  readonly wireThroughSourceOrders: readonly number[]
  readonly aliasNames: readonly string[]
  readonly netSymbolDatabaseIds: readonly number[]
  readonly isJunctionCandidate: boolean
}

export type OrcadSchematicPreviewWarningCode =
  | "library_stream_missing"
  | "library_stream_unreadable"
  | "page_stream_unreadable"
  | "page_tail_not_decoded"
  | "string_index_out_of_range"
  | "unknown_page_record_skipped"
  | "connection_inference_skipped"
  | "warning_limit_reached"

export interface OrcadSchematicPreviewWarning {
  readonly code: OrcadSchematicPreviewWarningCode
  readonly message: string
  readonly streamPath: string | null
  readonly offset: number | null
}

export type OrcadSchematicPreviewLimitationCode =
  | "preview_only"
  | "symbol_graphics_not_decoded"
  | "package_pin_mapping_not_decoded"
  | "placement_transform_not_interpreted"
  | "page_tail_not_decoded"
  | "hierarchical_connectivity_not_resolved"
  | "page_order_not_resolved"
  | "record_framing_is_heuristic"

export interface OrcadSchematicPreviewLimitation {
  readonly code: OrcadSchematicPreviewLimitationCode
  readonly message: string
}

export type OrcadSchematicPreviewComponentValueSource =
  | "prefix_property"
  | "unresolved"

export type OrcadSchematicPreviewWireKind = "wire" | "bus"

export interface ParseOrcadDsnPreviewInput {
  readonly bytes: Uint8Array
  readonly fileName?: string | undefined
}
