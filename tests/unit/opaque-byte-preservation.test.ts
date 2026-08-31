import { describe, expect, test } from "bun:test"
import { OrcadRawDocument, OrcadRawNode } from "../../lib"

describe("opaque byte preservation", () => {
  test("OrcadRawNode rejects non-byte input at the JavaScript boundary", () => {
    expect(
      () =>
        new OrcadRawNode({
          // @ts-expect-error Runtime validation protects untyped callers.
          bytes: "not bytes",
        }),
    ).toThrow(TypeError)
  })

  test("OrcadRawNode copies its input and every output", () => {
    const sourceBytes = Uint8Array.of(0x00, 0x10, 0x7f, 0x80, 0xff)
    const expectedBytes = Uint8Array.from(sourceBytes)
    const node = new OrcadRawNode({ bytes: sourceBytes })

    sourceBytes[0] = 0xaa
    const firstOutput = node.getBytes()
    firstOutput[1] = 0xbb

    expect(node.byteLength).toBe(expectedBytes.byteLength)
    expect(node.getChildren()).toEqual([])
    expect(Array.from(node.getBytes())).toEqual(Array.from(expectedBytes))
    expect(node.getBytes()).not.toBe(node.getBytes())
  })

  test("OrcadRawDocument returns an exact copy of arbitrary bytes", () => {
    const sourceBytes = Uint8Array.of(0xde, 0xad, 0x00, 0xbe, 0xef)
    const expectedBytes = Uint8Array.from(sourceBytes)
    const document = new OrcadRawDocument({
      bytes: sourceBytes,
      fileName: "design.DSN",
    })

    sourceBytes.fill(0)
    const firstOutput = document.getBytes()
    firstOutput.fill(0xff)

    expect(document.type).toBe("orcad_raw_document")
    expect(document.byteLength).toBe(expectedBytes.byteLength)
    expect(document.getChildren()).toEqual([document.source])
    expect(document.hint.confidence).toBe("extension_only")
    expect(Array.from(document.getBytes())).toEqual(Array.from(expectedBytes))
    expect(document.getBytes()).not.toBe(document.getBytes())
  })
})
