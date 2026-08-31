import { UnsupportedOrcadSemanticParseError } from "../errors/unsupported-orcad-semantic-parse-error"
import { classifyOrcadFileHint } from "../file-hints/classify-orcad-file-hint"

export interface ParseOrcadFileInput {
  readonly bytes: Uint8Array
  readonly fileName?: string | undefined
}

/**
 * Reserved semantic parser entrypoint.
 *
 * v0 refuses the operation rather than returning a raw wrapper that callers
 * could mistake for a decoded or validated document.
 */
export function parseOrcadFile({
  bytes,
  fileName,
}: ParseOrcadFileInput): never {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("parseOrcadFile bytes must be a Uint8Array")
  }
  throw new UnsupportedOrcadSemanticParseError({
    byteLength: bytes.byteLength,
    fileName,
    hint: classifyOrcadFileHint({ fileName }),
  })
}
