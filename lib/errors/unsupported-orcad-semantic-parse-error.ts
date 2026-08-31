import type { OrcadFileHint } from "../file-hints/classify-orcad-file-hint"

export interface UnsupportedOrcadSemanticParseErrorInit {
  readonly byteLength: number
  readonly fileName?: string | undefined
  readonly hint: OrcadFileHint
}

function describeFileHint(hint: OrcadFileHint): string {
  if (hint.confidence === "none") {
    return "The filename does not identify a supported OrCAD Capture extension."
  }

  const ambiguityMessage = hint.ambiguities.includes("specctra_dsn")
    ? " The .dsn extension is also used by Specctra; dsnts owns that format."
    : ""

  return `The ${hint.extension} classification is based on the filename extension only.${ambiguityMessage}`
}

export class UnsupportedOrcadSemanticParseError extends Error {
  override readonly name = "UnsupportedOrcadSemanticParseError"
  readonly code = "unsupported_orcad_semantic_parse"
  readonly byteLength: number
  readonly fileName: string | null
  readonly hint: OrcadFileHint

  constructor({
    byteLength,
    fileName,
    hint,
  }: UnsupportedOrcadSemanticParseErrorInit) {
    const subject = fileName
      ? `OrCAD file ${JSON.stringify(fileName)}`
      : "OrCAD input"
    super(
      `orcadts v0 cannot semantically parse ${subject} (${byteLength} bytes). ${describeFileHint(hint)} Use OrcadRawDocument to retain an exact opaque byte copy without claiming validation.`,
    )
    this.byteLength = byteLength
    this.fileName = fileName ?? null
    this.hint = hint
  }
}
