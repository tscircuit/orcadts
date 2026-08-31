# Architecture

## v0 objective

The first release establishes truthful opaque-byte foundations and an
explicitly partial read-only Preview path for renderer research. It recognizes
filename extensions as hints, retains arbitrary source bytes exactly, and can
decode a bounded subset of real OrCAD Capture Page streams without presenting
that subset as a complete semantic document.

```text
filename ──> extension-only hint
bytes ─────> defensive copy ──> OrcadRawDocument ──> fresh exact copy
bytes ─────> parseOrcadFile() ──> explicit unsupported-operation error
Capture CFB bytes ──> parseOrcadDsnPreview() ──> typed partial geometry
Preview page ───────> serializeOrcadSchematicPreviewToSvg() ──> diagnostic SVG
```

This split prevents two easy mistakes: treating an extension as a file signature
and treating an opaque byte holder as a parsed design.

### Partial Preview model

`parseOrcadDsnPreview()` is deliberately separate from the reserved semantic
entrypoint. It requires CFB magic, an `OrCAD Windows Design` Library stream, and
at least one Capture Page stream. It extracts the Library string table and a
bounded Page prefix consisting of nets, wires, placed instances, neutral
structure-`0x10` records, globals, ports, and off-page connectors.

The Preview tree follows the ecosystem's class model:

```text
OrcadSchematicPreviewDocument
└── OrcadSchematicPreviewPage
    ├── OrcadSchematicPreviewWire
    ├── OrcadSchematicPreviewComponent
    │   └── OrcadSchematicPreviewT0x10Record
    └── OrcadSchematicPreviewNetSymbol
```

Nodes use init-object constructors, stable `type` discriminants, readonly
copies, and `getChildren()`. Unknown Page-tail sections are not silently called
parsed: byte counts, warnings, and document-level limitations make the boundary
visible. The SVG serializer consumes this model and labels itself
`partial-preview` in metadata.

## Public layers

### Node model

`OrcadNode` supplies the common `type` and `getChildren()` shape used by
tscircuit format libraries. `OrcadRawNode` is the unknown-content node. It owns a
defensive source copy, has no decoded children, and returns a fresh exact copy
from `getBytes()`.

`OrcadRawDocument` is the current root. Its single child is the raw source node;
it also carries the filename and its explicitly non-authoritative `OrcadFileHint`.
Both constructor input and `getBytes()` output are copied, so callers cannot
mutate the retained source through shared `Uint8Array` storage.

### Filename hints

`classifyOrcadFileHint()` examines only the final filename extension, without
sniffing bytes. Recognized hints have `confidence: "extension_only"`. `.dsn`
also has `ambiguities: ["specctra_dsn"]` because the same extension can name a
Specctra S-expression design. `dsnts`, not this package, owns that format.

### Compatibility

`orcadCompatibilityManifest` describes support per extension and operation.
`getOrcadCompatibility()` provides a small lookup without collapsing several
different capabilities into a misleading boolean. Exact raw preservation,
semantic parsing, semantic writing, and Cadence reopen validation are separate.

### Semantic parser boundary

`parseOrcadFile()` is reserved for a future semantic parser and currently always
throws `UnsupportedOrcadSemanticParseError`. The error includes the source byte
length and filename hint and directs callers to `OrcadRawDocument` when opaque
preservation is sufficient.

## Future decoder shape

Semantic support should be added in evidence-backed layers:

1. Expand content-based family/version detection and negative Specctra tests.
2. Harden container decoding with explicit input, entry-count, stream-size,
   allocation, truncation, and nesting limits.
3. Add lossless syntax records that retain offsets, source ordering, duplicate
   and unknown fields, padding, and original byte ranges.
4. Expand typed nodes for independently understood records.
5. Reference and connectivity indexes built from typed nodes without destroying
   the source representation.
6. Validation and diagnostics that distinguish malformed, unsupported, and
   merely unknown content.
7. Native serialization gated by mutation tracking and independent Cadence
   reopen tests.

No stage should infer a Capture signature from the extension alone. A future
writer must refuse output whenever it cannot prove that a mutation is safe.

## Package boundary

The package has no filesystem API. Its core accepts `Uint8Array`; the Preview
path uses the bounded in-repository CFB/OLE stream reader. File loading,
archives, command-line tools, Circuit JSON mapping, and export workflows belong
in separate packages or future explicit subpath entrypoints.
