# Third-party notices for the partial OrCAD DSN Preview parser

Every incorporated implementation in this directory is available under the MIT
License. No Apache-2.0, copyleft, or source-available implementation is included.

## OpenOrCadParser

The OrCAD record readers are a TypeScript port and bounded reimplementation of
record layouts documented by
[OpenOrCadParser](https://github.com/Werni2A/OpenOrCadParser) at commit
`be0a83ac119390044952cf9bed1e0fb86c448f44`.

Copyright (c) 2021 Dominik Wernberger

Licensed under the MIT License. The complete notice is included in
`open-orcad-parser-mit-license.txt` in this directory.

## archive-codec CFB reader

The bounded Compound File Binary stream reader is adapted from the MIT-licensed
`archive-codec` 1.2.0 implementation in
[`ExaDev/documents.js`](https://github.com/ExaDev/documents.js) at commit
`682dc32c6172afb6f764147a2ce6afaea57fdfd0`. The port adds stricter allocation,
duplicate-sector, sector-role, and version-3 stream-size checks.

Copyright (c) 2026 Joseph Mearman

Licensed under the MIT License. The complete notice is included in
`archive-codec-mit-license.txt` in this directory.
