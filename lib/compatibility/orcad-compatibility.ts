import type {
  OrcadCaptureFileExtension,
  OrcadCaptureFileFormat,
  OrcadCaptureFileKind,
  OrcadFileHintAmbiguity,
} from "../file-hints/classify-orcad-file-hint"

export type OrcadCompatibilityOperation =
  | "extension_hint"
  | "opaque_byte_preservation"
  | "semantic_parse"
  | "semantic_write"
  | "cadence_reopen"

export type OrcadCompatibilityLevel =
  | "extension_only"
  | "exact_copy"
  | "unsupported"
  | "not_verified"

export interface OrcadCompatibilityOperations {
  readonly extension_hint: "extension_only"
  readonly opaque_byte_preservation: "exact_copy"
  readonly semantic_parse: "unsupported"
  readonly semantic_write: "unsupported"
  readonly cadence_reopen: "not_verified"
}

export interface OrcadCompatibilityEntry {
  readonly format: OrcadCaptureFileFormat
  readonly extension: OrcadCaptureFileExtension
  readonly family: "orcad_capture"
  readonly fileKind: Exclude<OrcadCaptureFileKind, "unknown">
  readonly representation: "opaque"
  readonly ambiguities: readonly OrcadFileHintAmbiguity[]
  readonly operations: OrcadCompatibilityOperations
  readonly notes: readonly string[]
}

export interface GetOrcadCompatibilityInput {
  readonly extension: string
}

export interface GetOrcadCompatibilityLevelInput {
  readonly extension: string
  readonly operation: OrcadCompatibilityOperation
}

const V0_OPERATIONS: OrcadCompatibilityOperations = Object.freeze({
  extension_hint: "extension_only",
  opaque_byte_preservation: "exact_copy",
  semantic_parse: "unsupported",
  semantic_write: "unsupported",
  cadence_reopen: "not_verified",
})

function createCompatibilityEntry({
  format,
  fileKind,
  extension,
  ambiguities,
  notes,
}: Omit<
  OrcadCompatibilityEntry,
  "family" | "operations" | "representation"
>): OrcadCompatibilityEntry {
  return Object.freeze({
    format,
    extension,
    family: "orcad_capture",
    fileKind,
    representation: "opaque",
    ambiguities: Object.freeze([...ambiguities]),
    operations: V0_OPERATIONS,
    notes: Object.freeze([...notes]),
  })
}

export const orcadCompatibilityManifest: readonly OrcadCompatibilityEntry[] =
  Object.freeze([
    createCompatibilityEntry({
      format: "opj",
      fileKind: "project",
      extension: ".opj",
      ambiguities: [],
      notes: [
        "The extension is associated with OrCAD Capture projects; bytes are not decoded or validated.",
      ],
    }),
    createCompatibilityEntry({
      format: "dsn",
      fileKind: "schematic",
      extension: ".dsn",
      ambiguities: ["specctra_dsn"],
      notes: [
        "The .dsn extension is ambiguous: OrCAD Capture schematics belong here, while Specctra DSN belongs in dsnts.",
        "Extension-only classification must not be treated as authoritative format detection.",
      ],
    }),
    createCompatibilityEntry({
      format: "olb",
      fileKind: "symbol_library",
      extension: ".olb",
      ambiguities: [],
      notes: [
        "The extension is associated with OrCAD Capture symbol libraries; bytes are not decoded or validated.",
      ],
    }),
  ])

function normalizeExtension(extension: string): string {
  const normalizedExtension = extension.trim().toLowerCase()
  if (normalizedExtension.length === 0 || normalizedExtension.startsWith(".")) {
    return normalizedExtension
  }
  return `.${normalizedExtension}`
}

export function getOrcadCompatibility({
  extension,
}: GetOrcadCompatibilityInput): OrcadCompatibilityEntry | undefined {
  const normalizedExtension = normalizeExtension(extension)
  return orcadCompatibilityManifest.find(
    (entry) => entry.extension === normalizedExtension,
  )
}

export function getOrcadCompatibilityLevel({
  extension,
  operation,
}: GetOrcadCompatibilityLevelInput): OrcadCompatibilityLevel | undefined {
  return getOrcadCompatibility({ extension })?.operations[operation]
}
