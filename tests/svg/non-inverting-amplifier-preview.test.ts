import { expect, test } from "bun:test"
import {
  parseOrcadDsnPreview,
  serializeOrcadSchematicPreviewToSvg,
} from "../../lib"
import { expectSvgSnapshot } from "../fixtures/expect-svg-snapshot"
import { readReferenceBytes } from "../fixtures/read-reference"

const fixturePath = "op-amp-circuits/non-inverting-amplifier/NONINVAMP.DSN"

test("reconstructs the MIT OrCAD non-inverting amplifier as an SVG Preview", async () => {
  const bytes = await readReferenceBytes(fixturePath)
  const document = parseOrcadDsnPreview({
    bytes,
    fileName: "NONINVAMP.DSN",
  })

  expect(document.format).toBe("orcad-capture-dsn-cfb-preview")
  expect(document.pages).toHaveLength(1)

  const page = document.pages[0]
  expect(page).toBeDefined()
  if (!page) throw new Error("Fixture has no decoded Preview page")

  expect(page.name).toBe("PAGE1")
  expect(page.wires).toHaveLength(20)
  expect(page.components.map((component) => component.reference)).toEqual([
    "R2",
    "V2",
    "V1",
    "R1",
    "V3",
    "U1",
  ])
  expect(page.components.map((component) => component.value)).toEqual([
    null,
    null,
    null,
    null,
    null,
    null,
  ])
  expect(page.components.map((component) => component.valueSource)).toEqual([
    "unresolved",
    "unresolved",
    "unresolved",
    "unresolved",
    "unresolved",
    "unresolved",
  ])
  expect(
    page.components.every(
      (component) =>
        component.opaqueBeforePackageName.length === 8 &&
        component.opaqueAfterDatabaseId.length === 8 &&
        component.opaqueAfterPosition.length === 4 &&
        component.opaqueAfterDisplayProperties.length === 1 &&
        component.opaqueAfterReference.length === 14 &&
        component.opaqueAfterTrailingString.length === 2,
    ),
  ).toBe(true)
  expect(page.globals.map((global) => global.symbolName)).toEqual([
    "0",
    "0",
    "0",
  ])
  expect(page.netAliases.map((alias) => alias.name)).toEqual([
    "VEE",
    "VCC",
    "VEE",
    "VCC",
  ])
  expect(page.wires[0]?.sourceOrder).toBe(0)
  expect(page.wires[0]?.opaqueHeaderWords).toEqual([114, 702])
  expect(page.wires[0] && "segmentId" in page.wires[0]).toBe(false)
  expect(page.wires.every((wire) => !("databaseNetId" in wire))).toBe(true)
  expect(page.wires.every((wire) => !("netNames" in wire))).toBe(true)
  expect(page.globals.every((global) => !("netName" in global))).toBe(true)
  expect(page.globals[0]?.opaqueGraphicHeaderWords).toEqual([46, 14])
  expect(
    page.components.every((component) => !("sourcePackage" in component)),
  ).toBe(true)
  expect(document.warnings.map((warning) => warning.code)).toContain(
    "unknown_page_record_skipped",
  )
  expect(document.limitations.map((limitation) => limitation.code)).toContain(
    "symbol_graphics_not_decoded",
  )
  expect(document.getChildren()).toEqual([page])
  expect(page.getChildren()).toHaveLength(29)
  const u1 = page.components.find((component) => component.reference === "U1")
  expect(u1?.getChildren()).toHaveLength(5)
  expect(u1?.t0x10Records[0]?.type).toBe("orcad_schematic_preview_t0x10_record")
  expect(u1?.t0x10Records[0] && "pinIndex" in u1.t0x10Records[0]).toBe(false)

  const svg = serializeOrcadSchematicPreviewToSvg(document, {
    title: "MIT OrCAD non-inverting amplifier Preview",
  })

  expect(svg).toContain('class="orcad-schematic-preview"')
  expect(svg).toContain('data-support="partial-preview"')
  expect(svg).toContain('data-render-mode="heuristic"')
  expect(svg).toContain('data-geometry-source="t0x10-record-positions"')
  expect(svg).toContain('data-symbol-inference="package-name-allowlist"')
  expect(svg).toContain('data-symbol-family="resistor"')
  expect(svg).toContain('data-symbol-family="dc-source"')
  expect(svg).toContain('data-symbol-family="sine-source"')
  expect(svg).toContain('data-symbol-family="op-amp"')
  expect(svg).not.toContain('data-symbol-family="generic"')
  expect(svg).toContain('data-wire-source-order="0"')
  expect(svg).not.toContain("data-net-id=")
  expect(svg).not.toMatch(/\sdata-(?:pin|terminal)(?:=|-)/i)
  expect(svg).toContain(
    'data-text-source="package-name" data-text-format-inference="exact-package-base-label" data-placement-inference="op-amp-exterior-label"',
  )
  expect(svg).toContain(">TL082</text>")
  expect(svg).toContain(">U1</text>")
  expect(svg).toContain(">199.7fW</text>")
  expect(svg).toContain(
    'data-placement-inference="component-symbol-exterior-diagnostic" data-visibility-inference="source-visibility-unresolved-diagnostic"',
  )
  expect(svg).toContain(">FREQ = 1k</text>")
  expect(svg).not.toMatch(/data-property="Value"[^>]*>1k<\/text>/)
  expect(svg).toContain('data-attachment-inference="nearest-wire-endpoint"')
  expect(svg).toContain(">VCC</text>")
  expect(svg).toContain(">VEE</text>")

  await expectSvgSnapshot(svg, import.meta.path)
})
