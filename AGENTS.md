# Contributor instructions

## Format boundary

- This repository models the OrCAD Capture family only: `.opj`, Capture `.dsn`,
  and `.olb`.
- Do not add Allegro PCB Editor `.brd` or related board/library formats; those
  belong in `allegrots`.
- Do not parse Specctra `.dsn` or `.ses`; those belong in `dsnts`.
- Treat `.dsn` as ambiguous until content-based detection can prove which format
  is present.

## Evidence standard

- Do not invent native signatures, container structure, record fields, or writer
  behavior.
- Back every semantic claim with a redistributable fixture, provenance, a pinned
  hash, and a focused test.
- Preserve unknown fields, records, byte ranges, ordering, duplicates, padding,
  and terminators once a real decoder exists.
- Refuse modified native serialization until independently reopened by supported
  Cadence software. In-package decode/write checks are not independent proof.

## Code conventions

- Follow `tscircuit/handbook` parser-library and code guidelines.
- Use strict TypeScript, object-shaped constructors, Google-style `Id`/`Api`
  casing, and named or branded identifier types where identifiers are introduced.
- Keep filenames kebab-case and `lib/index.ts` as a thin explicit barrel.
- Every public node extends `OrcadNode`, has a stable `type` discriminant, and
  implements `getChildren()`.
- Never expose mutable internal byte buffers. Copy inputs and outputs.
- Keep unknown content in source order and byte-exact; never silently discard it.

## License boundary

- The repository and all original source are MIT-licensed.
- Do not copy, adapt, or vendor Apache-2.0, GPL, LGPL, MPL, source-available, or
  license-unclear implementations into the source tree.
- Incorporated third-party source must be MIT-licensed and retain its copyright
  and permission notice. ISC and BSD dependencies are allowed only after a
  documented compatibility review; prefer MIT.
- Runtime dependencies require an exact version, a committed lockfile, and a
  transitive license audit before merge.
- Development tools are not distributed library code, but must remain
  permissively licensed and be called out when they are not available under MIT.

## Tests and delivery

- Add unit tests for each new node, detector, parser branch, and error path.
- Add exact opaque-byte copy tests before claiming source preservation.
- Keep external reference files out of git unless their license explicitly allows
  redistribution. Document download URL, revision, license, and SHA-256 hashes.
- Run `bun run test`, `bun run typecheck`, `bun run format:check`, `bun run lint`,
  and `bun run check` before handing off changes.
- Do not publish packages or create releases without explicit authorization.
