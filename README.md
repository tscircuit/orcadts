# orcadts

Classify filename hints, preserve opaque bytes, and inspect explicitly partial
schematic Preview geometry for files in the OrCAD Capture family.

`orcadts` is intentionally narrow. Its current boundary is:

| Extension | OrCAD Capture role | v0 behavior |
| --- | --- | --- |
| `.opj` | Project | Extension hint and exact opaque-byte copy |
| `.dsn` | Schematic/design database | Extension hint, exact opaque-byte copy, and partial read-only SVG Preview for recognized Capture CFB files |
| `.olb` | Symbol library | Extension hint and exact opaque-byte copy |

The package does **not** yet provide a complete semantic parse, edit, native
write, or Cadence-reopen guarantee. Its separate Preview API decodes a bounded
subset of page geometry for diagnostics and visual regression tests; every
result carries explicit limitations.

## Why `.dsn` needs special care

`.dsn` is not an authoritative format identifier. Both OrCAD Capture schematics
and Specctra interchange files use that extension. `orcadts` owns the OrCAD
Capture interpretation; [`dsnts`](https://github.com/tscircuit/dsnts) owns
Specctra DSN/SES. Filename classification reports the ambiguity. The Preview
entrypoint instead requires CFB/OLE magic, an `OrCAD Windows Design` Library
stream, and at least one `Views/<view>/Pages/<page>` stream before decoding.

## Install (after publication)

```sh
bun add orcadts
```

The package is source-published from `lib/index.ts`, following the current
tscircuit repository convention. It has no build step or runtime dependency.
The bounded CFB and OrCAD record readers are based only on MIT-licensed
implementations; their retained notices are in `lib/preview`.

## Preserve a file exactly

```ts
import { OrcadRawDocument } from "orcadts"

const sourceBytes = new Uint8Array([0x00, 0x4f, 0x72, 0x43, 0x41, 0x44])
const document = new OrcadRawDocument({
  bytes: sourceBytes,
  fileName: "example.dsn",
})

const outputBytes = document.getBytes()
```

The constructor copies `sourceBytes`, and every `getBytes()` call returns a new
copy. Mutating the caller's input or returned output cannot change the stored
source. This is exact opaque-byte copying, not decoding, validation, or editing.

## Classify a filename hint

```ts
import { classifyOrcadFileHint } from "orcadts"

const hint = classifyOrcadFileHint({ fileName: "controller.DSN" })

hint.fileKind // "schematic"
hint.confidence // "extension_only"
hint.ambiguities // ["specctra_dsn"]
```

The classifier deliberately accepts no bytes. A recognized extension always has
`confidence: "extension_only"`; an unrecognized extension has `confidence:
"none"`.

## Reconstruct a diagnostic SVG Preview

```ts
import {
  parseOrcadDsnPreview,
  serializeOrcadSchematicPreviewToSvg,
} from "orcadts"

const preview = parseOrcadDsnPreview({
  bytes: captureDsnBytes,
  fileName: "amplifier.dsn",
})
const svg = serializeOrcadSchematicPreviewToSvg(preview)
```

The typed Preview tree follows the tscircuit parser-library shape:
`OrcadSchematicPreviewDocument` contains pages; pages contain wire, component,
and net-symbol nodes; components contain neutral structure-`0x10` records whose
positions and opaque fields are preserved without claiming pin semantics. All
extend `OrcadNode` and implement `getChildren()`.

This first renderer preserves decoded source placement and draws deterministic
generic symbols. It does not decode the original library graphics, placement
transforms, page-tail graphics, or hierarchy, and it is not a Cadence-quality
rendering. See the [Preview and visual-test guide](docs/preview-svg.md).

## Semantic parsing is explicitly unavailable

`parseOrcadFile()` is reserved as the future semantic entrypoint. In v0 it throws
`UnsupportedOrcadSemanticParseError` with the file hint, byte length, `.dsn`
warning when applicable, and instructions for lossless preservation. Refusing is
safer than returning an opaque object that downstream code could mistake for a
decoded design.

```ts
import { parseOrcadFile } from "orcadts"

parseOrcadFile({ bytes: sourceBytes, fileName: "example.dsn" })
// throws UnsupportedOrcadSemanticParseError in v0
```

See [architecture](docs/architecture.md), the operation-level
[compatibility matrix](docs/compatibility.md), and the
[reference-fixture policy](references/README.md) before extending the package.

## Development

```sh
bun install
bun run download-references
bun run test
bun run test:svg
bun run typecheck
bun run format:check
bun run lint
bun run check
```

The committed `bun.lock` makes dependency and license review reproducible. See
the [license policy](docs/licensing.md) before adding source, dependencies, or
fixtures. This project is not affiliated with or endorsed by Cadence Design
Systems.
