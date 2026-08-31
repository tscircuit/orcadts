# License policy

`orcadts` is distributed under the MIT License. Original project source uses the
repository `LICENSE`; substantial MIT-licensed ports retain their upstream
copyright and permission notices beside the relevant code.

## Source and runtime boundary

- Incorporated source must be MIT-licensed. Do not copy or adapt Apache-2.0,
  GPL, LGPL, AGPL, MPL, source-available, or license-unclear code.
- Prefer no runtime dependencies. Any runtime dependency must use MIT, ISC,
  BSD-2-Clause, or BSD-3-Clause terms, be pinned exactly, and have its full
  transitive graph audited before merge.
- Keep `bun.lock` committed so dependency review is reproducible.
- Record the upstream repository, immutable revision, copyright, license, and
  purpose for every substantial incorporated implementation.

The Preview parser currently retains two MIT notices in `lib/preview`: the
OrCAD record-layout implementation is based on OpenOrCadParser, and the bounded
CFB reader is based on archive-codec with additional validation.

## Development tools

Development tools are installed only for contributors and are not included in
the published package. Biome is selected under its MIT option. The TypeScript
compiler is Apache-2.0 development tooling; none of its source or binaries are
incorporated into or redistributed with `orcadts`. If the policy later expands
to forbid Apache-2.0 tooling as well as incorporated code, the compiler must be
replaced before release rather than silently exempted.

## Fixtures

Downloaded fixtures must expressly permit test use and redistribution of any
committed derivative. Keep native third-party files ignored unless distribution
is necessary, and document immutable URLs, hashes, and retained license notices
in `references/README.md`.
