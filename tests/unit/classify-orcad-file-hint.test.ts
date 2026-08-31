import { describe, expect, test } from "bun:test"
import { classifyOrcadFileHint } from "../../lib"

describe("classifyOrcadFileHint", () => {
  test("classifies OrCAD Capture project and library extensions", () => {
    expect(classifyOrcadFileHint({ fileName: "board.OPJ" })).toEqual({
      format: "opj",
      family: "orcad_capture",
      fileKind: "project",
      extension: ".opj",
      confidence: "extension_only",
      ambiguities: [],
    })

    expect(
      classifyOrcadFileHint({ fileName: String.raw`C:\project\symbols.OLB` }),
    ).toEqual({
      format: "olb",
      family: "orcad_capture",
      fileKind: "symbol_library",
      extension: ".olb",
      confidence: "extension_only",
      ambiguities: [],
    })
  })

  test("marks .dsn as ambiguous with Specctra", () => {
    expect(classifyOrcadFileHint({ fileName: "cpu.dsn" })).toEqual({
      format: "dsn",
      family: "orcad_capture",
      fileKind: "schematic",
      extension: ".dsn",
      confidence: "extension_only",
      ambiguities: ["specctra_dsn"],
    })
  })

  test("does not claim confidence for unknown or missing extensions", () => {
    expect(classifyOrcadFileHint({ fileName: "layout.brd" })).toEqual({
      format: "unknown",
      family: "unknown",
      fileKind: "unknown",
      extension: ".brd",
      confidence: "none",
      ambiguities: [],
    })

    expect(classifyOrcadFileHint({})).toEqual({
      format: "unknown",
      family: "unknown",
      fileKind: "unknown",
      extension: null,
      confidence: "none",
      ambiguities: [],
    })
  })

  test("deep-freezes known and unknown classifier results", () => {
    const knownHint = classifyOrcadFileHint({ fileName: "cpu.dsn" })
    const unknownHint = classifyOrcadFileHint({ fileName: "layout.brd" })

    expect(Object.isFrozen(knownHint)).toBe(true)
    expect(Object.isFrozen(knownHint.ambiguities)).toBe(true)
    expect(Object.isFrozen(unknownHint)).toBe(true)
    expect(Object.isFrozen(unknownHint.ambiguities)).toBe(true)
  })

  test("classifies by the final extension of a multi-dot filename", () => {
    expect(classifyOrcadFileHint({ fileName: "my.board.dsn" })).toEqual({
      format: "dsn",
      family: "orcad_capture",
      fileKind: "schematic",
      extension: ".dsn",
      confidence: "extension_only",
      ambiguities: ["specctra_dsn"],
    })

    expect(classifyOrcadFileHint({ fileName: "archive.OPJ.bak" })).toEqual({
      format: "unknown",
      family: "unknown",
      fileKind: "unknown",
      extension: ".bak",
      confidence: "none",
      ambiguities: [],
    })
  })

  test("handles POSIX-style paths", () => {
    expect(
      classifyOrcadFileHint({ fileName: "/home/user/design.opj" }),
    ).toEqual({
      format: "opj",
      family: "orcad_capture",
      fileKind: "project",
      extension: ".opj",
      confidence: "extension_only",
      ambiguities: [],
    })
  })

  test("reports no extension for names lacking a usable one", () => {
    for (const fileName of ["README", "board.", ""]) {
      expect(classifyOrcadFileHint({ fileName })).toEqual({
        format: "unknown",
        family: "unknown",
        fileKind: "unknown",
        extension: null,
        confidence: "none",
        ambiguities: [],
      })
    }
  })
})
