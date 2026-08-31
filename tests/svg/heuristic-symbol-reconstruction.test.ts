import { expect, test } from "bun:test"
import {
  OrcadSchematicPreviewComponent,
  OrcadSchematicPreviewNetSymbol,
  OrcadSchematicPreviewPage,
  OrcadSchematicPreviewT0x10Record,
  OrcadSchematicPreviewWire,
  serializeOrcadSchematicPreviewToSvg,
  type OrcadSchematicPreviewDisplayProperty,
  type OrcadSchematicPreviewPoint,
} from "../../lib"

interface MakeComponentOptions {
  readonly displayProperties?: readonly OrcadSchematicPreviewDisplayProperty[]
  readonly opaqueSeed?: number
  readonly packageName: string
  readonly points: readonly OrcadSchematicPreviewPoint[]
  readonly position?: OrcadSchematicPreviewPoint
  readonly reference?: string
  readonly value?: string | null
}

function makeDisplayProperty(
  overrides: Partial<OrcadSchematicPreviewDisplayProperty> = {},
): OrcadSchematicPreviewDisplayProperty {
  return {
    propertyNameIndex: 1,
    propertyName: "Label",
    text: "visible text",
    offset: { x: 0, y: 0 },
    fontIndex: 0,
    rotationQuarterTurns: 0,
    color: 48,
    opaqueAfterColor: [0, 0],
    opaqueTrailingByte: 0,
    ...overrides,
  }
}

function makeRecord(
  position: OrcadSchematicPreviewPoint,
  sourceOrder: number,
  opaqueSeed: number,
): OrcadSchematicPreviewT0x10Record {
  return new OrcadSchematicPreviewT0x10Record({
    sourceOrder,
    opaqueUint16: opaqueSeed + 1,
    position,
    opaqueUint32A: opaqueSeed + 2,
    opaqueUint32B: opaqueSeed + 3,
    properties: [
      {
        nameIndex: opaqueSeed + 4,
        valueIndex: opaqueSeed + 5,
        name: `opaque-name-${opaqueSeed}`,
        value: `opaque-value-${opaqueSeed}`,
      },
    ],
    displayProperties: [
      makeDisplayProperty({
        propertyNameIndex: opaqueSeed + 6,
        propertyName: null,
        text: null,
        opaqueAfterColor: [opaqueSeed + 7, opaqueSeed + 8],
        opaqueTrailingByte: opaqueSeed + 9,
      }),
    ],
  })
}

function makeComponent({
  displayProperties = [],
  opaqueSeed = 0,
  packageName,
  points,
  position = { x: 0, y: 0 },
  reference = "X1",
  value = null,
}: MakeComponentOptions): OrcadSchematicPreviewComponent {
  return new OrcadSchematicPreviewComponent({
    sourceOrder: 0,
    packageName,
    databaseId: 42,
    reference,
    position,
    opaqueBeforePackageName: [opaqueSeed + 1],
    opaqueAfterDatabaseId: [opaqueSeed + 2],
    opaqueAfterPosition: [opaqueSeed + 3],
    opaqueAfterDisplayProperties: [opaqueSeed + 4],
    opaqueAfterReference: [opaqueSeed + 5],
    opaqueTrailingString: `opaque-${opaqueSeed}`,
    opaqueAfterTrailingString: [opaqueSeed + 6],
    value,
    valueSource: value === null ? "unresolved" : "prefix_property",
    properties: [
      {
        nameIndex: opaqueSeed + 7,
        valueIndex: opaqueSeed + 8,
        name: `opaque-component-name-${opaqueSeed}`,
        value: `opaque-component-value-${opaqueSeed}`,
      },
    ],
    displayProperties: displayProperties.map((property) => ({
      ...property,
      opaqueAfterColor: [opaqueSeed + 9, opaqueSeed + 10],
      opaqueTrailingByte: opaqueSeed + 11,
    })),
    t0x10Records: points.map((point, index) =>
      makeRecord(point, index, opaqueSeed),
    ),
  })
}

