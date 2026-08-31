import { expect } from "bun:test"
import { mkdir } from "node:fs/promises"
import { basename, dirname, join } from "node:path"

export async function expectSvgSnapshot(
  actual: string,
  testFilePath: string,
): Promise<void> {
  const snapshotName = basename(testFilePath).replace(
    /\.test\.[cm]?[jt]sx?$/,
    ".snap.svg",
  )
  const snapshotPath = join(
    dirname(testFilePath),
    "__snapshots__",
    snapshotName,
  )
  const snapshotFile = Bun.file(snapshotPath)

  if (process.env.BUN_UPDATE_SNAPSHOTS === "1") {
    await mkdir(dirname(snapshotPath), { recursive: true })
    await Bun.write(snapshotPath, actual)
  } else if (!(await snapshotFile.exists())) {
    throw new Error(
      `Missing SVG snapshot ${snapshotPath}; run bun run test:update-svg to create it`,
    )
  }

  expect(actual).toBe(await Bun.file(snapshotPath).text())
}
