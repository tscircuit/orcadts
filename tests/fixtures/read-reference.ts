import { readFile } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"

const referencesRoot = resolve(
  import.meta.dir,
  "..",
  "..",
  "references",
  "files",
)

function resolveReferencePath(referencePath: string): string {
  if (isAbsolute(referencePath)) {
    throw new Error(`Reference path must be relative: ${referencePath}`)
  }

  const resolvedPath = resolve(referencesRoot, referencePath)
  const relativePath = relative(referencesRoot, resolvedPath)
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Reference path escapes references/files: ${referencePath}`)
  }

  return resolvedPath
}

export async function readReferenceBytes(
  referencePath: string,
): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFile(resolveReferencePath(referencePath)))
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `Reference file is not downloaded: ${referencePath}. Run \`bun run download-references\` first.`,
        { cause: error },
      )
    }
    throw error
  }
}
