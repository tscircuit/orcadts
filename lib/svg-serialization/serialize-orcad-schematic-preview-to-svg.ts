import type {
  OrcadSchematicPreviewComponent,
  OrcadSchematicPreviewDocument,
  OrcadSchematicPreviewNetSymbol,
  OrcadSchematicPreviewPage,
} from "../preview/preview-nodes"
import type {
  OrcadSchematicPreviewBounds,
  OrcadSchematicPreviewDisplayProperty,
  OrcadSchematicPreviewPoint,
} from "../preview/preview-types"

export interface SerializeOrcadSchematicPreviewToSvgOptions {
  readonly background?: string | undefined
  readonly height?: number | undefined
  readonly pageIndex?: number | undefined
  readonly showGrid?: boolean | undefined
  readonly title?: string | undefined
  readonly width?: number | undefined
}

const symbolColor = "#0057ff"
const wireColor = "#d00078"
const netLabelColor = "#ef1d29"
const textColor = "#101010"
const displayPropertyFontSize = 10
const displayPropertyBaselineOffset = 0
const biasDiagnosticFontSize = 7
const groundEndpointSnapThreshold = 10
const groundSymbolNameAllowlist = new Set(["0", "GND", "GROUND", "COMMON"])
const minimumPointSpan = 8
const defaultBounds: OrcadSchematicPreviewBounds = {
  minX: 0,
  minY: 0,
  maxX: 640,
  maxY: 480,
}

/**
 * Reconstructs a deterministic, intentionally partial SVG from Preview page
 * geometry. This is a visual diagnostic, not a native OrCAD renderer.
 */
export function serializeOrcadSchematicPreviewToSvg(
  source: OrcadSchematicPreviewDocument | OrcadSchematicPreviewPage,
  options: SerializeOrcadSchematicPreviewToSvgOptions = {},
): string {
  const page = selectPage(source, options.pageIndex ?? 0)
  const title =
    options.title ??
    (source.type === "orcad_schematic_preview_document" && source.fileName
      ? `${source.fileName} — ${page.name}`
      : page.name || "OrCAD schematic Preview")
  const background = options.background ?? "#ffffff"
  const bounds = expandedBounds(computeContentBounds(page), 45)
  const viewWidth = Math.max(1, bounds.maxX - bounds.minX)
  const viewHeight = Math.max(1, bounds.maxY - bounds.minY)
  const width = options.width ?? 1000
  const height =
    options.height ?? Math.max(1, Math.round((width * viewHeight) / viewWidth))
  const limitationMetadata =
    source.type === "orcad_schematic_preview_document"
      ? ` data-limitations="${source.limitations.length}"`
      : ""

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(width)}" height="${formatNumber(height)}" viewBox="${formatNumber(bounds.minX)} ${formatNumber(bounds.minY)} ${formatNumber(viewWidth)} ${formatNumber(viewHeight)}" role="img" aria-label="${escapeXml(title)}" class="orcad-schematic-preview" data-renderer="orcadts" data-support="partial-preview" data-render-mode="heuristic" data-geometry-source="t0x10-record-positions" data-symbol-inference="package-name-allowlist">`,
    `  <title>${escapeXml(title)}</title>`,
    "  <desc>Partial visual reconstruction from decoded OrCAD Capture page geometry. Symbol library graphics, placement transforms, hierarchy, and the undecoded page tail are not faithfully reproduced.</desc>",
    `  <metadata data-format="orcad-capture-dsn-cfb-preview" data-page-stream="${escapeXml(page.streamPath)}"${limitationMetadata}/>`,
    "  <defs>",
    '    <pattern id="orcad-preview-grid" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.45" fill="#c8ccd4"/></pattern>',
    "  </defs>",
    `  <rect x="${formatNumber(bounds.minX)}" y="${formatNumber(bounds.minY)}" width="${formatNumber(viewWidth)}" height="${formatNumber(viewHeight)}" fill="${escapeXml(background)}"/>`,
  ]

  if (options.showGrid ?? true) {
    lines.push(
      `  <rect x="${formatNumber(bounds.minX)}" y="${formatNumber(bounds.minY)}" width="${formatNumber(viewWidth)}" height="${formatNumber(viewHeight)}" fill="url(#orcad-preview-grid)" data-layer="grid"/>`,
    )
  }

  lines.push('  <g stroke-linecap="round" stroke-linejoin="round">')
  appendWires(lines, page)
  appendJunctions(lines, page)
  for (const component of page.components) {
    appendLines(lines, renderComponent(component))
  }
  for (const symbols of [page.globals, page.ports, page.offPageConnectors]) {
    for (const symbol of symbols) {
      appendLines(lines, renderNetSymbol(symbol, page))
    }
  }
  appendAliases(lines, page)
  lines.push("  </g>", "</svg>")
  return lines.join("\n")
}

function appendLines(target: string[], source: readonly string[]): void {
  for (const line of source) target.push(line)
}

function selectPage(
  source: OrcadSchematicPreviewDocument | OrcadSchematicPreviewPage,
  pageIndex: number,
): OrcadSchematicPreviewPage {
  if (source.type === "orcad_schematic_preview_page") return source
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0) {
    throw new RangeError(
      `OrCAD Preview page index must be a non-negative integer: ${pageIndex}`,
    )
  }
  const page = source.pages[pageIndex]
  if (!page) {
    throw new RangeError(
      `OrCAD Preview page index ${pageIndex} is outside a ${source.pages.length}-page document`,
    )
  }
  return page
}

