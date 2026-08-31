# Compatibility

Support is reported per operation. An extension hint, opaque source copy, parsed
document, editable model, generated native file, and successful vendor reopen
are different claims.

| OrCAD Capture file | Extension hint | Exact opaque byte copy | Partial visual Preview | Semantic parse | Semantic write | Cadence reopen |
| --- | --- | --- | --- | --- | --- | --- |
| Project (`.opj`) | Extension only | Yes | No | Unsupported | Unsupported | Not verified |
| Schematic (`.dsn`) | Extension only; ambiguous | Yes | Bounded subset for recognized CFB Capture designs | Unsupported | Unsupported | Not verified |
| Symbol library (`.olb`) | Extension only | Yes | No | Unsupported | Unsupported | Not verified |

“Exact opaque byte copy” means only that `OrcadRawDocument.getBytes()` returns
the same byte sequence it was given. It is deliberately agnostic about validity,
version, container structure, and meaning. It does not support edits. The
Preview column is separate from semantic parsing because it intentionally omits
unknown and unsupported records instead of preserving a complete lossless AST.

## `.dsn` ownership

The `.dsn` extension cannot establish a file family:

- OrCAD Capture schematic/design databases are in scope for `orcadts`.
- Specctra DSN S-expression designs are in scope for
  [`dsnts`](https://github.com/tscircuit/dsnts).

Accordingly, `classifyOrcadFileHint()` marks `.dsn` with
`ambiguities: ["specctra_dsn"]` and `confidence: "extension_only"`. The separate
Preview entrypoint positively recognizes the CFB/OLE container signature, the
Capture Library marker, and Capture Page storage paths; it rejects textual
SPECCTRA input. That recognition is intentionally not inferred from the
extension.

## Preview boundary

The current Preview reads the Library string table and the leading Page records
needed for wires, placed components, neutral structure-`0x10` positions,
aliases, and common net symbols. It does not claim that structure `0x10` is a
pin, or claim faithful symbol graphics, transforms, hierarchy, page-tail
graphics, logical-to-physical pin mapping, native serialization, or vendor
acceptance. Inspect `document.limitations` and `document.warnings` rather than
treating a successful Preview as a complete parse.

## Claim levels for future work

A new capability should move through these levels independently:

1. **Detected:** stable content evidence identifies the format and version range.
2. **Exact copy:** `getBytes()` matches each fixture byte for byte without
   claiming its structure is understood.
3. **Read:** real fixtures decode without dropping unknown source content.
4. **Edit:** supported mutations survive independent structural and semantic
   checks.
5. **Write:** documents can be authored without copied opaque source.
6. **Vendor verified:** supported Cadence versions reopen and validate output in
   an independent licensed environment.

Tests implemented solely by `orcadts` cannot establish level 6. The public
manifest remains conservative until each level has its own evidence.
