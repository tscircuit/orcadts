import { OrcadNode } from "../base/orcad-node"
import {
  classifyOrcadFileHint,
  type OrcadFileHint,
} from "../file-hints/classify-orcad-file-hint"
import { OrcadRawNode } from "../nodes/orcad-raw-node"

export interface OrcadRawDocumentInit {
  readonly bytes: Uint8Array
  readonly fileName?: string | undefined
}

/**
 * Lossless storage for an OrCAD-family file that has not been semantically
 * decoded. This is preservation, not proof that the source is a valid file.
 */
export class OrcadRawDocument extends OrcadNode {
  override readonly type = "orcad_raw_document"
  readonly fileName: string | null
  readonly hint: OrcadFileHint
  readonly source: OrcadRawNode

  constructor({ bytes, fileName }: OrcadRawDocumentInit) {
    super()
    this.fileName = fileName ?? null
    this.hint = classifyOrcadFileHint({ fileName })
    this.source = new OrcadRawNode({ bytes })
  }

  get byteLength(): number {
    return this.source.byteLength
  }

  override getChildren(): readonly OrcadNode[] {
    return [this.source]
  }

  getBytes(): Uint8Array {
    return this.source.getBytes()
  }
}
