import { describe, expect, test } from "bun:test"
import {
  CompoundFileFormatError,
  MAX_CFB_DIRECTORY_ENTRIES,
  MAX_CFB_INPUT_BYTES,
  MAX_CFB_PATH_CODE_UNITS,
  MAX_CFB_STORAGE_DEPTH,
  MAX_CFB_STREAM_COUNT,
  MAX_CFB_TOTAL_PATH_CODE_UNITS,
  readCompoundFileStreams,
} from "../../lib/preview/read-compound-file-streams"

/**
 * Minimal test-only CFB writer adapted from the MIT-licensed archive-codec CFB
 * test support at ExaDev/documents.js commit
 * 682dc32c6172afb6f764147a2ce6afaea57fdfd0, copyright 2026 Joseph Mearman.
 * The complete upstream MIT grant is retained in the reader under test.
 */

const ENDOFCHAIN = 0xfffffffe
const FREESECT = 0xffffffff
const FATSECT = 0xfffffffd
const DIFSECT = 0xfffffffc
const NOSTREAM = 0xffffffff
const MINI_STREAM_CUTOFF = 4096

interface TestCompoundFile {
  readonly bigPayload: Uint8Array
  readonly bigStartSector: number
  readonly bytes: Uint8Array
  readonly directoryOffset: number
  readonly fatOffset: number
  readonly miniFatOffset: number
  readonly smallPayload: Uint8Array
  readonly sectorCount: number
  readonly sectorSize: number
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true)
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true)
}

function writeDirectoryEntry(
  view: DataView,
  init: {
    readonly child: number
    readonly leftSibling?: number
    readonly name: string
    readonly objectType: number
    readonly rightSibling: number
    readonly size: number
    readonly startSector: number
  },
): void {
  if (init.name.length === 0 || init.name.length > 31) {
    throw new Error(`Invalid test directory name: ${init.name}`)
  }
  for (let offset = 0; offset < 64; offset += 1) view.setUint8(offset, 0)
  for (let index = 0; index < init.name.length; index += 1) {
    view.setUint16(index * 2, init.name.charCodeAt(index), true)
  }
  writeUint16(view, 0x40, init.name.length * 2 + 2)
  view.setUint8(0x42, init.objectType)
  view.setUint8(0x43, 1)
  writeUint32(view, 0x44, init.leftSibling ?? NOSTREAM)
  writeUint32(view, 0x48, init.rightSibling)
  writeUint32(view, 0x4c, init.child)
  writeUint32(view, 0x74, init.startSector)
  writeUint32(view, 0x78, init.size)
  writeUint32(view, 0x7c, 0)
}

