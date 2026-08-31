import { resolve } from "node:path"

interface PackageManifest {
  readonly license?: string
  readonly dependencies?: Readonly<Record<string, string>>
  readonly optionalDependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
  readonly bundledDependencies?: readonly string[]
  readonly devDependencies?: Readonly<Record<string, string>>
}

interface InstalledPackageManifest {
  readonly name?: string
  readonly version?: string
  readonly license?: string
}

const repositoryRoot = resolve(import.meta.dir, "..")
const approvedRuntimeDependencies: Readonly<Record<string, string>> = {}
const auditedDevelopmentTools = {
  "@biomejs/biome": {
    version: "2.5.11",
    license: "MIT OR Apache-2.0",
    use: "selected under the MIT option",
  },
  "@types/bun": {
    version: "1.4.0",
    license: "MIT",
    use: "development types only",
  },
  typescript: {
    version: "5.9.3",
    license: "Apache-2.0",
    use: "development compiler only; not packaged or redistributed",
  },
} as const
const auditedLockPackages = {
  "@biomejs/biome": { version: "2.5.11", license: "MIT option" },
  "@biomejs/cli-darwin-arm64": { version: "2.5.11", license: "MIT option" },
  "@biomejs/cli-darwin-x64": { version: "2.5.11", license: "MIT option" },
  "@biomejs/cli-linux-arm64": { version: "2.5.11", license: "MIT option" },
  "@biomejs/cli-linux-arm64-musl": {
    version: "2.5.11",
    license: "MIT option",
  },
  "@biomejs/cli-linux-x64": { version: "2.5.11", license: "MIT option" },
  "@biomejs/cli-linux-x64-musl": {
    version: "2.5.11",
    license: "MIT option",
  },
  "@biomejs/cli-win32-arm64": { version: "2.5.11", license: "MIT option" },
  "@biomejs/cli-win32-x64": { version: "2.5.11", license: "MIT option" },
  "@types/bun": { version: "1.4.0", license: "MIT" },
  "@types/node": { version: "26.4.0", license: "MIT" },
  "bun-types": { version: "1.4.0", license: "MIT" },
  typescript: { version: "5.9.3", license: "Apache-2.0 development-only" },
  "undici-types": { version: "8.3.0", license: "MIT" },
} as const

const manifest = await readJson<PackageManifest>(
  resolve(repositoryRoot, "package.json"),
)

assertEqual(manifest.license, "MIT", "package license")
assertDependencyMap(
  manifest.dependencies,
  approvedRuntimeDependencies,
  "runtime dependencies",
)
assertDependencyMap(manifest.optionalDependencies, {}, "optional dependencies")
assertDependencyMap(manifest.peerDependencies, {}, "peer dependencies")

if ((manifest.bundledDependencies?.length ?? 0) > 0) {
  throw new Error(
    "Bundled dependencies are not permitted by the license policy",
  )
}

const declaredDevelopmentTools = manifest.devDependencies ?? {}
assertDependencyMap(
  declaredDevelopmentTools,
  Object.fromEntries(
    Object.entries(auditedDevelopmentTools).map(([name, audit]) => [
      name,
      audit.version,
    ]),
  ),
  "development dependencies",
)

for (const [name, audit] of Object.entries(auditedDevelopmentTools)) {
  const installed = await readJson<InstalledPackageManifest>(
    resolve(repositoryRoot, "node_modules", name, "package.json"),
  )
  assertEqual(installed.name, name, `${name} installed package name`)
  assertEqual(installed.version, audit.version, `${name} installed version`)
  assertEqual(installed.license, audit.license, `${name} installed license`)
}

for (const relativePath of [
  "LICENSE",
  "lib/preview/open-orcad-parser-mit-license.txt",
  "lib/preview/archive-codec-mit-license.txt",
  "references/licenses/Devangvk-Op-Amp-Circuits-MIT.txt",
]) {
  const contents = await Bun.file(resolve(repositoryRoot, relativePath)).text()
  if (!contents.startsWith("MIT License\n")) {
    throw new Error(`${relativePath} is not an MIT license notice`)
  }
}

if (
  await Bun.file(
    resolve(repositoryRoot, "lib/preview/apache-2.0-license.txt"),
  ).exists()
) {
  throw new Error("The source package must not contain an Apache-2.0 license")
}

const lockFile = Bun.file(resolve(repositoryRoot, "bun.lock"))
if (!(await lockFile.exists())) {
  throw new Error(
    "bun.lock must be committed for reproducible dependency review",
  )
}
assertAuditedLock(await lockFile.text())

console.log(
  `License policy verified: MIT package, ${Object.keys(approvedRuntimeDependencies).length} runtime dependencies, ${Object.keys(auditedDevelopmentTools).length} audited development tools, ${Object.keys(auditedLockPackages).length} locked packages`,
)

async function readJson<T>(path: string): Promise<T> {
  const file = Bun.file(path)
  if (!(await file.exists())) throw new Error(`Missing required file: ${path}`)
  return JSON.parse(await file.text()) as T
}

function assertDependencyMap(
  actual: Readonly<Record<string, string>> | undefined,
  expected: Readonly<Record<string, string>>,
  label: string,
): void {
  const normalizedActual = Object.fromEntries(
    Object.entries(actual ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
  const normalizedExpected = Object.fromEntries(
    Object.entries(expected).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    throw new Error(
      `${label} changed without a license-policy audit: expected ${JSON.stringify(normalizedExpected)}, got ${JSON.stringify(normalizedActual)}`,
    )
  }
}

function assertAuditedLock(lockText: string): void {
  const actual = new Map<string, { integrity: string; resolved: string }>()
  const entryPattern = /^ {4}"([^"]+)": \["([^"]+)",.*"(sha512-[^"]+)"\],$/gmu

  for (const match of lockText.matchAll(entryPattern)) {
    const [, name, resolved, integrity] = match
    if (name && resolved && integrity) {
      actual.set(name, { resolved, integrity })
    }
  }

  const expectedNames = Object.keys(auditedLockPackages).sort()
  const actualNames = [...actual.keys()].sort()
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `bun.lock package closure changed without a license audit: expected ${JSON.stringify(expectedNames)}, got ${JSON.stringify(actualNames)}`,
    )
  }

  for (const [name, audit] of Object.entries(auditedLockPackages)) {
    const entry = actual.get(name)
    if (!entry) throw new Error(`bun.lock is missing audited package ${name}`)
    assertEqual(
      entry.resolved,
      `${name}@${audit.version}`,
      `${name} lock version`,
    )
    if (!entry.integrity.startsWith("sha512-")) {
      throw new Error(`${name} lock entry has no SHA-512 integrity`)
    }
  }
}

function assertEqual(
  actual: string | undefined,
  expected: string,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${expected}, got ${actual ?? "missing"}`,
    )
  }
}