function makePage(
  components: readonly OrcadSchematicPreviewComponent[],
  globals: readonly OrcadSchematicPreviewNetSymbol[] = [],
  wires: readonly OrcadSchematicPreviewWire[] = [],
): OrcadSchematicPreviewPage {
  return new OrcadSchematicPreviewPage({
    streamPath: "Views/SCHEMATIC1/Pages/PAGE1",
    viewName: "SCHEMATIC1",
    name: "PAGE1",
    pageSizeName: "A",
    byteLength: 0,
    parsedByteLength: 0,
    unparsedByteLength: 0,
    contentBounds: null,
    netNameTable: [],
    netAliases: [],
    wires,
    components,
    globals,
    ports: [],
    offPageConnectors: [],
    connectionPoints: [],
    warnings: [],
  })
}

function makeWire(
  start: OrcadSchematicPreviewPoint,
  end: OrcadSchematicPreviewPoint,
): OrcadSchematicPreviewWire {
  return new OrcadSchematicPreviewWire({
    sourceOrder: 0,
    kind: "wire",
    opaqueHeaderWords: [0, 0],
    color: 0,
    start,
    end,
    opaqueAfterEndpoints: [],
    aliases: [],
    displayProperties: [],
    lineWidth: 0,
    lineStyle: 0,
  })
}

function makeNetSymbol(
  symbolName: string,
  position: OrcadSchematicPreviewPoint,
  bounds = { minX: 1_000, minY: 2_000, maxX: 1_100, maxY: 2_100 },
): OrcadSchematicPreviewNetSymbol {
  return new OrcadSchematicPreviewNetSymbol({
    sourceOrder: 0,
    kind: "global",
    opaqueGraphicHeaderWords: [0, 0],
    symbolName,
    databaseId: 7,
    position,
    bounds,
    color: 0,
    opaqueAfterColor: [],
    opaqueTargetByte: 0,
    opaqueRecordTrailer: [],
    opaquePageEntryTrailer: [],
    properties: [],
    displayProperties: [],
    attachmentCandidates: [],
  })
}

function serializePage(page: OrcadSchematicPreviewPage): string {
  return serializeOrcadSchematicPreviewToSvg(page, {
    showGrid: false,
    title: "Heuristic symbol test",
    width: 500,
  })
}