function createTestCompoundFile(majorVersion: 3 | 4 = 3): TestCompoundFile {
  const sectorSize = majorVersion === 3 ? 512 : 4096
  const sectorShift = majorVersion === 3 ? 9 : 12
  const bigPayload = Uint8Array.from(
    { length: MINI_STREAM_CUTOFF },
    (_, index) => index % 251,
  )
  const smallPayload = new TextEncoder().encode("nested mini payload")
  const bigStartSector = 2
  const bigSectorCount = Math.ceil(bigPayload.byteLength / sectorSize)
  const miniStreamSector = bigStartSector + bigSectorCount
  const miniFatSector = miniStreamSector + 1
  const sectorCount = miniFatSector + 1
  const bytes = new Uint8Array((sectorCount + 1) * sectorSize)
  const view = new DataView(bytes.buffer)

  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  writeUint16(view, 0x18, 0x003e)
  writeUint16(view, 0x1a, majorVersion)
  writeUint16(view, 0x1c, 0xfffe)
  writeUint16(view, 0x1e, sectorShift)
  writeUint16(view, 0x20, 6)
  writeUint32(view, 0x28, majorVersion === 3 ? 0 : 1)
  writeUint32(view, 0x2c, 1)
  writeUint32(view, 0x30, 1)
  writeUint32(view, 0x38, MINI_STREAM_CUTOFF)
  writeUint32(view, 0x3c, miniFatSector)
  writeUint32(view, 0x40, 1)
  writeUint32(view, 0x44, ENDOFCHAIN)
  writeUint32(view, 0x48, 0)
  for (let index = 0; index < 109; index += 1) {
    writeUint32(view, 0x4c + index * 4, index === 0 ? 0 : FREESECT)
  }

  const fatOffset = sectorSize
  for (let index = 0; index < sectorSize / 4; index += 1) {
    writeUint32(view, fatOffset + index * 4, FREESECT)
  }
  writeUint32(view, fatOffset, FATSECT)
  writeUint32(view, fatOffset + 4, ENDOFCHAIN)
  for (let index = 0; index < bigSectorCount; index += 1) {
    writeUint32(
      view,
      fatOffset + (bigStartSector + index) * 4,
      index === bigSectorCount - 1 ? ENDOFCHAIN : bigStartSector + index + 1,
    )
  }
  writeUint32(view, fatOffset + miniStreamSector * 4, ENDOFCHAIN)
  writeUint32(view, fatOffset + miniFatSector * 4, ENDOFCHAIN)

  const directoryOffset = 2 * sectorSize
  writeDirectoryEntry(new DataView(bytes.buffer, directoryOffset, 128), {
    child: 3,
    name: "Root Entry",
    objectType: 5,
    rightSibling: NOSTREAM,
    size: 64,
    startSector: miniStreamSector,
  })
  writeDirectoryEntry(new DataView(bytes.buffer, directoryOffset + 128, 128), {
    child: 2,
    name: "Folder",
    objectType: 1,
    rightSibling: NOSTREAM,
    size: 0,
    startSector: 0,
  })
  writeDirectoryEntry(new DataView(bytes.buffer, directoryOffset + 256, 128), {
    child: NOSTREAM,
    name: "Small",
    objectType: 2,
    rightSibling: NOSTREAM,
    size: smallPayload.byteLength,
    startSector: 0,
  })
  writeDirectoryEntry(new DataView(bytes.buffer, directoryOffset + 384, 128), {
    child: NOSTREAM,
    name: "Big",
    objectType: 2,
    rightSibling: 1,
    size: bigPayload.byteLength,
    startSector: bigStartSector,
  })

  bytes.set(bigPayload, (bigStartSector + 1) * sectorSize)
  bytes.set(smallPayload, (miniStreamSector + 1) * sectorSize)
  const miniFatOffset = (miniFatSector + 1) * sectorSize
  for (let index = 0; index < sectorSize / 4; index += 1) {
    writeUint32(view, miniFatOffset + index * 4, FREESECT)
  }
  writeUint32(view, miniFatOffset, ENDOFCHAIN)

  return {
    bigPayload,
    bigStartSector,
    bytes,
    directoryOffset,
    fatOffset,
    miniFatOffset,
    sectorCount,
    sectorSize,
    smallPayload,
  }
}

function directoryEntryView(
  fixture: TestCompoundFile,
  entryId: number,
): DataView {
  return new DataView(
    fixture.bytes.buffer,
    fixture.bytes.byteOffset + fixture.directoryOffset + entryId * 128,
    128,
  )
}

function writeDirectoryName(
  fixture: TestCompoundFile,
  entryId: number,
  name: string,
): void {
  if (name.length > 31) throw new Error(`Test name is too long: ${name}`)
  const view = directoryEntryView(fixture, entryId)
  for (let offset = 0; offset < 64; offset += 1) view.setUint8(offset, 0)
  for (let index = 0; index < name.length; index += 1) {
    writeUint16(view, index * 2, name.charCodeAt(index))
  }
  writeUint16(view, 0x40, name.length * 2 + 2)
}

function appendDifatSector(
  fixture: TestCompoundFile,
  roleMarker: number,
): Uint8Array {
  const difatSector = fixture.sectorCount
  const bytes = new Uint8Array(fixture.bytes.byteLength + fixture.sectorSize)
  bytes.set(fixture.bytes)
  const view = new DataView(bytes.buffer)
  writeUint32(view, 0x44, difatSector)
  writeUint32(view, 0x48, 1)
  writeUint32(view, fixture.fatOffset + difatSector * 4, roleMarker)

  const difatOffset = (difatSector + 1) * fixture.sectorSize
  const entriesPerDifatSector = fixture.sectorSize / 4 - 1
  for (let index = 0; index < entriesPerDifatSector; index += 1) {
    writeUint32(view, difatOffset + index * 4, FREESECT)
  }
  writeUint32(view, difatOffset + entriesPerDifatSector * 4, ENDOFCHAIN)
  return bytes
}

