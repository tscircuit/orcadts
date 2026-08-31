import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"

interface ReferenceSpec {
  readonly byteLength: number
  readonly outputPath: string
  readonly sha256: string
  readonly source: string
  readonly url: string
}

const upstreamCommit = "d2c2376c17dd503341feb1e816d88bdfa5dc7625"
const upstreamRawRoot = `https://raw.githubusercontent.com/Devangvk/Op-Amp-Circuits/${upstreamCommit}/Op%20Amp%20Circuits/Non-inverting%20Amplifier`
const fixtureDirectory = "op-amp-circuits/non-inverting-amplifier"

const references: readonly ReferenceSpec[] = [
  {
    byteLength: 24_064,
    outputPath: `${fixtureDirectory}/NONINVAMP.DSN`,
    sha256: "d25e4388e051da1418733ef837badb4b8ad98f0b407225df84b0379a9362b6a8",
    source: `Devangvk/Op-Amp-Circuits@${upstreamCommit} Non-inverting Amplifier design`,
    url: `${upstreamRawRoot}/NONINVAMP.DSN`,
  },
  {
    byteLength: 17_836,
    outputPath: `${fixtureDirectory}/noninvSch.PNG`,
    sha256: "f30b2c937846f7d96ad0ade0a48f9533bffab3890e1a9cb778c3a7a0a848560e",
    source: `Devangvk/Op-Amp-Circuits@${upstreamCommit} published schematic preview`,
    url: `${upstreamRawRoot}/noninvSch.PNG`,
  },
  {
    byteLength: 2_023,
    outputPath: `${fixtureDirectory}/noninvamp.opj`,
    sha256: "516f4eeb18a54124c2a4c979f457ec9d507ca3b3ba59e5bbdd12babf871bb416",
    source: `Devangvk/Op-Amp-Circuits@${upstreamCommit} Non-inverting Amplifier project`,
    url: `${upstreamRawRoot}/noninvamp.opj`,
  },
]

const referencesRoot = resolve(import.meta.dir, "..", "references", "files")

interface VerifiedReference {
  readonly bytes: Uint8Array
  readonly outputPath: string
  readonly source: string
}

function resolveSafeOutputPath(outputPath: string): string {
  if (isAbsolute(outputPath)) {
    throw new Error(`Reference output path must be relative: ${outputPath}`)
  }

  const resolvedPath = resolve(referencesRoot, outputPath)
  const relativePath = relative(referencesRoot, resolvedPath)
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      `Reference output path escapes references/files: ${outputPath}`,
    )
  }

  return resolvedPath
}

function verifyReference(reference: ReferenceSpec, bytes: Uint8Array): void {
  if (bytes.byteLength !== reference.byteLength) {
    throw new Error(
      `${reference.outputPath} byte-length mismatch: expected ${reference.byteLength}, got ${bytes.byteLength}`,
    )
  }

  const actualSha256 = createHash("sha256").update(bytes).digest("hex")
  if (actualSha256 !== reference.sha256) {
    throw new Error(
      `${reference.outputPath} SHA-256 mismatch: expected ${reference.sha256}, got ${actualSha256}`,
    )
  }
}

async function downloadReference(
  reference: ReferenceSpec,
): Promise<VerifiedReference> {
  const outputPath = resolveSafeOutputPath(reference.outputPath)
  const response = await fetch(reference.url)
  if (!response.ok) {
    throw new Error(
      `${reference.url} (${response.status} ${response.statusText})`,
    )
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  verifyReference(reference, bytes)

  return { bytes, outputPath, source: reference.source }
}

const verifiedReferences = await Promise.all(references.map(downloadReference))

for (const reference of verifiedReferences) {
  await mkdir(dirname(reference.outputPath), { recursive: true })
  await writeFile(reference.outputPath, reference.bytes)
  console.log(
    `Saved ${relative(referencesRoot, reference.outputPath)} (${reference.bytes.byteLength} bytes) from ${reference.source}`,
  )
}