function readViewBox(svg: string): readonly [number, number, number, number] {
  const match = svg.match(/\bviewBox="([^"]+)"/)
  if (!match?.[1]) throw new Error("SVG has no viewBox")
  const values = match[1].split(" ").map(Number)
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid SVG viewBox: ${match[1]}`)
  }
  const [minX, minY, width, height] = values
  if (
    minX === undefined ||
    minY === undefined ||
    width === undefined ||
    height === undefined
  ) {
    throw new Error(`Incomplete SVG viewBox: ${match[1]}`)
  }
  return [minX, minY, width, height]
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const first = value.charCodeAt(index)
    if (first >= 0xd800 && first <= 0xdbff) {
      const second = value.charCodeAt(index + 1)
      if (second >= 0xdc00 && second <= 0xdfff) {
        index += 1
      } else {
        return true
      }
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      return true
    }
  }
  return false
}

const resistorPoints = [
  { x: -20, y: 0 },
  { x: 20, y: 0 },
] as const
const capacitorPoints = [
  { x: -20, y: 80 },
  { x: 20, y: 80 },
] as const
const sourcePoints = [
  { x: 100, y: -20 },
  { x: 100, y: 20 },
] as const
const opAmpPoints = [
  { x: 280, y: 10 },
  { x: 280, y: 50 },
  { x: 320, y: 0 },
  { x: 320, y: 60 },
  { x: 360, y: 30 },
] as const

test("reconstructs only the six exact package-name allowlist entries", () => {
  const svg = serializePage(
    makePage([
      makeComponent({
        packageName: "R.Normal",
        points: resistorPoints,
        position: { x: 0, y: 0 },
        reference: "R1",
      }),
      makeComponent({
        packageName: "C.Normal",
        points: capacitorPoints,
        position: { x: 0, y: 80 },
        reference: "C1",
      }),
      makeComponent({
        packageName: "VDC.Normal",
        points: sourcePoints,
        position: { x: 100, y: 0 },
        reference: "V1",
      }),
      makeComponent({
        packageName: "VSIN.Normal",
        points: sourcePoints.map((point) => ({
          x: point.x + 100,
          y: point.y,
        })),
        position: { x: 200, y: 0 },
        reference: "V2",
        displayProperties: [
          makeDisplayProperty({
            propertyName: "FREQ",
            text: "1k",
            offset: { x: -20, y: 10 },
          }),
        ],
      }),
      makeComponent({
        packageName: "TL082.Normal",
        points: opAmpPoints,
        position: { x: 280, y: 10 },
        reference: "U1",
      }),
      makeComponent({
        packageName: "TL084.Normal",
        points: opAmpPoints.map((point) => ({
          x: point.x + 100,
          y: point.y,
        })),
        position: { x: 380, y: 10 },
        reference: "U2",
      }),
    ]),
  )

  expect(svg).toContain('data-symbol-family="resistor"')
  expect(svg).toContain('data-symbol-family="capacitor"')
  expect(svg).toContain('data-symbol-family="dc-source"')
  expect(svg).toContain('data-symbol-family="sine-source"')
  expect(svg).toContain('data-symbol-family="op-amp"')
  expect(svg).not.toContain('data-symbol-family="generic"')
  expect(svg).toContain('data-render-mode="heuristic"')
  expect(svg).toContain('data-geometry-source="t0x10-record-positions"')
  expect(svg).toContain('data-symbol-inference="package-name-allowlist"')
  const reconstructionTags =
    svg.match(
      /<g data-symbol-family="(?:resistor|capacitor|dc-source|sine-source|op-amp)"[^>]+>/g,
    ) ?? []
  expect(reconstructionTags).toHaveLength(6)
  for (const tag of reconstructionTags) {
    expect(tag).toContain('data-render-mode="heuristic"')
    expect(tag).toContain('data-geometry-source="t0x10-record-positions"')
    expect(tag).toContain('data-symbol-inference="package-name-allowlist"')
  }
  expect(svg).toContain(
    'data-polarity-inference="diagram-convention-upper-minus-lower-plus"',
  )
  expect(svg).toContain(
    'text-anchor="middle" dominant-baseline="middle" fill="#0057ff"',
  )
  expect(svg).toContain(
    'data-text-format-inference="vsin-parameter-name-value"',
  )
  expect(svg).toContain(">FREQ = 1k</text>")
  expect(svg).toContain(
    'data-text-source="package-name" data-text-format-inference="exact-package-base-label" data-placement-inference="op-amp-exterior-label"',
  )
  expect(svg).toContain(">TL082</text>")
  expect(svg).toContain(">TL084</text>")
  expect(svg).not.toMatch(/\sdata-(?:pin|terminal|net-id)(?:=|-)/i)
})

test("capacitor plates follow horizontal and vertical terminal axes", () => {
  const svg = serializePage(
    makePage([
      makeComponent({
        packageName: "C.Normal",
        points: capacitorPoints,
        reference: "C1",
      }),
      makeComponent({
        packageName: "C.Normal",
        points: [
          { x: 100, y: -20 },
          { x: 100, y: 20 },
        ],
        position: { x: 100, y: 0 },
        reference: "C2",
      }),
    ]),
  )

  expect(svg.match(/data-symbol-family="capacitor"/g)).toHaveLength(2)
  expect(svg).toContain('<line x1="-2.5" y1="72" x2="-2.5" y2="88"/>')
  expect(svg).toContain('<line x1="108" y1="-2.5" x2="92" y2="-2.5"/>')
})

test("near-match package names use the generic placement fallback", () => {
  const svg = serializePage(
    makePage([
      makeComponent({ packageName: "R.Normal", points: resistorPoints }),
      makeComponent({
        packageName: "R.normal",
        points: resistorPoints,
        position: { x: 50, y: 0 },
        reference: "R2",
      }),
      makeComponent({
        packageName: "R.Normal ",
        points: resistorPoints,
        position: { x: 100, y: 0 },
        reference: "R3",
      }),
    ]),
  )

  expect(svg.match(/data-symbol-family="resistor"/g)).toHaveLength(1)
  expect(svg.match(/data-symbol-family="generic"/g)).toHaveLength(2)
  expect(
    svg.match(/data-fallback-reason="unsupported-package-name"/g),
  ).toHaveLength(2)
})

for (const [packageName, label] of [
  ["TL082.Normal", "TL082"],
  ["TL084.Normal", "TL084"],
] as const) {
  test(`isolated ${label} geometry and inferred labels fit inside the viewBox`, () => {
    const svg = serializePage(
      makePage([
        makeComponent({
          packageName,
          points: opAmpPoints,
          position: { x: 280, y: 10 },
          reference: "U1",
        }),
      ]),
    )
    const [minX, minY, width, height] = readViewBox(svg)
    const maxX = minX + width
    const maxY = minY + height

    for (const point of opAmpPoints) {
      expect(point.x).toBeGreaterThanOrEqual(minX)
      expect(point.x).toBeLessThanOrEqual(maxX)
      expect(point.y).toBeGreaterThanOrEqual(minY)
      expect(point.y).toBeLessThanOrEqual(maxY)
    }
    expect(minY).toBeLessThanOrEqual(-17)
    expect(maxX).toBeGreaterThanOrEqual(360)
    expect(svg).toContain(`>${label}</text>`)
  })
}

test("opaque component and T0x10 data cannot change reconstructed SVG", () => {
  const displayProperties = [
    makeDisplayProperty({
      propertyName: "BiasValue Power",
      text: "color-28 text",
      color: 28,
      offset: { x: 3, y: 4 },
    }),
  ]
  const baseline = serializePage(
    makePage([
      makeComponent({
        packageName: "R.Normal",
        points: resistorPoints,
        displayProperties,
        opaqueSeed: 0,
      }),
    ]),
  )
  const changed = serializePage(
    makePage([
      makeComponent({
        packageName: "R.Normal",
        points: resistorPoints,
        displayProperties,
        opaqueSeed: 100,
      }),
    ]),
  )

  expect(changed).toBe(baseline)
})

test("T0x10 record order cannot change reconstructed geometry", () => {
  const baseline = serializePage(
    makePage([
      makeComponent({ packageName: "TL082.Normal", points: opAmpPoints }),
    ]),
  )
  const reordered = serializePage(
    makePage([
      makeComponent({
        packageName: "TL082.Normal",
        points: [...opAmpPoints].reverse(),
      }),
    ]),
  )

  expect(reordered).toBe(baseline)
})

test("missing, duplicate, and degenerate geometry uses generic placement boxes", () => {
  const svg = serializePage(
    makePage([
      makeComponent({ packageName: "R.Normal", points: [] }),
      makeComponent({
        packageName: "VDC.Normal",
        points: [
          { x: 50, y: 50 },
          { x: 50, y: 50 },
        ],
        position: { x: 50, y: 50 },
      }),
      makeComponent({
        packageName: "VSIN.Normal",
        points: [
          { x: 100, y: 100 },
          { x: 101, y: 100 },
        ],
        position: { x: 100, y: 100 },
      }),
      makeComponent({
        packageName: "C.Normal",
        points: [
          { x: 125, y: 100 },
          { x: 126, y: 100 },
        ],
        position: { x: 125, y: 100 },
      }),
      makeComponent({
        packageName: "TL082.Normal",
        points: [
          { x: 150, y: 0 },
          { x: 150, y: 1 },
          { x: 151, y: 0 },
          { x: 151, y: 1 },
          { x: 152, y: 0.5 },
        ],
        position: { x: 150, y: 0 },
      }),
    ]),
  )

  expect(svg.match(/data-symbol-family="generic"/g)).toHaveLength(5)
  expect(
    svg.match(/data-fallback-reason="invalid-t0x10-geometry"/g),
  ).toHaveLength(5)
  expect(svg).not.toContain('data-symbol-family="resistor"')
  expect(svg).not.toContain('data-symbol-family="dc-source"')
  expect(svg).not.toContain('data-symbol-family="sine-source"')
  expect(svg).not.toContain('data-symbol-family="capacitor"')
  expect(svg).not.toContain('data-symbol-family="op-amp"')
})

test("BiasValue text remains as a de-emphasized exterior diagnostic", () => {
  const svg = serializePage(
    makePage([
      makeComponent({
        packageName: "R.Normal",
        points: resistorPoints,
        position: { x: 10, y: 20 },
        reference: "R1",
        displayProperties: [
          makeDisplayProperty({
            propertyName: "Part Reference",
            text: null,
            offset: { x: 2, y: 3 },
          }),
          makeDisplayProperty({
            propertyName: "BiasValue Power",
            text: "retained color-28 text",
            color: 28,
            offset: { x: 4, y: 5 },
          }),
        ],
      }),
    ]),
  )

  expect(svg).toContain(
    'data-property="Part Reference" data-text-source="component-reference" data-placement-inference="component-relative-top-to-baseline" x="12" y="31"',
  )
  expect(svg).toContain(
    'data-property="BiasValue Power" data-text-source="display-property" data-placement-inference="component-symbol-exterior-diagnostic" data-visibility-inference="source-visibility-unresolved-diagnostic" data-source-position-x="14" data-source-position-y="25" x="28" y="16"',
  )
  expect(svg).toContain(
    'fill="#6b7280" fill-opacity="0.72" stroke="none" font-family="Arial, sans-serif" font-size="7"',
  )
  expect(svg).toContain(">retained color-28 text</text>")
})

test("circular-source BiasValue diagnostics sit beside the symbol", () => {
  const svg = serializePage(
    makePage([
      makeComponent({
        packageName: "VDC.Normal",
        points: sourcePoints,
        position: { x: 100, y: 0 },
        reference: "V1",
        displayProperties: [
          makeDisplayProperty({
            propertyName: "BiasValue Power",
            text: "-342.4mW",
            offset: { x: 19, y: 8 },
          }),
        ],
      }),
    ]),
  )

  expect(svg).toContain(
    'data-source-position-x="119" data-source-position-y="8" x="120" y="3.5"',
  )
  expect(svg).toContain(">-342.4mW</text>")
})

test("nearest-endpoint ground placement is visual-only and creates no API connectivity", () => {
  const ground = makeNetSymbol("0", { x: 10, y: 20 })
  const wire = makeWire({ x: 20, y: 20 }, { x: 80, y: 20 })
  const page = makePage([], [ground], [wire])
  const svg = serializePage(page)

  expect(svg).toContain(
    'data-geometry-source="nearest-wire-endpoint" data-symbol-inference="global-name-allowlist" data-attachment-inference="nearest-wire-endpoint" data-decoded-position-x="10" data-decoded-position-y="20"',
  )
  expect(svg).toContain('<line x1="8" y1="20" x2="32" y2="20"/>')
  expect(page.connectionPoints).toHaveLength(0)
  expect(ground.attachmentCandidates).toHaveLength(0)
  expect(svg).not.toMatch(/\sdata-(?:pin|terminal|net-id)(?:=|-)/i)
})

test("distant grounds and unknown globals stay at their decoded positions", () => {
  const ground = makeNetSymbol("0", { x: 10, y: 20 })
  const unknown = makeNetSymbol("MYSTERY", { x: 40, y: 50 })
  const nearMatch = makeNetSymbol("NOTGND", { x: 70, y: 50 })
  const justOutsideThreshold = makeWire({ x: 20.01, y: 20 }, { x: 30, y: 20 })
  const unknownNearbyWire = makeWire({ x: 50, y: 50 }, { x: 80, y: 50 })
  const svg = serializePage(
    makePage(
      [],
      [ground, unknown, nearMatch],
      [justOutsideThreshold, unknownNearbyWire],
    ),
  )

  expect(svg).toContain(
    'data-geometry-source="symbol-position" data-symbol-inference="global-name-allowlist" data-attachment-inference="decoded-position-fallback" data-decoded-position-x="10" data-decoded-position-y="20"',
  )
  expect(svg).toContain('<line x1="-2" y1="20" x2="22" y2="20"/>')
  expect(svg).toContain('<path d="M 32 45 H 44 L 50 50 L 44 55 H 32 Z"/>')
  expect(svg).toContain(">MYSTERY</text>")
  expect(svg).toContain('<path d="M 62 45 H 74 L 80 50 L 74 55 H 62 Z"/>')
  expect(svg).toContain(">NOTGND</text>")
  expect(svg).not.toContain('data-attachment-inference="nearest-wire-endpoint"')
  expect(svg).not.toContain('x1="1000"')
  expect(svg).not.toContain('y1="2000"')
})

test("page-only serialization does not invent a limitation count", () => {
  const svg = serializePage(makePage([]))

  expect(svg).toContain(
    '<metadata data-format="orcad-capture-dsn-cfb-preview" data-page-stream="Views/SCHEMATIC1/Pages/PAGE1"/>',
  )
  expect(svg).not.toContain("data-limitations=")
})

test("sanitizes invalid XML 1.0 source characters before entity escaping", () => {
  const invalidSource = 'safe😀\u0000\u0008\ud800X\udc00\ufffe\uffff<&">'
  const validControls = "tab\tline\nreturn\r"
  const component = makeComponent({
    packageName: "Unknown.Normal",
    points: [],
    reference: invalidSource,
    displayProperties: [
      makeDisplayProperty({
        propertyName: `Label${invalidSource}`,
        text: invalidSource,
      }),
    ],
  })
  const svg = serializeOrcadSchematicPreviewToSvg(makePage([component]), {
    showGrid: false,
    title: `${validControls}${invalidSource}`,
    width: 500,
  })

  expect(svg).toContain("tab\tline\nreturn\r")
  expect(svg).toContain("safe😀���X���&lt;&amp;&quot;&gt;")
  expect(svg).not.toContain("\u0000")
  expect(svg).not.toContain("\u0008")
  expect(hasLoneSurrogate(svg)).toBe(false)
  expect(svg).not.toContain("\ufffe")
  expect(svg).not.toContain("\uffff")

  const xmllint = Bun.which("xmllint")
  if (xmllint) {
    const validation = Bun.spawnSync([xmllint, "--noout", "-"], {
      stdin: new TextEncoder().encode(svg),
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(new TextDecoder().decode(validation.stderr)).toBe("")
    expect(validation.exitCode).toBe(0)
  }
})

test("serializes a large public page without argument-spread failures", () => {
  const wire = makeWire({ x: 0, y: 0 }, { x: 10, y: 10 })
  const wires = Array.from({ length: 130_000 }, () => wire)
  const svg = serializePage(makePage([], [], wires))

  expect(svg).toContain('data-wire-source-order="0"')
  expect(svg.endsWith("</svg>")).toBe(true)
  expect(svg.length).toBeGreaterThan(10_000_000)
}, 10_000)