function createDirectoryOnlyCompoundFile(
  minimumDirectoryEntries: number,
): TestCompoundFile {
  const sectorSize = 4096
  const entriesPerDirectorySector = sectorSize / 128
  const directorySectorCount = Math.ceil(
    minimumDirectoryEntries / entriesPerDirectorySector,
  )
  const fatEntriesPerSector = sectorSize / 4
  let fatSectorCount = 1
  while (
    fatSectorCount * fatEntriesPerSector <
    fatSectorCount + directorySectorCount
  ) {
    fatSectorCount += 1
  }
  if (fatSectorCount > 109) {
    throw new Error("Test-only CFB needs a DIFAT chain")
  }

  const firstDirectorySector = fatSectorCount
  const sectorCount = fatSectorCount + directorySectorCount
  const bytes = new Uint8Array((sectorCount + 1) * sectorSize)
  const view = new DataView(bytes.buffer)
  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  writeUint16(view, 0x18, 0x003e)
  writeUint16(view, 0x1a, 4)
  writeUint16(view, 0x1c, 0xfffe)
  writeUint16(view, 0x1e, 12)
  writeUint16(view, 0x20, 6)
  writeUint32(view, 0x28, directorySectorCount)
  writeUint32(view, 0x2c, fatSectorCount)
  writeUint32(view, 0x30, firstDirectorySector)
  writeUint32(view, 0x38, MINI_STREAM_CUTOFF)
  writeUint32(view, 0x3c, ENDOFCHAIN)
  writeUint32(view, 0x40, 0)
  writeUint32(view, 0x44, ENDOFCHAIN)
  writeUint32(view, 0x48, 0)
  for (let index = 0; index < 109; index += 1) {
    writeUint32(
      view,
      0x4c + index * 4,
      index < fatSectorCount ? index : FREESECT,
    )
  }

  const fatOffset = sectorSize
  for (
    let index = 0;
    index < fatSectorCount * fatEntriesPerSector;
    index += 1
  ) {
    writeUint32(view, fatOffset + index * 4, FREESECT)
  }
  for (let sector = 0; sector < fatSectorCount; sector += 1) {
    writeUint32(view, fatOffset + sector * 4, FATSECT)
  }
  for (let index = 0; index < directorySectorCount; index += 1) {
    const sector = firstDirectorySector + index
    writeUint32(
      view,
      fatOffset + sector * 4,
      index === directorySectorCount - 1 ? ENDOFCHAIN : sector + 1,
    )
  }

  const directoryOffset = (firstDirectorySector + 1) * sectorSize
  writeDirectoryEntry(new DataView(bytes.buffer, directoryOffset, 128), {
    child: NOSTREAM,
    name: "Root Entry",
    objectType: 5,
    rightSibling: NOSTREAM,
    size: 0,
    startSector: ENDOFCHAIN,
  })

  return {
    bigPayload: new Uint8Array(0),
    bigStartSector: ENDOFCHAIN,
    bytes,
    directoryOffset,
    fatOffset,
    miniFatOffset: 0,
    sectorCount,
    sectorSize,
    smallPayload: new Uint8Array(0),
  }
}

function writeBalancedStreamTree(
  fixture: TestCompoundFile,
  firstEntryId: number,
  streamCount: number,
  nameAtIndex: (index: number) => string,
): number {
  const writeRange = (start: number, end: number): number => {
    if (start >= end) return NOSTREAM
    const middle = Math.floor((start + end) / 2)
    const leftSibling = writeRange(start, middle)
    const rightSibling = writeRange(middle + 1, end)
    const entryId = firstEntryId + middle
    writeDirectoryEntry(directoryEntryView(fixture, entryId), {
      child: NOSTREAM,
      leftSibling,
      name: nameAtIndex(middle),
      objectType: 2,
      rightSibling,
      size: 0,
      startSector: ENDOFCHAIN,
    })
    return entryId
  }
  return writeRange(0, streamCount)
}

function expectFormatError(run: () => unknown, message: RegExp): void {
  try {
    run()
    throw new Error("Expected CompoundFileFormatError")
  } catch (error) {
    expect(error).toBeInstanceOf(CompoundFileFormatError)
    expect((error as Error).message).toMatch(message)
  }
}

