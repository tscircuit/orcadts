# OrCAD schematic Preview and visual tests

`orcadts` has an explicitly partial Preview path for inspecting OrCAD Capture
schematic page geometry before full lossless semantic parsing exists. The
Preview API is separate from `parseOrcadFile()`: it does not make native edit,
write, or Cadence-reopen claims.

## Open fixtures

Run:

```sh
bun run download-references
```

The script retrieves MIT-licensed non-inverting-amplifier and integrator
projects from `Devangvk/Op-Amp-Circuits` at an immutable commit. It downloads
the native Capture `.DSN`, each `.opj`, and the publisher's PNG of each
schematic, and checks the byte length and SHA-256 of the complete batch before
writing any file. Full provenance and the retained license notice are in
[`../references/README.md`](../references/README.md).

The `.DSN` starts with the CFB/OLE signature. That content check matters because
`.dsn` can also identify the unrelated text-based SPECCTRA PCB interchange
format.

The v0 CFB reader accepts ASCII directory and stream names only. It rejects a
non-ASCII CFB name with an explicit error rather than applying a platform- or
Unicode-version-dependent case-folding rule. Expanding that boundary requires a
separately reviewed, deterministic CFB simple-uppercase implementation.

## What the fixture-backed SVGs prove

The fixture-backed SVG tests exercise this chain:

```text
Capture DSN (CFB/OLE)
  -> Library string table + Views/.../Pages stream
  -> typed Preview page nodes
  -> deterministic SVG reconstruction
  -> committed visual snapshot
```

They establish that the parser can recover enough page placement data to make
recognizable diagnostic views of two flat, single-page designs. The integrator
fixture is fully consumed by the bounded Page reader and adds capacitor and
TL084 placement coverage. Neither fixture proves faithful symbol-library
rendering, rotation/mirroring, hierarchy, connectivity, or native
serialization. Those limitations are carried on the Preview document and
embedded in the SVG metadata.

## Explicitly heuristic symbol reconstruction

The SVG renderer recognizes exactly six package names: `R.Normal`, `C.Normal`,
`VDC.Normal`, `VSIN.Normal`, `TL082.Normal`, and `TL084.Normal`. It reconstructs
a resistor, capacitor, DC source, sine source, or op-amp from the component's
neutral structure-`0x10` record positions. The capacitor uses only the axis
between its two decoded positions; the two plates and their gap are renderer
geometry. It does not interpret any opaque structure-`0x10` values as pins,
terminals, or net identifiers, and it does not infer electrical attachments
from those positions.

Before drawing, the renderer sorts the positions and rejects duplicates. A
missing, duplicate, non-finite, undersized, or otherwise degenerate point set
uses a small generic box at the decoded component position. Unknown and
near-match package names use that same fallback. This keeps record order and
opaque values from affecting SVG geometry.

The SVG root and reconstructed component graphics carry machine-readable
`data-render-mode`, `data-geometry-source`, and `data-symbol-inference`
annotations. The upper-minus/lower-plus marks inside the op-amp are explicitly
tagged as a diagram convention; they are not decoded pin polarity. The
`TL082.Normal` and `TL084.Normal` reconstructions also get their exact
package-base labels above the triangle, explicitly sourced from the package-name
allowlist. The renderer does not infer missing resistor or capacitor values.
Supported `VSIN.Normal` parameters are formatted as `NAME = value` and tagged as
a text-format inference.

The exact, case-sensitive global-name allowlist for ground/common graphics is
`0`, `GND`, `GROUND`, and `COMMON`. Near matches such as `NOTGND` are not treated
as ground. Allowlisted graphics normally use the decoded net-symbol position. To
avoid a visually detached glyph, the renderer may move only the SVG graphic to
the nearest decoded wire endpoint within 10 source units. That placement carries
`data-attachment-inference="nearest-wire-endpoint"`; it does not mutate Preview
nodes or create API connectivity. Distant and unrecognized symbols retain their
decoded position. Bounds are never used as a guessed attachment.

Display-property offsets are component-relative placements. For deterministic
Preview output, the renderer adds 8 source units (80% of its fixed 10-unit font)
to convert the stored text-box top to an alphabetic baseline. Every ordinary
text element using this renderer-only adjustment carries
`data-placement-inference="component-relative-top-to-baseline"`. Display text is
retained regardless of its decoded color, including color 28. Properties whose
decoded name begins with `BiasValue` remain visible as small, de-emphasized
diagnostic annotations outside the inferred symbol geometry. Their SVG elements
retain the raw component-position-plus-property-offset source position as
metadata, before the 8-unit baseline adjustment, and carry explicit placement
and unresolved-visibility inference tags.

The computed `viewBox` iteratively includes wires, every neutral structure-`0x10`
position, decoded and heuristic text placements, diagnostic/package labels, and
decoded or snapped net-symbol graphics. The serializer also appends large page
collections iteratively rather than spreading them into function arguments.
Source strings are normalized to XML 1.0 character rules: invalid controls, lone
UTF-16 surrogates, and forbidden scalar values become U+FFFD before XML entity
escaping.

Update the intentional SVG snapshot with:

```sh
bun run test:update-svg
```

Review the changed SVG beside the downloaded publisher PNG before accepting it.
The PNGs are visual oracles, not pixel-equality targets: the Preview renderer
uses heuristic reconstructed symbols instead of Cadence's own symbol graphics
and fonts.

## Validation ladder

Use several independent checks rather than relying on a parser to validate
itself:

1. Assert decoded fixture facts such as page count, wire count, component
   references, neutral structure-`0x10` coordinates, and aliases.
2. Snapshot the deterministic reconstructed SVG.
3. Compare that SVG manually or perceptually with the publisher-authored PNG.
4. Import the same DSN with an independently implemented tool and compare
   topology and placement.
5. Before any native writing claim, open and save the result in a pinned licensed
   Cadence Capture version and reopen it on a self-hosted runner or as a
   documented release check.

As of July 2026, KiCad master includes a native OrCAD Capture binary schematic
importer wired into `kicad-cli sch import`. The
[upstream importer commit](https://gitlab.com/kicad/code/kicad/-/commit/50791979d46ecbd2d62de2d489c443e3e23e458a)
describes its supported records and limitations. A future CI oracle can invoke a
pinned KiCad nightly container as a separate process, then export a KiCad SVG or
structured schematic for comparison. KiCad's
[official container documentation](https://gitlab.com/kicad/packaging/kicad-docker/-/raw/main/README.md)
provides nightly/monthly image tags intended for `kicad-cli` CI use. Pin an image
digest rather than a rolling tag before making this a required test.

KiCad output will have KiCad styling, so use it for independent semantic and
placement checks, not as a pixel-perfect Cadence rendering oracle.
