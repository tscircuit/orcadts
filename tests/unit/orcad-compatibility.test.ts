import { describe, expect, test } from "bun:test"
import {
  getOrcadCompatibility,
  getOrcadCompatibilityLevel,
  orcadCompatibilityManifest,
} from "../../lib"

describe("OrCAD compatibility manifest", () => {
  test("reports operation-level support for every in-scope extension", () => {
    expect(orcadCompatibilityManifest.map((entry) => entry.extension)).toEqual([
      ".opj",
      ".dsn",
      ".olb",
    ])

    for (const entry of orcadCompatibilityManifest) {
      expect(entry.representation).toBe("opaque")
      expect(entry.operations.extension_hint).toBe("extension_only")
      expect(entry.operations.opaque_byte_preservation).toBe("exact_copy")
      expect(entry.operations.semantic_parse).toBe("unsupported")
      expect(entry.operations.semantic_write).toBe("unsupported")
      expect(entry.operations.cadence_reopen).toBe("not_verified")
      expect(Object.isFrozen(entry)).toBe(true)
      expect(Object.isFrozen(entry.ambiguities)).toBe(true)
      expect(Object.isFrozen(entry.operations)).toBe(true)
      expect(Object.isFrozen(entry.notes)).toBe(true)
    }
  })

  test("normalizes extension queries and documents DSN ownership", () => {
    const dsnCompatibility = getOrcadCompatibility({ extension: "DSN" })

    expect(dsnCompatibility?.format).toBe("dsn")
    expect(dsnCompatibility?.fileKind).toBe("schematic")
    expect(dsnCompatibility?.ambiguities).toContain("specctra_dsn")
    expect(dsnCompatibility?.notes.join(" ")).toContain("dsnts")
    expect(getOrcadCompatibility({ extension: ".brd" })).toBeUndefined()
  })

  test("returns one level for a requested operation", () => {
    expect(
      getOrcadCompatibilityLevel({
        extension: ".opj",
        operation: "opaque_byte_preservation",
      }),
    ).toBe("exact_copy")
    expect(
      getOrcadCompatibilityLevel({
        extension: ".olb",
        operation: "cadence_reopen",
      }),
    ).toBe("not_verified")
    expect(
      getOrcadCompatibilityLevel({
        extension: ".brd",
        operation: "semantic_parse",
      }),
    ).toBeUndefined()
  })
})
