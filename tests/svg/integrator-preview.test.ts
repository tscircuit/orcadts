import { expect, test } from "bun:test"
import {
  parseOrcadDsnPreview,
  serializeOrcadSchematicPreviewToSvg,
} from "../../lib"
import { expectSvgSnapshot } from "../fixtures/expect-svg-snapshot"
import { readReferenceBytes } from "../fixtures/read-reference"

const fixturePath = "op-amp-circuits/integrator/INTEGRATOR.DSN"

test("reconstructs the MIT OrCAD integrator as an SVG Preview", async () => {
  const bytes = await readReferenceBytes(fixturePath)
  const document = parseOrcadDsnPreview({
    bytes,
    fileName: "INTEGRATOR.DSN",
  })

  expect(document.format).toBe("orcad-capture-dsn-cfb-preview")
  expect(document.pages).toHaveLength(1)

  const page = document.pages[0]
  expect(page).toBeDefined()
  if (!page) throw new Error("Fixture has no decoded Preview page")

  expect(page.name).toBe("PAGE1")
  expect(page.byteLength).toBe(7_005)
  expect(page.parsedByteLength).toBe(page.byteLength)
  expect(page.unparsedByteLength).toBe(0)
  expect(page.wires).toHaveLength(24)
  expect(page.components.map((component) => component.reference)).toEqual([
    "R2",
    "C1",
    "R1",
    "V2",
    "V1",
    "U1",
    "V3",
  ])
  expect(page.components.map((component) => component.packageName)).toEqual([
    "R.Normal",
    "C.Normal",
    "R.Normal",
    "VDC.Normal",
    "VDC.Normal",
    "TL084.Normal",
    "VSIN.Normal",
  ])
  expect(page.components.every((component) => component.value === null)).toBe(
    true,
  )
  expect(page.globals.map((global) => global.symbolName)).toEqual([
    "0",
    "0",
    "0",
  ])
  expect(page.netAliases.map((alias) => alias.name)).toEqual([
    "VCC",
    "VEE",
    "VEE",
    "VCC",
  ])
  expect(page.warnings.map((warning) => warning.code)).toContain(
    "string_index_out_of_range",
  )
  expect(page.warnings.map((warning) => warning.code)).not.toContain(
    "page_tail_not_decoded",
  )
  expect(page.getChildren()).toHaveLength(34)

  const capacitor = page.components.find(
    (component) => component.reference === "C1",
  )
  expect(capacitor?.t0x10Records.map((record) => record.position)).toEqual([
    { x: 415, y: 140 },
    { x: 445, y: 140 },
  ])
  const opAmp = page.components.find(
    (component) => component.reference === "U1",
  )
  expect(opAmp?.t0x10Records).toHaveLength(5)

  const svg = serializeOrcadSchematicPreviewToSvg(document, {
    title: "MIT OrCAD integrator Preview",
  })

  expect(svg).toContain('data-symbol-family="capacitor"')
  expect(svg).toContain('data-symbol-family="op-amp"')
  expect(svg).not.toContain('data-symbol-family="generic"')
  expect(svg).toContain(">TL084</text>")
  expect(svg).toContain(">U1</text>")
  expect(svg).toContain(">FREQ = 1k</text>")
  expect(svg).not.toContain(">1.59n</text>")
  expect(svg).not.toContain(">100000k</text>")
  expect(svg).toContain(">684.8mW</text>")
  expect(svg).toContain('data-attachment-inference="nearest-wire-endpoint"')
  expect(svg).not.toMatch(/\sdata-(?:pin|terminal|net-id)(?:=|-)/i)

  await expectSvgSnapshot(svg, import.meta.path)
})
