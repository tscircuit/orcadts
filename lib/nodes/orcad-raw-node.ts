import { OrcadNode } from "../base/orcad-node"

export interface OrcadRawNodeInit {
  readonly bytes: Uint8Array
}

/**
 * An opaque source fragment whose internal structure is not yet understood.
 *
 * The constructor and every byte-returning method make defensive copies. This
 * keeps unknown source bytes available as an exact opaque copy.
 */
export class OrcadRawNode extends OrcadNode {
  override readonly type = "orcad_raw_node"
  readonly byteLength: number

  readonly #sourceBytes: Uint8Array

  constructor({ bytes }: OrcadRawNodeInit) {
    super()
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError("OrcadRawNode bytes must be a Uint8Array")
    }
    this.#sourceBytes = Uint8Array.from(bytes)
    this.byteLength = this.#sourceBytes.byteLength
  }

  override getChildren(): readonly OrcadNode[] {
    return []
  }

  getBytes(): Uint8Array {
    return Uint8Array.from(this.#sourceBytes)
  }
}