function appendWires(lines: string[], page: OrcadSchematicPreviewPage): void {
  lines.push('    <g data-layer="wires" fill="none">')
  for (const wire of page.wires) {
    lines.push(
      `      <line data-wire-source-order="${wire.sourceOrder}" data-kind="${wire.kind}" x1="${formatNumber(wire.start.x)}" y1="${formatNumber(wire.start.y)}" x2="${formatNumber(wire.end.x)}" y2="${formatNumber(wire.end.y)}" stroke="${wireColor}" stroke-width="${wire.kind === "bus" ? "2.5" : "1.25"}"/>`,
    )
  }
  lines.push("    </g>")
}

function appendJunctions(
  lines: string[],
  page: OrcadSchematicPreviewPage,
): void {
  let opened = false
  for (const point of page.connectionPoints) {
    if (
      !point.isJunctionCandidate ||
      point.wireEndpointSourceOrders.length +
        point.wireThroughSourceOrders.length <
        3
    ) {
      continue
    }
    if (!opened) {
      lines.push('    <g data-layer="junctions" fill="none">')
      opened = true
    }
    lines.push(
      `      <circle data-junction-inference="true" cx="${formatNumber(point.position.x)}" cy="${formatNumber(point.position.y)}" r="2.25" fill="${wireColor}" stroke="none"/>`,
    )
  }
  if (opened) lines.push("    </g>")
}

function renderComponent(component: OrcadSchematicPreviewComponent): string[] {
  const lines = [
    `    <g data-layer="component" data-database-id="${component.databaseId}" data-reference="${escapeXml(component.reference)}" data-package-name="${escapeXml(component.packageName)}" fill="none" stroke="${symbolColor}" stroke-width="1.2">`,
  ]
  appendLines(lines, renderComponentSymbol(component))
  appendLines(lines, renderComponentText(component))
  lines.push("    </g>")
  return lines
}

function renderComponentSymbol(
  component: OrcadSchematicPreviewComponent,
): string[] {
  const points = readCanonicalGeometryPoints(component)
  const pointPair = readUsableTwoPointGeometry(points)

  switch (component.packageName) {
    case "R.Normal":
      if (pointPair) {
        return renderResistor(...pointPair)
      }
      return renderGenericComponent(component, "invalid-t0x10-geometry")
    case "VDC.Normal":
      if (pointPair) {
        return renderDcSource(...pointPair)
      }
      return renderGenericComponent(component, "invalid-t0x10-geometry")
    case "VSIN.Normal":
      if (pointPair) {
        return renderSineSource(...pointPair)
      }
      return renderGenericComponent(component, "invalid-t0x10-geometry")
    case "TL082.Normal": {
      const geometry = points ? readOpAmpGeometry(points) : null
      return geometry
        ? renderOpAmp(geometry)
        : renderGenericComponent(component, "invalid-t0x10-geometry")
    }
    default:
      return renderGenericComponent(component, "unsupported-package-name")
  }
}

function renderGenericComponent(
  component: OrcadSchematicPreviewComponent,
  reason: "invalid-t0x10-geometry" | "unsupported-package-name",
): string[] {
  const width = 18
  const height = 14
  const minX = component.position.x - width / 2
  const minY = component.position.y - height / 2
  return [
    `      <rect data-symbol-family="generic" data-render-mode="heuristic" data-geometry-source="component-position" data-symbol-inference="fallback" data-fallback-reason="${reason}" x="${formatNumber(minX)}" y="${formatNumber(minY)}" width="${formatNumber(width)}" height="${formatNumber(height)}"/>`,
  ]
}

function readCanonicalGeometryPoints(
  component: OrcadSchematicPreviewComponent,
): readonly OrcadSchematicPreviewPoint[] | null {
  const points: OrcadSchematicPreviewPoint[] = []
  for (const record of component.t0x10Records) points.push(record.position)
  if (
    points.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  ) {
    return null
  }

  const sorted = [...points].sort(comparePoints)
  let previous: OrcadSchematicPreviewPoint | undefined
  for (const point of sorted) {
    if (previous && samePoint(previous, point)) return null
    previous = point
  }
  return sorted
}

function readUsableTwoPointGeometry(
  points: readonly OrcadSchematicPreviewPoint[] | null,
): readonly [OrcadSchematicPreviewPoint, OrcadSchematicPreviewPoint] | null {
  if (points?.length !== 2) return null
  const [first, second] = points
  if (!first || !second || !hasUsableSpan(first, second)) return null
  return [first, second]
}

function comparePoints(
  left: OrcadSchematicPreviewPoint,
  right: OrcadSchematicPreviewPoint,
): number {
  return left.x - right.x || left.y - right.y
}

function samePoint(
  left: OrcadSchematicPreviewPoint,
  right: OrcadSchematicPreviewPoint,
): boolean {
  return left.x === right.x && left.y === right.y
}

function hasUsableSpan(
  first: OrcadSchematicPreviewPoint,
  second: OrcadSchematicPreviewPoint,
): boolean {
  const distance = pointDistance(first, second)
  return Number.isFinite(distance) && distance >= minimumPointSpan
}

