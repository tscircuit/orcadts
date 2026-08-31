import { describe, expect, test } from "bun:test"
import { parseOrcadFile, UnsupportedOrcadSemanticParseError } from "../../lib"

describe("parseOrcadFile", () => {
  test("rejects non-byte input at the JavaScript boundary", () => {
    expect(() =>
      parseOrcadFile({
        // @ts-expect-error Runtime validation protects untyped callers.
        bytes: "not bytes",
        fileName: "example.dsn",
      }),
    ).toThrow(TypeError)
  })

  test("refuses to imply semantic support", () => {
    try {
      parseOrcadFile({
        bytes: Uint8Array.of(1, 2, 3),
        fileName: "example.dsn",
      })
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedOrcadSemanticParseError)
      if (!(error instanceof UnsupportedOrcadSemanticParseError)) throw error

      expect(error.code).toBe("unsupported_orcad_semantic_parse")
      expect(error.byteLength).toBe(3)
      expect(error.hint.ambiguities).toContain("specctra_dsn")
      expect(error.message).toContain("extension only")
      expect(error.message).toContain("dsnts")
      expect(error.message).toContain("OrcadRawDocument")
      return
    }

    throw new Error("Expected semantic parsing to be refused")
  })
})
