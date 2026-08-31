/**
 * Clean-room TypeScript orchestration for the OpenOrCadParser stream roles at
 * commit be0a83ac119390044952cf9bed1e0fb86c448f44.
 * Format authority: src/StreamFactory.cpp, src/Container.cpp,
 * src/Streams/StreamLibrary.cpp, and src/Streams/StreamPage.cpp. CFB extraction
 * is provided separately by read-compound-file-streams.ts under its retained
 * MIT notice.
 *
 * Copyright (c) 2021 Dominik Wernberger
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { PreviewBinaryReadError } from "./preview-binary-reader"
import { parsePreviewLibrary } from "./preview-library-parser"
import { OrcadSchematicPreviewDocument } from "./preview-nodes"
import { parsePreviewPage } from "./preview-page-parser"
import type {
  OrcadSchematicPreviewLimitation,
  OrcadSchematicPreviewWarning,
  ParseOrcadDsnPreviewInput,
} from "./preview-types"
import {
  type CompoundFileStream,
  readCompoundFileStreams,
} from "./read-compound-file-streams"

const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const

const limitations = Object.freeze([
  Object.freeze({
    code: "preview_only",
    message:
      "This result is a bounded visual Preview, not a complete semantic parse.",
  }),
  Object.freeze({
    code: "symbol_graphics_not_decoded",
    message: "Library symbol graphics are not decoded.",
  }),
  Object.freeze({
    code: "package_pin_mapping_not_decoded",
    message: "Logical-to-physical package pin mappings are not decoded.",
  }),
  Object.freeze({
    code: "placement_transform_not_interpreted",
    message: "Opaque placed-instance fields are not interpreted as transforms.",
  }),
  Object.freeze({
    code: "page_tail_not_decoded",
    message: "Page sections after off-page connectors are not decoded.",
  }),
  Object.freeze({
    code: "hierarchical_connectivity_not_resolved",
    message: "Hierarchical connectivity is not resolved.",
  }),
  Object.freeze({
    code: "page_order_not_resolved",
    message:
      "Pages are returned in deterministic stream-path order, not a decoded design order.",
  }),
  Object.freeze({
    code: "record_framing_is_heuristic",
    message:
      "The source implementation auto-detects record-prefix depth; this port keeps that bounded heuristic.",
  }),
]) satisfies readonly OrcadSchematicPreviewLimitation[]

export function parseOrcadDsnPreview(
  input: ParseOrcadDsnPreviewInput,
): OrcadSchematicPreviewDocument {
  if (!(input.bytes instanceof Uint8Array)) {
    throw new TypeError("OrCAD Preview bytes must be a Uint8Array")
  }
  if (looksLikeTextualSpecctra(input.bytes)) {
    throw new Error(
      "OrCAD Preview rejected this file because textual SPECCTRA .dsn is not supported by orcadts",
    )
  }
  if (!hasCfbSignature(input.bytes)) {
    throw new Error(
      "OrCAD Preview requires the CFB signature D0 CF 11 E0 A1 B1 1A E1",
    )
  }

  const streams = readCompoundFileStreams(input.bytes, input.bytes.byteLength)
  const libraryStream = streams.find((stream) => stream.path === "Library")
  if (!libraryStream) {
    throw new Error(
      "OrCAD Preview requires a root Library stream in the Capture CFB container",
    )
  }
  const library = parsePreviewLibrary({
    bytes: libraryStream.bytes,
    streamPath: libraryStream.path,
  })
  if (library.databaseKind !== "design") {
    throw new Error(
      `OrCAD Preview requires an OrCAD Windows Design Library introduction, got ${JSON.stringify(library.info.introduction)}`,
    )
  }

  const pageStreams = streams
    .map(toPageStream)
    .filter((page): page is PreviewPageStream => page !== null)
    .sort((left, right) =>
      compareCodeUnits(left.stream.path, right.stream.path),
    )
  if (pageStreams.length === 0) {
    throw new Error(
      "OrCAD Preview requires at least one Views/<view>/Pages/<page> stream",
    )
  }

  const warnings: OrcadSchematicPreviewWarning[] = []
  const pages = []
  for (const pageStream of pageStreams) {
    try {
      const page = parsePreviewPage({
        bytes: pageStream.stream.bytes,
        streamPath: pageStream.stream.path,
        viewName: pageStream.viewName,
        strings: library.strings,
      })
      pages.push(page)
      warnings.push(...page.warnings)
    } catch (error) {
      if (!(error instanceof PreviewBinaryReadError)) throw error
      warnings.push(
        Object.freeze({
          code: "page_stream_unreadable",
          message: error.message,
          streamPath: pageStream.stream.path,
          offset: error.offset,
        }),
      )
    }
  }
  if (pages.length === 0) {
    const firstFailure = warnings.find(
      (warning) => warning.code === "page_stream_unreadable",
    )
    throw new Error(
      `OrCAD Preview could not decode any Capture Page stream${firstFailure ? `: ${firstFailure.message}` : ""}`,
    )
  }

  return new OrcadSchematicPreviewDocument({
    fileName: input.fileName ?? null,
    byteLength: input.bytes.byteLength,
    library: library.info,
    pages,
    warnings,
    limitations,
  })
}

interface PreviewPageStream {
  readonly stream: CompoundFileStream
  readonly viewName: string
}

function toPageStream(stream: CompoundFileStream): PreviewPageStream | null {
  const segments = stream.path.split("/")
  if (
    segments.length !== 4 ||
    segments[0] !== "Views" ||
    segments[2] !== "Pages" ||
    !segments[1] ||
    !segments[3]
  ) {
    return null
  }
  return Object.freeze({ stream, viewName: segments[1] })
}

function hasCfbSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < CFB_SIGNATURE.length) return false
  for (let index = 0; index < CFB_SIGNATURE.length; index += 1) {
    if (bytes[index] !== CFB_SIGNATURE[index]) return false
  }
  return true
}

function looksLikeTextualSpecctra(bytes: Uint8Array): boolean {
  const prefix = new TextDecoder().decode(bytes.subarray(0, 512))
  const normalized = prefix.replace(/^\uFEFF?\s*/u, "").toLowerCase()
  return normalized.startsWith("(") && /\(\s*pcb(?:\s|\))/u.test(normalized)
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