function pointDistance(
  first: OrcadSchematicPreviewPoint,
  second: OrcadSchematicPreviewPoint,
): number {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

function renderResistor(
  first: OrcadSchematicPreviewPoint,
  second: OrcadSchematicPreviewPoint,
): string[] {
  const axis = unitVector(first, second)
  const normal = { x: -axis.y, y: axis.x }
  const span = pointDistance(first, second)
  const leadLength = Math.min(8, span * 0.2)
  const bodyStart = translatePoint(first, axis, leadLength)
  const bodyEnd = translatePoint(second, axis, -leadLength)
  const bodySpan = pointDistance(bodyStart, bodyEnd)
  const pathPoints = [first, bodyStart]

  for (let index = 1; index < 8; index += 1) {
    const center = translatePoint(bodyStart, axis, (bodySpan * index) / 8)
    pathPoints.push(
      translatePoint(center, normal, index % 2 === 0 ? -3.5 : 3.5),
    )
  }
  pathPoints.push(bodyEnd, second)

  return [
    '      <g data-symbol-family="resistor" data-render-mode="heuristic" data-geometry-source="t0x10-record-positions" data-symbol-inference="package-name-allowlist">',
    `        <path d="${pointsToPath(pathPoints)}"/>`,
    "      </g>",
  ]
}

function renderDcSource(
  first: OrcadSchematicPreviewPoint,
  second: OrcadSchematicPreviewPoint,
): string[] {
  const axis = unitVector(first, second)
  const center = midpoint(first, second)
  const radius = Math.min(15, pointDistance(first, second) * 0.3)
  const firstCirclePoint = translatePoint(center, axis, -radius)
  const secondCirclePoint = translatePoint(center, axis, radius)
  const plusPosition = translatePoint(center, axis, -radius * 0.38)
  const minusPosition = translatePoint(center, axis, radius * 0.38)

  return [
    '      <g data-symbol-family="dc-source" data-render-mode="heuristic" data-geometry-source="t0x10-record-positions" data-symbol-inference="package-name-allowlist">',
    `        <line x1="${formatNumber(first.x)}" y1="${formatNumber(first.y)}" x2="${formatNumber(firstCirclePoint.x)}" y2="${formatNumber(firstCirclePoint.y)}"/>`,
    `        <circle cx="${formatNumber(center.x)}" cy="${formatNumber(center.y)}" r="${formatNumber(radius)}"/>`,
    `        <line x1="${formatNumber(secondCirclePoint.x)}" y1="${formatNumber(secondCirclePoint.y)}" x2="${formatNumber(second.x)}" y2="${formatNumber(second.y)}"/>`,
    `        <text x="${formatNumber(plusPosition.x)}" y="${formatNumber(plusPosition.y)}" fill="${symbolColor}" stroke="none" font-family="Arial, sans-serif" font-size="10">+</text>`,
    `        <text x="${formatNumber(minusPosition.x)}" y="${formatNumber(minusPosition.y)}" fill="${symbolColor}" stroke="none" font-family="Arial, sans-serif" font-size="10">−</text>`,
    "      </g>",
  ]
}

function renderSineSource(
  first: OrcadSchematicPreviewPoint,
  second: OrcadSchematicPreviewPoint,
): string[] {
  const axis = unitVector(first, second)
  const normal = { x: -axis.y, y: axis.x }
  const center = midpoint(first, second)
  const radius = Math.min(15, pointDistance(first, second) * 0.3)
  const firstCirclePoint = translatePoint(center, axis, -radius)
  const secondCirclePoint = translatePoint(center, axis, radius)
  const sinePoints: OrcadSchematicPreviewPoint[] = []

  for (let index = 0; index <= 16; index += 1) {
    const progress = index / 16
    const across = (progress - 0.5) * radius * 1.2
    const wave = Math.sin(progress * Math.PI * 2) * radius * 0.24
    sinePoints.push(
      translatePoint(translatePoint(center, normal, across), axis, wave),
    )
  }

  return [
    '      <g data-symbol-family="sine-source" data-render-mode="heuristic" data-geometry-source="t0x10-record-positions" data-symbol-inference="package-name-allowlist">',
    `        <line x1="${formatNumber(first.x)}" y1="${formatNumber(first.y)}" x2="${formatNumber(firstCirclePoint.x)}" y2="${formatNumber(firstCirclePoint.y)}"/>`,
    `        <circle cx="${formatNumber(center.x)}" cy="${formatNumber(center.y)}" r="${formatNumber(radius)}"/>`,
    `        <path d="${pointsToPath(sinePoints)}"/>`,
    `        <line x1="${formatNumber(secondCirclePoint.x)}" y1="${formatNumber(secondCirclePoint.y)}" x2="${formatNumber(second.x)}" y2="${formatNumber(second.y)}"/>`,
    "      </g>",
  ]
}

interface OpAmpGeometry {
  readonly lowerLeftPoint: OrcadSchematicPreviewPoint
  readonly lowerMiddlePoint: OrcadSchematicPreviewPoint
  readonly rightmostPoint: OrcadSchematicPreviewPoint
  readonly triangleBottom: OrcadSchematicPreviewPoint
  readonly triangleTop: OrcadSchematicPreviewPoint
  readonly upperLeftPoint: OrcadSchematicPreviewPoint
  readonly upperMiddlePoint: OrcadSchematicPreviewPoint
}

function readOpAmpGeometry(
  points: readonly OrcadSchematicPreviewPoint[],
): OpAmpGeometry | null {
  if (points.length !== 5) return null

  let rightmostX = Number.NEGATIVE_INFINITY
  for (const point of points) rightmostX = Math.max(rightmostX, point.x)
  const rightmostCandidates = points.filter((point) => point.x === rightmostX)
  if (rightmostCandidates.length !== 1) return null
  const [rightmostPoint] = rightmostCandidates
  if (!rightmostPoint) return null
  const remaining = points.filter((point) => point !== rightmostPoint)
  const leftPair = remaining.slice(0, 2).sort(comparePoints)
  const middlePair = remaining.slice(2).sort(comparePoints)
  const [upperLeftPoint, lowerLeftPoint] = leftPair
  const [upperMiddlePoint, lowerMiddlePoint] = middlePair
  if (
    !upperLeftPoint ||
    !lowerLeftPoint ||
    !upperMiddlePoint ||
    !lowerMiddlePoint ||
    upperLeftPoint.x !== lowerLeftPoint.x ||
    upperMiddlePoint.x !== lowerMiddlePoint.x ||
    upperLeftPoint.x >= upperMiddlePoint.x ||
    upperMiddlePoint.x >= rightmostPoint.x
  ) {
    return null
  }

  const topY = Math.min(upperLeftPoint.y, upperMiddlePoint.y)
  const bottomY = Math.max(lowerLeftPoint.y, lowerMiddlePoint.y)
  const horizontalSpan = rightmostPoint.x - upperLeftPoint.x
  if (
    !Number.isFinite(horizontalSpan) ||
    !Number.isFinite(bottomY - topY) ||
    horizontalSpan < minimumPointSpan * 2 ||
    lowerLeftPoint.y - upperLeftPoint.y < minimumPointSpan ||
    lowerMiddlePoint.y - upperMiddlePoint.y < minimumPointSpan ||
    bottomY - topY < minimumPointSpan * 2 ||
    rightmostPoint.y <= topY ||
    rightmostPoint.y >= bottomY
  ) {
    return null
  }

  const triangleX = upperLeftPoint.x + Math.min(10, horizontalSpan * 0.2)
  return {
    upperLeftPoint,
    lowerLeftPoint,
    upperMiddlePoint,
    lowerMiddlePoint,
    rightmostPoint,
    triangleTop: { x: triangleX, y: topY },
    triangleBottom: { x: triangleX, y: bottomY },
  }
}

function renderOpAmp(geometry: OpAmpGeometry): string[] {
  const upperMiddleTarget = intersectAtX(
    geometry.triangleTop,
    geometry.rightmostPoint,
    geometry.upperMiddlePoint.x,
  )
  const lowerMiddleTarget = intersectAtX(
    geometry.triangleBottom,
    geometry.rightmostPoint,
    geometry.lowerMiddlePoint.x,
  )
  const glyphX =
    geometry.triangleTop.x +
    (geometry.rightmostPoint.x - geometry.triangleTop.x) * 0.22

  return [
    '      <g data-symbol-family="op-amp" data-render-mode="heuristic" data-geometry-source="t0x10-record-positions" data-symbol-inference="package-name-allowlist">',
    `        <path d="M ${formatNumber(geometry.triangleTop.x)} ${formatNumber(geometry.triangleTop.y)} L ${formatNumber(geometry.triangleBottom.x)} ${formatNumber(geometry.triangleBottom.y)} L ${formatNumber(geometry.rightmostPoint.x)} ${formatNumber(geometry.rightmostPoint.y)} Z"/>`,
    `        <line x1="${formatNumber(geometry.upperLeftPoint.x)}" y1="${formatNumber(geometry.upperLeftPoint.y)}" x2="${formatNumber(geometry.triangleTop.x)}" y2="${formatNumber(geometry.upperLeftPoint.y)}"/>`,
    `        <line x1="${formatNumber(geometry.lowerLeftPoint.x)}" y1="${formatNumber(geometry.lowerLeftPoint.y)}" x2="${formatNumber(geometry.triangleBottom.x)}" y2="${formatNumber(geometry.lowerLeftPoint.y)}"/>`,
    `        <line x1="${formatNumber(geometry.upperMiddlePoint.x)}" y1="${formatNumber(geometry.upperMiddlePoint.y)}" x2="${formatNumber(upperMiddleTarget.x)}" y2="${formatNumber(upperMiddleTarget.y)}"/>`,
    `        <line x1="${formatNumber(geometry.lowerMiddlePoint.x)}" y1="${formatNumber(geometry.lowerMiddlePoint.y)}" x2="${formatNumber(lowerMiddleTarget.x)}" y2="${formatNumber(lowerMiddleTarget.y)}"/>`,
    '        <g data-polarity-inference="diagram-convention-upper-minus-lower-plus">',
    `          <text x="${formatNumber(glyphX)}" y="${formatNumber(geometry.upperLeftPoint.y)}" fill="${symbolColor}" stroke="none" font-family="Arial, sans-serif" font-size="10">−</text>`,
    `          <text x="${formatNumber(glyphX)}" y="${formatNumber(geometry.lowerLeftPoint.y)}" fill="${symbolColor}" stroke="none" font-family="Arial, sans-serif" font-size="10">+</text>`,
    "        </g>",
    "      </g>",
  ]
}

function unitVector(
  first: OrcadSchematicPreviewPoint,
  second: OrcadSchematicPreviewPoint,
): OrcadSchematicPreviewPoint {
  const distance = pointDistance(first, second)
  return {
    x: (second.x - first.x) / distance,
    y: (second.y - first.y) / distance,
  }
}

function midpoint(
  first: OrcadSchematicPreviewPoint,
  second: OrcadSchematicPreviewPoint,
): OrcadSchematicPreviewPoint {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
}

function translatePoint(
  point: OrcadSchematicPreviewPoint,
  direction: OrcadSchematicPreviewPoint,
  distance: number,
): OrcadSchematicPreviewPoint {
  return {
    x: point.x + direction.x * distance,
    y: point.y + direction.y * distance,
  }
}

function intersectAtX(
  first: OrcadSchematicPreviewPoint,
  second: OrcadSchematicPreviewPoint,
  x: number,
): OrcadSchematicPreviewPoint {
  const progress = (x - first.x) / (second.x - first.x)
  return { x, y: first.y + (second.y - first.y) * progress }
}

function pointsToPath(points: readonly OrcadSchematicPreviewPoint[]): string {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${formatNumber(point.x)} ${formatNumber(point.y)}`,
    )
    .join(" ")
}

function renderComponentText(
  component: OrcadSchematicPreviewComponent,
): string[] {
  const lines: string[] = []
  let renderedReference = false
  let renderedValue = false
  let biasDiagnosticIndex = 0

  if (component.packageName === "TL082.Normal") {
    const position = opAmpPackageLabelAnchor(component)
    lines.push(
      `      <text data-property="Package Name" data-text-source="package-name" data-text-format-inference="exact-package-base-label" data-placement-inference="op-amp-exterior-label" x="${formatNumber(position.x)}" y="${formatNumber(position.y)}" fill="${symbolColor}" stroke="none" font-family="Arial, sans-serif" font-size="9">TL082</text>`,
    )
  }

  for (const property of component.displayProperties) {
    const renderedProperty = resolveDisplayPropertyText(component, property, {
      renderedReference,
      renderedValue,
    })
    if (!renderedProperty) continue

    const rawSourcePosition = rawPropertyPosition(component, property)
    const baselinePosition = absolutePropertyPosition(component, property)
    renderedReference ||= renderedProperty.isReference
    renderedValue ||= renderedProperty.isValue

    if (property.propertyName?.startsWith("BiasValue")) {
      const position = biasDiagnosticPosition(component, biasDiagnosticIndex)
      biasDiagnosticIndex += 1
      lines.push(
        `      <text data-property="${escapeXml(property.propertyName)}" data-text-source="${renderedProperty.source}" data-placement-inference="component-symbol-exterior-diagnostic" data-visibility-inference="source-visibility-unresolved-diagnostic" data-source-position-x="${formatNumber(rawSourcePosition.x)}" data-source-position-y="${formatNumber(rawSourcePosition.y)}" x="${formatNumber(position.x)}" y="${formatNumber(position.y)}" fill="#6b7280" fill-opacity="0.72" stroke="none" font-family="Arial, sans-serif" font-size="${biasDiagnosticFontSize}">${escapeXml(renderedProperty.text)}</text>`,
      )
      continue
    }

    const textFormatInference = renderedProperty.textFormatInference
      ? ` data-text-format-inference="${renderedProperty.textFormatInference}"`
      : ""
    lines.push(
      `      <text data-property="${escapeXml(property.propertyName ?? "unknown")}" data-text-source="${renderedProperty.source}" data-placement-inference="component-relative-top-to-baseline"${textFormatInference} x="${formatNumber(baselinePosition.x)}" y="${formatNumber(baselinePosition.y)}" fill="${symbolColor}" stroke="none" font-family="Arial, sans-serif" font-size="${displayPropertyFontSize}" transform="rotate(${property.rotationQuarterTurns * 90} ${formatNumber(baselinePosition.x)} ${formatNumber(baselinePosition.y)})">${escapeXml(renderedProperty.text)}</text>`,
    )
  }

  const labelAnchor = componentLabelAnchor(component)
  if (component.reference && !renderedReference) {
    lines.push(
      `      <text data-property="Part Reference" data-text-source="component-reference" data-placement-inference="component-position-label-fallback" x="${formatNumber(labelAnchor.x)}" y="${formatNumber(labelAnchor.y)}" fill="${symbolColor}" stroke="none" font-family="Arial, sans-serif" font-size="10">${escapeXml(component.reference)}</text>`,
    )
  }
  if (component.value && !renderedValue) {
    lines.push(
      `      <text data-property="Value" data-text-source="component-value" data-placement-inference="component-position-label-fallback" x="${formatNumber(labelAnchor.x + 35)}" y="${formatNumber(labelAnchor.y)}" fill="${symbolColor}" stroke="none" font-family="Arial, sans-serif" font-size="10">${escapeXml(component.value)}</text>`,
    )
  }

  return lines
}

interface RenderedPropertyState {
  readonly renderedReference: boolean
  readonly renderedValue: boolean
}

interface ResolvedDisplayPropertyText {
  readonly isReference: boolean
  readonly isValue: boolean
  readonly source:
    | "component-reference"
    | "component-value"
    | "display-property"
  readonly text: string
  readonly textFormatInference: "vsin-parameter-name-value" | null
}

function resolveDisplayPropertyText(
  component: OrcadSchematicPreviewComponent,
  property: OrcadSchematicPreviewDisplayProperty,
  state: RenderedPropertyState,
): ResolvedDisplayPropertyText | null {
  const isReference = property.propertyName === "Part Reference"
  const isValue = property.propertyName === "Value"

  if (property.text !== null) {
    const isVsinParameter =
      component.packageName === "VSIN.Normal" &&
      property.propertyName !== null &&
      ["AC", "FREQ", "VAMPL", "VOFF"].includes(property.propertyName)
    return {
      text: isVsinParameter
        ? `${property.propertyName} = ${property.text}`
        : property.text,
      source: "display-property",
      isReference,
      isValue,
      textFormatInference: isVsinParameter ? "vsin-parameter-name-value" : null,
    }
  }
  if (isReference && component.reference && !state.renderedReference) {
    return {
      text: component.reference,
      source: "component-reference",
      isReference: true,
      isValue: false,
      textFormatInference: null,
    }
  }
  if (isValue && component.value && !state.renderedValue) {
    return {
      text: component.value,
      source: "component-value",
      isReference: false,
      isValue: true,
      textFormatInference: null,
    }
  }
  return null
}

function biasDiagnosticPosition(
  component: OrcadSchematicPreviewComponent,
  index: number,
): OrcadSchematicPreviewPoint {
  const points = readCanonicalGeometryPoints(component)
  if (points && points.length > 0) {
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const point of points) {
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
    if (Number.isFinite(maxX) && Number.isFinite(maxY)) {
      return {
        x: maxX + 8,
        y: maxY + 16 + index * (biasDiagnosticFontSize + 2),
      }
    }
  }
  return {
    x: component.position.x + 14,
    y: component.position.y + 16 + index * (biasDiagnosticFontSize + 2),
  }
}

function opAmpPackageLabelAnchor(
  component: OrcadSchematicPreviewComponent,
): OrcadSchematicPreviewPoint {
  const points = readCanonicalGeometryPoints(component)
  const geometry = points ? readOpAmpGeometry(points) : null
  if (geometry) {
    return { x: geometry.triangleTop.x, y: geometry.triangleTop.y - 8 }
  }
  return { x: component.position.x, y: component.position.y - 12 }
}

function renderNetSymbol(
  symbol: OrcadSchematicPreviewNetSymbol,
  page: OrcadSchematicPreviewPage,
): string[] {
  const name = symbol.symbolName
  if (symbol.kind === "global" && groundSymbolNameAllowlist.has(name)) {
    const anchor = groundVisualAnchor(symbol, page)
    const { x, y } = anchor.position
    return [
      `    <g data-layer="net-symbol" data-kind="${symbol.kind}" data-database-id="${symbol.databaseId}" data-render-mode="heuristic" data-geometry-source="${anchor.geometrySource}" data-symbol-inference="global-name-allowlist" data-attachment-inference="${anchor.inference}" data-decoded-position-x="${formatNumber(symbol.position.x)}" data-decoded-position-y="${formatNumber(symbol.position.y)}" stroke="${netLabelColor}" fill="none" stroke-width="1.2">`,
      `      <line x1="${formatNumber(x - 12)}" y1="${formatNumber(y)}" x2="${formatNumber(x + 12)}" y2="${formatNumber(y)}"/>`,
      `      <line x1="${formatNumber(x - 8)}" y1="${formatNumber(y + 4)}" x2="${formatNumber(x + 8)}" y2="${formatNumber(y + 4)}"/>`,
      `      <line x1="${formatNumber(x - 4)}" y1="${formatNumber(y + 8)}" x2="${formatNumber(x + 4)}" y2="${formatNumber(y + 8)}"/>`,
      `      <text x="${formatNumber(x)}" y="${formatNumber(y + 22)}" text-anchor="middle" fill="${textColor}" stroke="none" font-family="Arial, sans-serif" font-size="10">${escapeXml(name)}</text>`,
      "    </g>",
    ]
  }

  const { x, y } = symbol.position
  return [
    `    <g data-layer="net-symbol" data-kind="${symbol.kind}" data-database-id="${symbol.databaseId}" data-render-mode="heuristic" data-geometry-source="symbol-position" data-symbol-inference="net-symbol-kind" stroke="${symbolColor}" fill="none" stroke-width="1.2">`,
    `      <path d="M ${formatNumber(x - 8)} ${formatNumber(y - 5)} H ${formatNumber(x + 4)} L ${formatNumber(x + 10)} ${formatNumber(y)} L ${formatNumber(x + 4)} ${formatNumber(y + 5)} H ${formatNumber(x - 8)} Z"/>`,
    `      <text x="${formatNumber(x + 13)}" y="${formatNumber(y + 3)}" fill="${netLabelColor}" stroke="none" font-family="Arial, sans-serif" font-size="10">${escapeXml(name)}</text>`,
    "    </g>",
  ]
}

interface GroundVisualAnchor {
  readonly geometrySource: "nearest-wire-endpoint" | "symbol-position"
  readonly inference: "decoded-position-fallback" | "nearest-wire-endpoint"
  readonly position: OrcadSchematicPreviewPoint
}

function groundVisualAnchor(
  symbol: OrcadSchematicPreviewNetSymbol,
  page: OrcadSchematicPreviewPage,
): GroundVisualAnchor {
  const candidates: Array<{
    distance: number
    position: OrcadSchematicPreviewPoint
  }> = []
  for (const wire of page.wires) {
    for (const position of [wire.start, wire.end]) {
      const distance = pointDistance(symbol.position, position)
      if (
        Number.isFinite(distance) &&
        distance <= groundEndpointSnapThreshold
      ) {
        candidates.push({ distance, position })
      }
    }
  }
  candidates.sort(
    (left, right) =>
      left.distance - right.distance ||
      comparePoints(left.position, right.position),
  )
  const nearest = candidates[0]
  if (nearest) {
    // This changes SVG placement only. It does not mutate Preview nodes or
    // create a decoded net, attachment, or component relationship.
    return {
      geometrySource: "nearest-wire-endpoint",
      inference: "nearest-wire-endpoint",
      position: nearest.position,
    }
  }
  return {
    geometrySource: "symbol-position",
    inference: "decoded-position-fallback",
    position: symbol.position,
  }
}

function appendAliases(lines: string[], page: OrcadSchematicPreviewPage): void {
  if (page.netAliases.length === 0) return
  lines.push('    <g data-layer="net-aliases">')
  for (const alias of page.netAliases) {
    lines.push(
      `      <text data-wire-source-order="${alias.wireSourceOrder}" x="${formatNumber(alias.position.x + 4)}" y="${formatNumber(alias.position.y - 4)}" fill="${netLabelColor}" stroke="none" font-family="Arial, sans-serif" font-size="10">${escapeXml(alias.name)}</text>`,
    )
  }
  lines.push("    </g>")
}

function absolutePropertyPosition(
  component: OrcadSchematicPreviewComponent,
  property: OrcadSchematicPreviewDisplayProperty,
): OrcadSchematicPreviewPoint {
  const position = rawPropertyPosition(component, property)
  return {
    x: position.x,
    // Capture stores the top of its display-property text box. Convert it to
    // the fixed Preview font's alphabetic baseline for deterministic snapshots.
    y: position.y + displayPropertyBaselineOffset,
  }
}

function rawPropertyPosition(
  component: OrcadSchematicPreviewComponent,
  property: OrcadSchematicPreviewDisplayProperty,
): OrcadSchematicPreviewPoint {
  return {
    x: component.position.x + property.offset.x,
    y: component.position.y + property.offset.y,
  }
}

function componentLabelAnchor(
  component: OrcadSchematicPreviewComponent,
): OrcadSchematicPreviewPoint {
  return { x: component.position.x, y: component.position.y - 12 }
}

function computeContentBounds(
  page: OrcadSchematicPreviewPage,
): OrcadSchematicPreviewBounds {
  const accumulator = createBoundsAccumulator()
  for (const wire of page.wires) {
    includePoint(accumulator, wire.start)
    includePoint(accumulator, wire.end)
  }
  for (const point of page.connectionPoints) {
    if (point.isJunctionCandidate) includePoint(accumulator, point.position, 3)
  }
  for (const alias of page.netAliases) {
    includePoint(accumulator, alias.position)
    includeTextBounds(
      accumulator,
      { x: alias.position.x + 4, y: alias.position.y - 4 },
      alias.name,
      10,
    )
  }
  for (const component of page.components) {
    includeComponentBounds(accumulator, component)
  }
  for (const symbols of [page.globals, page.ports, page.offPageConnectors]) {
    for (const symbol of symbols) {
      includeNetSymbolBounds(accumulator, symbol, page)
    }
  }

  if (!accumulator.hasPoint) return page.contentBounds ?? defaultBounds
  return {
    minX: accumulator.minX,
    minY: accumulator.minY,
    maxX: accumulator.maxX,
    maxY: accumulator.maxY,
  }
}

interface BoundsAccumulator {
  hasPoint: boolean
  maxX: number
  maxY: number
  minX: number
  minY: number
}

function createBoundsAccumulator(): BoundsAccumulator {
  return {
    hasPoint: false,
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  }
}

function includePoint(
  bounds: BoundsAccumulator,
  point: OrcadSchematicPreviewPoint,
  padding = 0,
): void {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(padding)
  ) {
    return
  }
  bounds.hasPoint = true
  bounds.minX = Math.min(bounds.minX, point.x - padding)
  bounds.minY = Math.min(bounds.minY, point.y - padding)
  bounds.maxX = Math.max(bounds.maxX, point.x + padding)
  bounds.maxY = Math.max(bounds.maxY, point.y + padding)
}

function includeComponentBounds(
  bounds: BoundsAccumulator,
  component: OrcadSchematicPreviewComponent,
): void {
  includePoint(bounds, component.position, 10)
  for (const record of component.t0x10Records) {
    includePoint(bounds, record.position, 16)
  }

  let renderedReference = false
  let renderedValue = false
  let biasDiagnosticIndex = 0
  if (component.packageName === "TL082.Normal") {
    includeTextBounds(bounds, opAmpPackageLabelAnchor(component), "TL082", 9)
  }
  for (const property of component.displayProperties) {
    const renderedProperty = resolveDisplayPropertyText(component, property, {
      renderedReference,
      renderedValue,
    })
    if (!renderedProperty) continue
    renderedReference ||= renderedProperty.isReference
    renderedValue ||= renderedProperty.isValue

    const rawPosition = rawPropertyPosition(component, property)
    includePoint(bounds, rawPosition)
    if (property.propertyName?.startsWith("BiasValue")) {
      includeTextBounds(
        bounds,
        biasDiagnosticPosition(component, biasDiagnosticIndex),
        renderedProperty.text,
        biasDiagnosticFontSize,
      )
      biasDiagnosticIndex += 1
    } else {
      const baselinePosition = absolutePropertyPosition(component, property)
      includePoint(bounds, baselinePosition)
      includeTextBounds(
        bounds,
        baselinePosition,
        renderedProperty.text,
        displayPropertyFontSize,
        property.rotationQuarterTurns,
      )
    }
  }

  const labelAnchor = componentLabelAnchor(component)
  if (component.reference && !renderedReference) {
    includeTextBounds(bounds, labelAnchor, component.reference, 10)
  }
  if (component.value && !renderedValue) {
    includeTextBounds(
      bounds,
      { x: labelAnchor.x + 35, y: labelAnchor.y },
      component.value,
      10,
    )
  }
}

function includeNetSymbolBounds(
  bounds: BoundsAccumulator,
  symbol: OrcadSchematicPreviewNetSymbol,
  page: OrcadSchematicPreviewPage,
): void {
  includePoint(bounds, symbol.position)
  if (
    symbol.kind === "global" &&
    groundSymbolNameAllowlist.has(symbol.symbolName)
  ) {
    const anchor = groundVisualAnchor(symbol, page).position
    includePoint(bounds, { x: anchor.x - 12, y: anchor.y })
    includePoint(bounds, { x: anchor.x + 12, y: anchor.y + 8 })
    includeTextBounds(
      bounds,
      { x: anchor.x, y: anchor.y + 22 },
      symbol.symbolName,
      10,
      0,
      "middle",
    )
    return
  }
  includePoint(bounds, { x: symbol.position.x - 8, y: symbol.position.y - 5 })
  includePoint(bounds, {
    x: symbol.position.x + 10,
    y: symbol.position.y + 5,
  })
  includeTextBounds(
    bounds,
    { x: symbol.position.x + 13, y: symbol.position.y + 3 },
    symbol.symbolName,
    10,
  )
}

function includeTextBounds(
  bounds: BoundsAccumulator,
  position: OrcadSchematicPreviewPoint,
  text: string,
  fontSize: number,
  rotationQuarterTurns = 0,
  anchor: "middle" | "start" = "start",
): void {
  let codePointCount = 0
  for (const _codePoint of text) codePointCount += 1
  const width = Math.max(fontSize * 0.5, codePointCount * fontSize * 0.65)
  if (rotationQuarterTurns % 2 !== 0) {
    includePoint(bounds, position, Math.hypot(width, fontSize))
    return
  }
  const minX = anchor === "middle" ? position.x - width / 2 : position.x
  const maxX = anchor === "middle" ? position.x + width / 2 : position.x + width
  includePoint(bounds, { x: minX, y: position.y - fontSize })
  includePoint(bounds, { x: maxX, y: position.y + fontSize * 0.3 })
}

function expandedBounds(
  bounds: OrcadSchematicPreviewBounds,
  margin: number,
): OrcadSchematicPreviewBounds {
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    maxX: bounds.maxX + margin,
    maxY: bounds.maxY + margin,
  }
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0"
  const rounded = Math.round(value * 10_000) / 10_000
  return Object.is(rounded, -0) ? "0" : String(rounded)
}

function escapeXml(value: string): string {
  let escaped = ""
  for (let index = 0; index < value.length; index += 1) {
    const first = value.charCodeAt(index)
    let codePoint = first
    if (first >= 0xd800 && first <= 0xdbff) {
      const second = value.charCodeAt(index + 1)
      if (second >= 0xdc00 && second <= 0xdfff) {
        codePoint = (first - 0xd800) * 0x400 + (second - 0xdc00) + 0x10000
        index += 1
      } else {
        codePoint = 0xfffd
      }
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      codePoint = 0xfffd
    }

    if (!isXml10CodePoint(codePoint)) codePoint = 0xfffd
    switch (codePoint) {
      case 0x22:
        escaped += "&quot;"
        break
      case 0x26:
        escaped += "&amp;"
        break
      case 0x3c:
        escaped += "&lt;"
        break
      case 0x3e:
        escaped += "&gt;"
        break
      default:
        escaped += String.fromCodePoint(codePoint)
    }
  }
  return escaped
}

function isXml10CodePoint(codePoint: number): boolean {
  return (
    codePoint === 0x09 ||
    codePoint === 0x0a ||
    codePoint === 0x0d ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  )
}