describe("readCompoundFileStreams", () => {
  test("extracts nested mini-stream and root FAT streams from CFB v3 and v4", () => {
    for (const majorVersion of [3, 4] as const) {
      const fixture = createTestCompoundFile(majorVersion)
      const streams = readCompoundFileStreams(
        fixture.bytes,
        fixture.smallPayload.byteLength + fixture.bigPayload.byteLength,
      )

      expect(streams.map((stream) => stream.path)).toEqual([
        "Big",
        "Folder/Small",
      ])
      expect(streams[0]?.bytes).toEqual(fixture.bigPayload)
      expect(streams[1]?.bytes).toEqual(fixture.smallPayload)
      expect(Object.isFrozen(streams)).toBe(true)
    }
  })

  test("enforces the cumulative stream output budget before allocation", () => {
    const fixture = createTestCompoundFile()
    expectFormatError(
      () =>
        readCompoundFileStreams(
          fixture.bytes,
          fixture.smallPayload.byteLength + fixture.bigPayload.byteLength - 1,
        ),
      /budget/u,
    )
  })

  test("rejects duplicate and out-of-file FAT sector IDs", () => {
    const duplicate = createTestCompoundFile()
    new DataView(duplicate.bytes.buffer).setUint32(0x50, 0, true)
    expectFormatError(
      () => readCompoundFileStreams(duplicate.bytes, 10_000),
      /repeats FAT sector 0/u,
    )

    const outside = createTestCompoundFile()
    new DataView(outside.bytes.buffer).setUint32(
      0x4c,
      outside.sectorCount,
      true,
    )
    expectFormatError(
      () => readCompoundFileStreams(outside.bytes, 10_000),
      /outside the file/u,
    )
  })

  test("rejects FAT and DIFAT sector-role overlap", () => {
    const fixture = createTestCompoundFile()
    const view = new DataView(fixture.bytes.buffer)
    view.setUint32(0x44, 0, true)
    view.setUint32(0x48, 1, true)
    expectFormatError(
      () => readCompoundFileStreams(fixture.bytes, 10_000),
      /both FAT and DIFAT roles/u,
    )
  })

  test("rejects physical-sector full and suffix overlaps", () => {
    const directoryOverlap = createTestCompoundFile()
    writeUint32(directoryEntryView(directoryOverlap, 0), 0x74, 1)
    expectFormatError(
      () => readCompoundFileStreams(directoryOverlap.bytes, 10_000),
      /Root mini-stream FAT chain overlaps Directory FAT chain/u,
    )

    const suffixOverlap = createTestCompoundFile(3)
    writeDirectoryEntry(directoryEntryView(suffixOverlap, 1), {
      child: NOSTREAM,
      name: "Alias",
      objectType: 2,
      rightSibling: NOSTREAM,
      size: MINI_STREAM_CUTOFF,
      startSector: suffixOverlap.bigStartSector + 1,
    })
    expectFormatError(
      () => readCompoundFileStreams(suffixOverlap.bytes, 10_000),
      /FAT chain for 'Alias' overlaps FAT chain for 'Big'/u,
    )
  })

  test("rejects allocated directory entries that are unreachable from root", () => {
    const fixture = createTestCompoundFile(4)
    writeDirectoryEntry(directoryEntryView(fixture, 4), {
      child: NOSTREAM,
      name: "OrphanAlias",
      objectType: 2,
      rightSibling: NOSTREAM,
      size: fixture.bigPayload.byteLength,
      startSector: fixture.bigStartSector,
    })

    expectFormatError(
      () => readCompoundFileStreams(fixture.bytes, 10_000),
      /Directory entry 4 has nonzero object type 2 but is not reachable/u,
    )
  })

  test("rejects overlapping mini-sector chains", () => {
    const fixture = createTestCompoundFile()
    writeDirectoryEntry(directoryEntryView(fixture, 3), {
      child: NOSTREAM,
      name: "Tiny",
      objectType: 2,
      rightSibling: 1,
      size: 4,
      startSector: 0,
    })

    expectFormatError(
      () => readCompoundFileStreams(fixture.bytes, 10_000),
      /Mini-FAT chain for 'Folder\/Small' overlaps Mini-FAT chain for 'Tiny'/u,
    )
  })

  test("bounds mini-sector traversal by the declared stream size", () => {
    const fixture = createTestCompoundFile()
    writeUint32(directoryEntryView(fixture, 0), 0x78, 128)
    writeUint32(new DataView(fixture.bytes.buffer), fixture.miniFatOffset, 1)
    writeUint32(
      new DataView(fixture.bytes.buffer),
      fixture.miniFatOffset + 4,
      ENDOFCHAIN,
    )

    expectFormatError(
      () => readCompoundFileStreams(fixture.bytes, 10_000),
      /exceeds its 1-mini-sector ceiling/u,
    )
  })

  test("requires FATSECT and DIFSECT role markers", () => {
    const badFatMarker = createTestCompoundFile()
    writeUint32(
      new DataView(badFatMarker.bytes.buffer),
      badFatMarker.fatOffset,
      ENDOFCHAIN,
    )
    expectFormatError(
      () => readCompoundFileStreams(badFatMarker.bytes, 10_000),
      /FAT sector 0 is not marked FATSECT/u,
    )

    const fixture = createTestCompoundFile()
    const validDifat = appendDifatSector(fixture, DIFSECT)
    expect(readCompoundFileStreams(validDifat, 10_000)).toHaveLength(2)

    const badDifatMarker = appendDifatSector(fixture, ENDOFCHAIN)
    expectFormatError(
      () => readCompoundFileStreams(badDifatMarker, 10_000),
      /DIFAT sector .* is not marked DIFSECT/u,
    )
  })

  test("rejects FAT, mini-FAT, and directory-tree cycles", () => {
    const fatCycle = createTestCompoundFile()
    new DataView(fatCycle.bytes.buffer).setUint32(
      fatCycle.sectorSize + fatCycle.bigStartSector * 4,
      fatCycle.bigStartSector,
      true,
    )
    expectFormatError(
      () => readCompoundFileStreams(fatCycle.bytes, 10_000),
      /cycles at sector/u,
    )

    const miniFatCycle = createTestCompoundFile()
    new DataView(miniFatCycle.bytes.buffer).setUint32(
      miniFatCycle.miniFatOffset,
      0,
      true,
    )
    expectFormatError(
      () => readCompoundFileStreams(miniFatCycle.bytes, 10_000),
      /cycles at mini sector/u,
    )

    const directoryCycle = createTestCompoundFile()
    new DataView(directoryCycle.bytes.buffer).setUint32(
      directoryCycle.directoryOffset + 128 + 0x44,
      1,
      true,
    )
    expectFormatError(
      () => readCompoundFileStreams(directoryCycle.bytes, 10_000),
      /reaches entry 1 twice/u,
    )
  })

  test("validates directory name termination and characters", () => {
    const missingTerminator = createTestCompoundFile()
    const bigName = directoryEntryView(missingTerminator, 3)
    writeUint16(bigName, 6, "X".charCodeAt(0))
    expectFormatError(
      () => readCompoundFileStreams(missingTerminator.bytes, 10_000),
      /name is not exactly NUL-terminated/u,
    )

    const embeddedNull = createTestCompoundFile()
    writeUint16(directoryEntryView(embeddedNull, 3), 2, 0)
    expectFormatError(
      () => readCompoundFileStreams(embeddedNull.bytes, 10_000),
      /name is not exactly NUL-terminated/u,
    )

    const emptyName = createTestCompoundFile()
    writeDirectoryName(emptyName, 3, "")
    expectFormatError(
      () => readCompoundFileStreams(emptyName.bytes, 10_000),
      /empty non-root name/u,
    )

    const forbiddenCharacter = createTestCompoundFile()
    writeDirectoryName(forbiddenCharacter, 3, "B:g")
    expectFormatError(
      () => readCompoundFileStreams(forbiddenCharacter.bytes, 10_000),
      /name contains a forbidden/u,
    )

    const wrongRoot = createTestCompoundFile()
    writeDirectoryName(wrongRoot, 0, "Root entry")
    expectFormatError(
      () => readCompoundFileStreams(wrongRoot.bytes, 10_000),
      /Root directory entry name/u,
    )
  })

  test("validates root color and storage starting-sector fields", () => {
    const badRootColor = createTestCompoundFile()
    directoryEntryView(badRootColor, 0).setUint8(0x43, 2)
    expectFormatError(
      () => readCompoundFileStreams(badRootColor.bytes, 10_000),
      /Root directory entry has invalid red-black color 2/u,
    )

    const badStorageStart = createTestCompoundFile()
    writeUint32(directoryEntryView(badStorageStart, 1), 0x74, ENDOFCHAIN)
    expectFormatError(
      () => readCompoundFileStreams(badStorageStart.bytes, 10_000),
      /Storage directory entry 1 has nonzero starting sector/u,
    )
  })

  test("validates stream children and sibling-tree uniqueness and order", () => {
    const streamWithChild = createTestCompoundFile()
    writeUint32(directoryEntryView(streamWithChild, 3), 0x4c, 2)
    expectFormatError(
      () => readCompoundFileStreams(streamWithChild.bytes, 10_000),
      /Stream directory entry 3 has a child pointer/u,
    )

    const duplicateName = createTestCompoundFile()
    writeDirectoryName(duplicateName, 1, "bIG")
    expectFormatError(
      () => readCompoundFileStreams(duplicateName.bytes, 10_000),
      /strictly sorted|duplicate case-insensitive/u,
    )

    const unsorted = createTestCompoundFile()
    writeUint32(directoryEntryView(unsorted, 0), 0x4c, 1)
    writeUint32(directoryEntryView(unsorted, 1), 0x48, 3)
    writeUint32(directoryEntryView(unsorted, 3), 0x48, NOSTREAM)
    expectFormatError(
      () => readCompoundFileStreams(unsorted.bytes, 10_000),
      /sibling tree is not strictly sorted/u,
    )
  })

  test("rejects non-ASCII directory names before comparing them", () => {
    for (const name of ["\u1f80", "\u1f88"]) {
      const fixture = createTestCompoundFile()
      writeDirectoryName(fixture, 3, name)
      expectFormatError(
        () => readCompoundFileStreams(fixture.bytes, 10_000),
        /name contains non-ASCII characters/u,
      )
    }
  })

  test("enforces the storage-depth ceiling without growing path prefixes", () => {
    const fixture = createTestCompoundFile(4)
    writeUint32(directoryEntryView(fixture, 0), 0x4c, 1)
    for (let level = 1; level <= MAX_CFB_STORAGE_DEPTH + 1; level += 1) {
      writeDirectoryEntry(directoryEntryView(fixture, level), {
        child: level + 1,
        name: `S${level.toString().padStart(2, "0")}`,
        objectType: 1,
        rightSibling: NOSTREAM,
        size: 0,
        startSector: 0,
      })
    }
    writeDirectoryEntry(
      directoryEntryView(fixture, MAX_CFB_STORAGE_DEPTH + 2),
      {
        child: NOSTREAM,
        name: "Leaf",
        objectType: 2,
        rightSibling: NOSTREAM,
        size: fixture.smallPayload.byteLength,
        startSector: 0,
      },
    )

    expectFormatError(
      () => readCompoundFileStreams(fixture.bytes, 10_000),
      /storage hierarchy exceeds the 16-level depth ceiling/i,
    )
  })

  test("enforces the individual and cumulative path ceilings", () => {
    const longPath = createDirectoryOnlyCompoundFile(MAX_CFB_STORAGE_DEPTH + 2)
    writeUint32(directoryEntryView(longPath, 0), 0x4c, 1)
    for (let level = 1; level <= MAX_CFB_STORAGE_DEPTH; level += 1) {
      writeDirectoryEntry(directoryEntryView(longPath, level), {
        child: level + 1,
        name: `${"D".repeat(29)}${level.toString().padStart(2, "0")}`,
        objectType: 1,
        rightSibling: NOSTREAM,
        size: 0,
        startSector: 0,
      })
    }
    writeDirectoryEntry(
      directoryEntryView(longPath, MAX_CFB_STORAGE_DEPTH + 1),
      {
        child: NOSTREAM,
        name: "L".repeat(31),
        objectType: 2,
        rightSibling: NOSTREAM,
        size: 0,
        startSector: ENDOFCHAIN,
      },
    )
    expectFormatError(
      () => readCompoundFileStreams(longPath.bytes, 0),
      new RegExp(`${MAX_CFB_PATH_CODE_UNITS}-code-unit ceiling`, "u"),
    )

    const storageCount = MAX_CFB_STORAGE_DEPTH - 1
    const pathCodeUnitsPerStream = storageCount * 32 + 31
    const streamCount =
      Math.floor(MAX_CFB_TOTAL_PATH_CODE_UNITS / pathCodeUnitsPerStream) + 1
    const cumulative = createDirectoryOnlyCompoundFile(
      1 + storageCount + streamCount,
    )
    writeUint32(directoryEntryView(cumulative, 0), 0x4c, 1)
    const firstStreamId = storageCount + 1
    const childTreeRoot = writeBalancedStreamTree(
      cumulative,
      firstStreamId,
      streamCount,
      (index) => `${"X".repeat(26)}${index.toString().padStart(5, "0")}`,
    )
    for (let level = 1; level <= storageCount; level += 1) {
      writeDirectoryEntry(directoryEntryView(cumulative, level), {
        child: level === storageCount ? childTreeRoot : level + 1,
        name: `${"D".repeat(29)}${level.toString().padStart(2, "0")}`,
        objectType: 1,
        rightSibling: NOSTREAM,
        size: 0,
        startSector: 0,
      })
    }
    expect(streamCount).toBeLessThan(MAX_CFB_STREAM_COUNT)
    expectFormatError(
      () => readCompoundFileStreams(cumulative.bytes, 0),
      new RegExp(
        `Cumulative stream paths exceed the ${MAX_CFB_TOTAL_PATH_CODE_UNITS}-code-unit ceiling`,
        "u",
      ),
    )
  })

  test("enforces stream-count and directory-entry ceilings", () => {
    const tooManyStreams = createDirectoryOnlyCompoundFile(
      MAX_CFB_STREAM_COUNT + 2,
    )
    const streamTreeRoot = writeBalancedStreamTree(
      tooManyStreams,
      1,
      MAX_CFB_STREAM_COUNT + 1,
      (index) => `S${index.toString().padStart(5, "0")}`,
    )
    writeUint32(directoryEntryView(tooManyStreams, 0), 0x4c, streamTreeRoot)
    expectFormatError(
      () => readCompoundFileStreams(tooManyStreams.bytes, 0),
      new RegExp(`exceeds the ${MAX_CFB_STREAM_COUNT}-stream ceiling`, "u"),
    )

    const tooManyDirectoryEntries = createDirectoryOnlyCompoundFile(
      MAX_CFB_DIRECTORY_ENTRIES + 1,
    )
    expectFormatError(
      () => readCompoundFileStreams(tooManyDirectoryEntries.bytes, 0),
      /Directory FAT chain exceeds its .*sector ceiling/u,
    )
  })

  test("ignores upper stream-size DWORDs in CFB v3", () => {
    const fixture = createTestCompoundFile(3)
    const view = new DataView(fixture.bytes.buffer)
    view.setUint32(fixture.directoryOffset + 0x7c, 0xffffffff, true)
    view.setUint32(fixture.directoryOffset + 3 * 128 + 0x7c, 0xffffffff, true)

    const streams = readCompoundFileStreams(fixture.bytes, 10_000)
    expect(streams[0]?.bytes).toEqual(fixture.bigPayload)
  })

  test("enforces the version-3 0x80000000-byte size limit", () => {
    const fixture = createTestCompoundFile(3)
    writeUint32(
      new DataView(fixture.bytes.buffer),
      fixture.directoryOffset + 3 * 128 + 0x78,
      0x8000_0001,
    )
    expectFormatError(
      () => readCompoundFileStreams(fixture.bytes, MAX_CFB_INPUT_BYTES),
      /version-3 0x80000000-byte stream-size limit/u,
    )
  })

  test("rejects unsafe 64-bit stream sizes in CFB v4", () => {
    const fixture = createTestCompoundFile(4)
    new DataView(fixture.bytes.buffer).setUint32(
      fixture.directoryOffset + 3 * 128 + 0x7c,
      0x20_0000,
      true,
    )
    expectFormatError(
      () => readCompoundFileStreams(fixture.bytes, MAX_CFB_INPUT_BYTES),
      /safe integer range/u,
    )
  })

  test("rejects invalid budgets and directory references", () => {
    const fixture = createTestCompoundFile()
    expect(() => readCompoundFileStreams(fixture.bytes, -1)).toThrow(RangeError)
    expect(() =>
      readCompoundFileStreams(fixture.bytes, MAX_CFB_INPUT_BYTES + 1),
    ).toThrow(RangeError)

    new DataView(fixture.bytes.buffer).setUint32(
      fixture.directoryOffset + 0x4c,
      100,
      true,
    )
    expectFormatError(
      () => readCompoundFileStreams(fixture.bytes, 10_000),
      /outside its 4 entries/u,
    )
  })

  test("enforces the hard input-byte ceiling before parsing", () => {
    const tooLarge = new Uint8Array(MAX_CFB_INPUT_BYTES + 1)
    expectFormatError(
      () => readCompoundFileStreams(tooLarge, 0),
      new RegExp(`above the ${MAX_CFB_INPUT_BYTES}-byte input ceiling`, "u"),
    )
  })

  test("enforces header constants, reserved bytes, and version counts", () => {
    const badMinorVersion = createTestCompoundFile()
    writeUint16(new DataView(badMinorVersion.bytes.buffer), 0x18, 0x003d)
    expectFormatError(
      () => readCompoundFileStreams(badMinorVersion.bytes, 10_000),
      /minor version 0x3d is not 0x3e/u,
    )

    const badCutoff = createTestCompoundFile()
    writeUint32(new DataView(badCutoff.bytes.buffer), 0x38, 2048)
    expectFormatError(
      () => readCompoundFileStreams(badCutoff.bytes, 10_000),
      /mini stream cutoff 2048 is not 4096/u,
    )

    const badReserved = createTestCompoundFile()
    badReserved.bytes[0x22] = 1
    expectFormatError(
      () => readCompoundFileStreams(badReserved.bytes, 10_000),
      /reserved bytes are not all zeroes/u,
    )

    const badVersion3DirectoryCount = createTestCompoundFile(3)
    writeUint32(new DataView(badVersion3DirectoryCount.bytes.buffer), 0x28, 1)
    expectFormatError(
      () => readCompoundFileStreams(badVersion3DirectoryCount.bytes, 10_000),
      /version 3 declares nonzero directory-sector count/u,
    )

    const badFatCount = createTestCompoundFile()
    writeUint32(new DataView(badFatCount.bytes.buffer), 0x2c, 2)
    expectFormatError(
      () => readCompoundFileStreams(badFatCount.bytes, 10_000),
      /declares 2 FAT sectors but DIFAT names 1/u,
    )

    const badMiniFatCount = createTestCompoundFile()
    writeUint32(new DataView(badMiniFatCount.bytes.buffer), 0x40, 0)
    expectFormatError(
      () => readCompoundFileStreams(badMiniFatCount.bytes, 10_000),
      /mini-FAT start and count disagree/u,
    )
  })

  test("rejects non-sector-aligned input and nonzero version-4 padding", () => {
    const fixture = createTestCompoundFile()
    const trailingByte = new Uint8Array(fixture.bytes.byteLength + 1)
    trailingByte.set(fixture.bytes)
    expectFormatError(
      () => readCompoundFileStreams(trailingByte, 10_000),
      /not a whole number of 512-byte sectors/u,
    )

    const version4 = createTestCompoundFile(4)
    version4.bytes[512] = 1
    expectFormatError(
      () => readCompoundFileStreams(version4.bytes, 10_000),
      /version-4 header padding is not all zeroes/u,
    )
  })

  test("requires trailing FAT and mini-FAT entries to be FREESECT", () => {
    const fatPastEnd = createTestCompoundFile()
    writeUint32(
      new DataView(fatPastEnd.bytes.buffer),
      fatPastEnd.fatOffset + fatPastEnd.sectorCount * 4,
      ENDOFCHAIN,
    )
    expectFormatError(
      () => readCompoundFileStreams(fatPastEnd.bytes, 10_000),
      /past physical end-of-file and is not FREESECT/u,
    )

    const miniFatPastStream = createTestCompoundFile()
    writeUint32(
      new DataView(miniFatPastStream.bytes.buffer),
      miniFatPastStream.miniFatOffset + 4,
      ENDOFCHAIN,
    )
    expectFormatError(
      () => readCompoundFileStreams(miniFatPastStream.bytes, 10_000),
      /past the mini stream and is not FREESECT/u,
    )
  })

  test("rejects FAT sector IDs after an unused DIFAT slot", () => {
    const fixture = createTestCompoundFile()
    const view = new DataView(fixture.bytes.buffer)
    writeUint32(view, 0x4c, FREESECT)
    writeUint32(view, 0x50, 0)
    expectFormatError(
      () => readCompoundFileStreams(fixture.bytes, 10_000),
      /after an unused DIFAT slot/u,
    )
  })
})
