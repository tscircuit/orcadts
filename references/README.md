# Reference fixtures

No third-party OrCAD Capture files are committed to this repository. Run the
hash-pinned downloader to install the ignored reference corpus locally:

```sh
bun run download-references
```

The opaque-preservation unit tests still use small arbitrary byte sequences.
The SVG suite uses the downloaded native design to exercise the separate partial
Preview parser and deterministic renderer. That test establishes only the
bounded capabilities recorded in `docs/preview-svg.md`; it does not establish
complete semantic or native-write support.

## Open OrCAD Capture samples

The downloader retrieves the **Non-inverting Amplifier** and **Integrator**
projects from
[`Devangvk/Op-Amp-Circuits`](https://github.com/Devangvk/Op-Amp-Circuits),
pinned to commit
[`d2c2376c17dd503341feb1e816d88bdfa5dc7625`](https://github.com/Devangvk/Op-Amp-Circuits/commit/d2c2376c17dd503341feb1e816d88bdfa5dc7625)
from June 14, 2023. The upstream README identifies the designs as OrCAD Capture
schematics simulated with PSpice. It does not state the OrCAD application
version.

The repository and design files are published under the
[`MIT License`](https://github.com/Devangvk/Op-Amp-Circuits/blob/d2c2376c17dd503341feb1e816d88bdfa5dc7625/LICENSE),
copyright 2023 Devang Khetia. Retain that copyright and license notice when
redistributing substantial portions of the fixture or a derived visual. A
verbatim copy is retained at
[`licenses/Devangvk-Op-Amp-Circuits-MIT.txt`](licenses/Devangvk-Op-Amp-Circuits-MIT.txt).

The Non-inverting Amplifier outputs are written below
`references/files/op-amp-circuits/non-inverting-amplifier/`:

| Local file | Upstream member | Bytes | SHA-256 | Intended use |
| --- | --- | ---: | --- | --- |
| `NONINVAMP.DSN` | [`Op Amp Circuits/Non-inverting Amplifier/NONINVAMP.DSN`](https://github.com/Devangvk/Op-Amp-Circuits/blob/d2c2376c17dd503341feb1e816d88bdfa5dc7625/Op%20Amp%20Circuits/Non-inverting%20Amplifier/NONINVAMP.DSN) | 24,064 | `d25e4388e051da1418733ef837badb4b8ad98f0b407225df84b0379a9362b6a8` | Preview parser and SVG snapshot fixture |
| `noninvSch.PNG` | [`Op Amp Circuits/Non-inverting Amplifier/noninvSch.PNG`](https://github.com/Devangvk/Op-Amp-Circuits/blob/d2c2376c17dd503341feb1e816d88bdfa5dc7625/Op%20Amp%20Circuits/Non-inverting%20Amplifier/noninvSch.PNG) | 17,836 | `f30b2c937846f7d96ad0ade0a48f9533bffab3890e1a9cb778c3a7a0a848560e` | Publisher-authored visual oracle for human review |
| `noninvamp.opj` | [`Op Amp Circuits/Non-inverting Amplifier/noninvamp.opj`](https://github.com/Devangvk/Op-Amp-Circuits/blob/d2c2376c17dd503341feb1e816d88bdfa5dc7625/Op%20Amp%20Circuits/Non-inverting%20Amplifier/noninvamp.opj) | 2,023 | `516f4eeb18a54124c2a4c979f457ec9d507ca3b3ba59e5bbdd12babf871bb416` | Capture project context |

The Integrator outputs are written below
`references/files/op-amp-circuits/integrator/`:

| Local file | Upstream member | Bytes | SHA-256 | Intended use |
| --- | --- | ---: | --- | --- |
| `INTEGRATOR.DSN` | [`Op Amp Circuits/Integrator/INTEGRATOR.DSN`](https://github.com/Devangvk/Op-Amp-Circuits/blob/d2c2376c17dd503341feb1e816d88bdfa5dc7625/Op%20Amp%20Circuits/Integrator/INTEGRATOR.DSN) | 28,672 | `654fde997ac84a3acffdbe6cb78fd905a32bffe8b97f463744df39abfad05bf0` | Preview parser and SVG snapshot fixture |
| `intSch.PNG` | [`Op Amp Circuits/Integrator/intSch.PNG`](https://github.com/Devangvk/Op-Amp-Circuits/blob/d2c2376c17dd503341feb1e816d88bdfa5dc7625/Op%20Amp%20Circuits/Integrator/intSch.PNG) | 22,651 | `c42313c2c3da29c6ea2e47f8c4f5278712158630c4294018ff33c459c9744080` | Publisher-authored visual oracle for human review |
| `Integrator.opj` | [`Op Amp Circuits/Integrator/Integrator.opj`](https://github.com/Devangvk/Op-Amp-Circuits/blob/d2c2376c17dd503341feb1e816d88bdfa5dc7625/Op%20Amp%20Circuits/Integrator/Integrator.opj) | 2,418 | `9fbdd1e0e2cd763a6221c57d6c349c2a4932694211e53bfd0eb84d255c951e67` | Capture project context; SPB 17.2 library paths are a provenance hint, not definitive save-version metadata |

The direct artifact URLs include the immutable commit and percent-encoded source
path in `scripts/download-references.ts`. The script validates the expected byte
length and SHA-256 digest before it writes any downloaded file. Output paths are
restricted to `references/files`, and the complete download batch is verified
before writes begin.

## Primary format-role evidence

These official links establish product/file-role context; they are not native
format specifications and do not grant permission to redistribute artifacts:

- [Cadence OrCAD X Free Viewer](https://www.cadence.com/en_US/home/tools/pcb-design-and-analysis/orcad/orcad-free-viewer.html)
  documents the viewer and the OrCAD Capture project, design, and library file
  extensions it accepts.
- [Cadence OrCAD X FAQ](https://www.cadence.com/en_US/home/tools/pcb-design-and-analysis/orcad/faqs.html)
  provides current first-party product and compatibility context.
- [Texas Instruments TMDS62LEVM design-file contents, September 2025](https://www.ti.com/lit/po/sprt799/sprt799.pdf)
  is a first-party example of an OrCAD/Allegro EVM deliverable. It is evidence of
  a real distribution workflow, not permission to copy its contents into this
  repository.

## Adding real references

Prefer files published by Cadence, Texas Instruments, or another owner that
expressly permits the intended testing use. For every fixture, record:

- original HTTPS download page and direct artifact URL;
- publisher, design name, tool/version metadata, and immutable revision;
- redistribution and use terms;
- outer archive and extracted-file SHA-256 hashes;
- exact archive member path and expected byte length;
- which tests consume it and which claims those tests establish.

Large or non-redistributable files should be downloaded by an opt-in script into
an ignored directory. The script must pin hashes and fail closed on mismatch. It
must defend against archive path traversal, unexpected expansion, and silent
upstream replacement.

## Validation ladder

Reference tests should be added in this order:

1. Inventory containers and record boundaries without semantic claims.
2. Detect truncation and malformed lengths safely.
3. Preserve every unrecognized record and byte range in source order.
4. Assert that `getBytes()` returns an exact copy of every input byte.
5. Assert focused semantics only for independently understood records.
6. Reopen generated or edited artifacts in a pinned Cadence version on a
   licensed self-hosted runner or in a documented manual release test.

In-package decode/write checks can miss a shared mistake. Cadence reopen testing
is therefore required before the project claims native writing or edit
compatibility. A viewer can help with inspection but is not a substitute for
authoring-tool acceptance and save/reopen validation.
