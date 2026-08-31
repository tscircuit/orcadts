export const orcadCaptureFileFormats = ["opj", "dsn", "olb"] as const

export type OrcadCaptureFileFormat = (typeof orcadCaptureFileFormats)[number]

export type OrcadCaptureFileExtension = `.${OrcadCaptureFileFormat}`

export type OrcadCaptureFileKind =
  | "project"
  | "schematic"
  | "symbol_library"
  | "unknown"

export type OrcadFileHintConfidence = "extension_only" | "none"

export type OrcadFileHintAmbiguity = "specctra_dsn"

export interface OrcadFileHint {
  readonly format: OrcadCaptureFileFormat | "unknown"
  readonly family: "orcad_capture" | "unknown"
  readonly fileKind: OrcadCaptureFileKind
  readonly extension: OrcadCaptureFileExtension | string | null
  readonly confidence: OrcadFileHintConfidence
  readonly ambiguities: readonly OrcadFileHintAmbiguity[]
}

export interface ClassifyOrcadFileHintInput {
  readonly fileName?: string | undefined
}

function getNormalizedExtension(fileName: string | undefined): string | null {
  if (!fileName) return null

  const pathParts = fileName.split(/[\\/]/)
  const baseName = pathParts.at(-1) ?? ""
  const dotIndex = baseName.lastIndexOf(".")

  if (dotIndex < 0 || dotIndex === baseName.length - 1) return null
  return baseName.slice(dotIndex).toLowerCase()
}

function freezeFileHint(fileHint: OrcadFileHint): OrcadFileHint {
  return Object.freeze({
    ...fileHint,
    ambiguities: Object.freeze([...fileHint.ambiguities]),
  })
}

/**
 * Classifies a filename hint only. It never inspects or validates file bytes.
 */
export function classifyOrcadFileHint({
  fileName,
}: ClassifyOrcadFileHintInput): OrcadFileHint {
  const extension = getNormalizedExtension(fileName)

  switch (extension) {
    case ".opj":
      return freezeFileHint({
        format: "opj",
        family: "orcad_capture",
        fileKind: "project",
        extension,
        confidence: "extension_only",
        ambiguities: [],
      })
    case ".dsn":
      return freezeFileHint({
        format: "dsn",
        family: "orcad_capture",
        fileKind: "schematic",
        extension,
        confidence: "extension_only",
        ambiguities: ["specctra_dsn"],
      })
    case ".olb":
      return freezeFileHint({
        format: "olb",
        family: "orcad_capture",
        fileKind: "symbol_library",
        extension,
        confidence: "extension_only",
        ambiguities: [],
      })
    default:
      return freezeFileHint({
        format: "unknown",
        family: "unknown",
        fileKind: "unknown",
        extension,
        confidence: "none",
        ambiguities: [],
      })
  }
}
