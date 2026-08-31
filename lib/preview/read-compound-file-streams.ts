/**
 * Read-only CFB stream extraction ported from
 * ExaDev/documents.js packages/archive-codec/src/cfb/read.ts at commit
 * 682dc32c6172afb6f764147a2ce6afaea57fdfd0 (archive-codec 1.2.0).
 *
 * Copyright (c) 2026 Joseph Mearman
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Local hardening rejects duplicate or out-of-file FAT sector IDs, rejects
 * FAT/DIFAT role overlap, keeps table and stream allocations input- or
 * output-budget-proportional, and applies the version-specific 64-bit stream
 * size rules required by CFB.
 */

const COMPOUND_FILE_SIGNATURE = [
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
] as const

const ENDOFCHAIN = 0xfffffffe
const FREESECT = 0xffffffff
const FATSECT = 0xfffffffd
const DIFSECT = 0xfffffffc
const NOSTREAM = 0xffffffff
const HEADER_SIZE = 512
const HEADER_DIFAT_ENTRIES = 109
const DIRECTORY_ENTRY_SIZE = 128
const OBJECT_TYPE_STORAGE = 1
const OBJECT_TYPE_STREAM = 2
const OBJECT_TYPE_ROOT = 5
const UINT32_RANGE = 0x1_0000_0000
const VERSION_3_MAX_STREAM_SIZE = 0x8000_0000
const REQUIRED_MINI_STREAM_CUTOFF = 0x1000
const FORBIDDEN_DIRECTORY_NAME_CHARACTERS = /[/\\:!]/u

export const MAX_CFB_INPUT_BYTES = 64 * 1024 * 1024
export const MAX_CFB_DIRECTORY_ENTRIES = 65_536
export const MAX_CFB_STORAGE_DEPTH = 16
export const MAX_CFB_STREAM_COUNT = 8_192
export const MAX_CFB_PATH_CODE_UNITS = 512
export const MAX_CFB_TOTAL_PATH_CODE_UNITS = 1024 * 1024

export class CompoundFileFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CompoundFileFormatError"
  }
}

export interface CompoundFileStream {
  readonly path: string
  readonly bytes: Uint8Array
}

interface DirectoryEntry {
  readonly name: string
  readonly nameLength: number
  readonly objectType: number
  readonly colorFlag: number
  readonly leftSibling: number
  readonly rightSibling: number
  readonly child: number
  readonly startSector: number
  readonly sizeLow: number
  readonly sizeHigh: number
  readonly hasNullTerminator: boolean
}

interface PathPrefix {
  readonly parent: PathPrefix | undefined
  readonly segment: string
  readonly depth: number
  readonly codeUnitsWithSeparators: number
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true)
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true)
}

function hasCompoundFileSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < COMPOUND_FILE_SIGNATURE.length) return false

  for (let index = 0; index < COMPOUND_FILE_SIGNATURE.length; index += 1) {
    if (bytes[index] !== COMPOUND_FILE_SIGNATURE[index]) return false
  }
  return true
}

function isZeroRange(bytes: Uint8Array, start: number, end: number): boolean {
  for (let offset = start; offset < end; offset += 1) {
    if (bytes[offset] !== 0) return false
  }
  return true
}

function uppercaseAsciiDirectoryCodeUnit(codeUnit: number): number {
  return codeUnit >= 0x61 && codeUnit <= 0x7a ? codeUnit - 0x20 : codeUnit
}

function compareDirectoryNames(
  left: DirectoryEntry,
  right: DirectoryEntry,
): number {
  if (left.nameLength !== right.nameLength) {
    return left.nameLength - right.nameLength
  }
  for (let index = 0; index < left.name.length; index += 1) {
    const difference =
      uppercaseAsciiDirectoryCodeUnit(left.name.charCodeAt(index)) -
      uppercaseAsciiDirectoryCodeUnit(right.name.charCodeAt(index))
    if (difference !== 0) return difference
  }
  return 0
}

function directoryNameSortKey(entry: DirectoryEntry): string {
  const codeUnits: string[] = []
  for (let index = 0; index < entry.name.length; index += 1) {
    codeUnits.push(
      uppercaseAsciiDirectoryCodeUnit(entry.name.charCodeAt(index))
        .toString(16)
        .padStart(4, "0"),
    )
  }
  return `${entry.nameLength}:${codeUnits.join("")}`
}

/**
 * Extract every CFB stream in deterministic directory-tree order.
 *
 * `maxTotalBytes` is a cumulative output budget across all returned stream
 * payloads. Malformed containers fail as a whole; this function never returns a
 * partial stream listing.
 */
export function readCompoundFileStreams(
  bytes: Uint8Array,
  maxTotalBytes: number,
): readonly CompoundFileStream[] {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("Compound file bytes must be a Uint8Array")
  }
  if (
    !Number.isSafeInteger(maxTotalBytes) ||
    maxTotalBytes < 0 ||
    maxTotalBytes > MAX_CFB_INPUT_BYTES
  ) {
    throw new RangeError(
      `Compound file maxTotalBytes must be an integer from 0 through ${MAX_CFB_INPUT_BYTES}: ${maxTotalBytes}`,
    )
  }
  if (bytes.byteLength > MAX_CFB_INPUT_BYTES) {
    throw new CompoundFileFormatError(
      `Compound file is ${bytes.byteLength} bytes, above the ${MAX_CFB_INPUT_BYTES}-byte input ceiling`,
    )
  }
  if (!hasCompoundFileSignature(bytes)) {
    throw new CompoundFileFormatError(
      "Compound file signature is not D0 CF 11 E0 A1 B1 1A E1",
    )
  }
  if (bytes.byteLength < HEADER_SIZE) {
    throw new CompoundFileFormatError(
      `Compound file is ${bytes.byteLength} bytes, shorter than its ${HEADER_SIZE}-byte header`,
    )
  }

  const sourceView = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  )
  if (!isZeroRange(bytes, 0x08, 0x18)) {
    throw new CompoundFileFormatError(
      "Compound file header CLSID is not all zeroes",
    )
  }
  const minorVersion = readUint16(sourceView, 0x18)
  if (minorVersion !== 0x003e) {
    throw new CompoundFileFormatError(
      `Compound file minor version 0x${minorVersion.toString(16)} is not 0x3e`,
    )
  }
  const majorVersion = readUint16(sourceView, 0x1a)
  if (majorVersion !== 3 && majorVersion !== 4) {
    throw new CompoundFileFormatError(
      `Compound file major version ${majorVersion} is not 3 or 4`,
    )
  }
  if (readUint16(sourceView, 0x1c) !== 0xfffe) {
    throw new CompoundFileFormatError(
      "Compound file byte order is not little-endian",
    )
  }

  const sectorShift = readUint16(sourceView, 0x1e)
  if (
    (majorVersion === 3 && sectorShift !== 9) ||
    (majorVersion === 4 && sectorShift !== 12)
  ) {
    throw new CompoundFileFormatError(
      `Compound file sector shift 2^${sectorShift} does not match major version ${majorVersion}`,
    )
  }

  const miniSectorShift = readUint16(sourceView, 0x20)
  if (miniSectorShift !== 6) {
    throw new CompoundFileFormatError(
      `Compound file mini sector shift 2^${miniSectorShift} is not 2^6`,
    )
  }
  if (!isZeroRange(bytes, 0x22, 0x28)) {
    throw new CompoundFileFormatError(
      "Compound file header reserved bytes are not all zeroes",
    )
  }

  const sectorSize = 2 ** sectorShift
  const miniSectorSize = 2 ** miniSectorShift
  if (bytes.byteLength % sectorSize !== 0) {
    throw new CompoundFileFormatError(
      `Compound file length ${bytes.byteLength} is not a whole number of ${sectorSize}-byte sectors`,
    )
  }
  if (majorVersion === 4 && !isZeroRange(bytes, HEADER_SIZE, sectorSize)) {
    throw new CompoundFileFormatError(
      "Compound file version-4 header padding is not all zeroes",
    )
  }

  const miniStreamCutoff = readUint32(sourceView, 0x38)
  if (miniStreamCutoff !== REQUIRED_MINI_STREAM_CUTOFF) {
    throw new CompoundFileFormatError(
      `Compound file mini stream cutoff ${miniStreamCutoff} is not 4096`,
    )
  }

  const declaredDirectorySectorCount = readUint32(sourceView, 0x28)
  const declaredFatSectorCount = readUint32(sourceView, 0x2c)
  const firstDirectorySector = readUint32(sourceView, 0x30)
  const firstMiniFatSector = readUint32(sourceView, 0x3c)
  const declaredMiniFatSectorCount = readUint32(sourceView, 0x40)
  const firstDifatSector = readUint32(sourceView, 0x44)
  const declaredDifatSectorCount = readUint32(sourceView, 0x48)
  const sectorCount = bytes.byteLength / sectorSize - 1
  if (sectorCount < 1) {
    throw new CompoundFileFormatError(
      `Compound file contains no complete ${sectorSize}-byte sector after its header`,
    )
  }
  if (majorVersion === 3 && declaredDirectorySectorCount !== 0) {
    throw new CompoundFileFormatError(
      "Compound file version 3 declares nonzero directory-sector count",
    )
  }
  if (declaredFatSectorCount === 0 || declaredFatSectorCount > sectorCount) {
    throw new CompoundFileFormatError(
      `Compound file declares invalid FAT-sector count ${declaredFatSectorCount}`,
    )
  }
  if (declaredMiniFatSectorCount > sectorCount) {
    throw new CompoundFileFormatError(
      `Compound file declares invalid mini-FAT-sector count ${declaredMiniFatSectorCount}`,
    )
  }
  if (declaredDifatSectorCount > sectorCount) {
    throw new CompoundFileFormatError(
      `Compound file declares invalid DIFAT-sector count ${declaredDifatSectorCount}`,
    )
  }
  if (
    (declaredMiniFatSectorCount === 0) !==
    (firstMiniFatSector === ENDOFCHAIN)
  ) {
    throw new CompoundFileFormatError(
      "Compound file mini-FAT start and count disagree",
    )
  }
  if ((declaredDifatSectorCount === 0) !== (firstDifatSector === ENDOFCHAIN)) {
    throw new CompoundFileFormatError(
      "Compound file DIFAT start and count disagree",
    )
  }

  const checkedInputAllocation = (
    length: number,
    label: string,
  ): Uint8Array => {
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > bytes.byteLength
    ) {
      throw new CompoundFileFormatError(
        `${label} requires a non-proportional ${length}-byte allocation for a ${bytes.byteLength}-byte input`,
      )
    }
    return new Uint8Array(length)
  }

  const sectorOffset = (sector: number): number => (sector + 1) * sectorSize
  const sectorBytes = (sector: number): Uint8Array => {
    if (!Number.isSafeInteger(sector) || sector < 0 || sector >= sectorCount) {
      throw new CompoundFileFormatError(
        `Sector ${sector} is outside the file's ${sectorCount} physical sectors`,
      )
    }
    const offset = sectorOffset(sector)
    return bytes.subarray(offset, offset + sectorSize)
  }

  const fatSectorIds: number[] = []
  const fatSectorIdSet = new Set<number>()
  const difatSectorIdSet = new Set<number>()
  let reachedUnusedDifatSlot = false

  const acceptFatSector = (sector: number, provenance: string): void => {
    if (sector === FREESECT) {
      reachedUnusedDifatSlot = true
      return
    }
    if (reachedUnusedDifatSlot) {
      throw new CompoundFileFormatError(
        `${provenance} names FAT sector ${sector} after an unused DIFAT slot`,
      )
    }
    if (sector >= sectorCount) {
      throw new CompoundFileFormatError(
        `${provenance} names FAT sector ${sector}, outside the file's ${sectorCount} physical sectors`,
      )
    }
    if (fatSectorIdSet.has(sector)) {
      throw new CompoundFileFormatError(
        `${provenance} repeats FAT sector ${sector}`,
      )
    }
    if (difatSectorIdSet.has(sector)) {
      throw new CompoundFileFormatError(
        `${provenance} assigns sector ${sector} both FAT and DIFAT roles`,
      )
    }
    fatSectorIdSet.add(sector)
    fatSectorIds.push(sector)
  }

  for (let index = 0; index < HEADER_DIFAT_ENTRIES; index += 1) {
    acceptFatSector(readUint32(sourceView, 0x4c + index * 4), "Header DIFAT")
  }

  let difatSector = firstDifatSector
  while (difatSector !== ENDOFCHAIN) {
    if (difatSector >= sectorCount) {
      throw new CompoundFileFormatError(
        `DIFAT chain names sector ${difatSector}, outside the file's ${sectorCount} physical sectors`,
      )
    }
    if (difatSectorIdSet.has(difatSector)) {
      throw new CompoundFileFormatError(
        `DIFAT chain repeats sector ${difatSector}`,
      )
    }
    if (fatSectorIdSet.has(difatSector)) {
      throw new CompoundFileFormatError(
        `Sector ${difatSector} is assigned both FAT and DIFAT roles`,
      )
    }
    difatSectorIdSet.add(difatSector)
    if (difatSectorIdSet.size > sectorCount) {
      throw new CompoundFileFormatError(
        "DIFAT chain contains more sectors than the file",
      )
    }

    const difatBytes = sectorBytes(difatSector)
    const difatView = new DataView(
      difatBytes.buffer,
      difatBytes.byteOffset,
      difatBytes.byteLength,
    )
    const entriesPerDifatSector = sectorSize / 4 - 1
    for (let index = 0; index < entriesPerDifatSector; index += 1) {
      acceptFatSector(
        readUint32(difatView, index * 4),
        `DIFAT sector ${difatSector}`,
      )
    }
    difatSector = readUint32(difatView, entriesPerDifatSector * 4)
  }

  if (fatSectorIds.length !== declaredFatSectorCount) {
    throw new CompoundFileFormatError(
      `Compound file declares ${declaredFatSectorCount} FAT sectors but DIFAT names ${fatSectorIds.length}`,
    )
  }
  if (difatSectorIdSet.size !== declaredDifatSectorCount) {
    throw new CompoundFileFormatError(
      `Compound file declares ${declaredDifatSectorCount} DIFAT sectors but chain contains ${difatSectorIdSet.size}`,
    )
  }

  const fatByteLength = fatSectorIds.length * sectorSize
  const fatBytes = checkedInputAllocation(fatByteLength, "FAT table")
  for (let index = 0; index < fatSectorIds.length; index += 1) {
    const sector = fatSectorIds[index]
    if (sector === undefined) continue
    fatBytes.set(sectorBytes(sector), index * sectorSize)
  }
  const fatView = new DataView(fatBytes.buffer)

  const fatEntry = (sector: number): number => {
    const offset = sector * 4
    if (offset < 0 || offset + 4 > fatBytes.byteLength) {
      throw new CompoundFileFormatError(
        `FAT entry for sector ${sector} lies beyond the DIFAT-named FAT table`,
      )
    }
    return readUint32(fatView, offset)
  }

  if (fatBytes.byteLength / 4 < sectorCount) {
    throw new CompoundFileFormatError(
      "DIFAT-named FAT table does not cover every physical sector",
    )
  }
  for (const sector of fatSectorIds) {
    if (fatEntry(sector) !== FATSECT) {
      throw new CompoundFileFormatError(
        `FAT sector ${sector} is not marked FATSECT in the FAT`,
      )
    }
  }
  for (const sector of difatSectorIdSet) {
    if (fatEntry(sector) !== DIFSECT) {
      throw new CompoundFileFormatError(
        `DIFAT sector ${sector} is not marked DIFSECT in the FAT`,
      )
    }
  }
  for (
    let sector = sectorCount;
    sector < fatBytes.byteLength / 4;
    sector += 1
  ) {
    if (fatEntry(sector) !== FREESECT) {
      throw new CompoundFileFormatError(
        `FAT entry ${sector} lies past physical end-of-file and is not FREESECT`,
      )
    }
  }

  const physicalSectorOwners = new Map<number, string>()
  const claimPhysicalSector = (sector: number, owner: string): void => {
    const existingOwner = physicalSectorOwners.get(sector)
    if (existingOwner !== undefined) {
      throw new CompoundFileFormatError(
        `${owner} overlaps ${existingOwner} at physical sector ${sector}`,
      )
    }
    physicalSectorOwners.set(sector, owner)
  }
  for (const sector of fatSectorIds) {
    claimPhysicalSector(sector, "FAT")
  }
  for (const sector of difatSectorIdSet) {
    claimPhysicalSector(sector, "DIFAT")
  }

  const readFatChainSectorIds = (
    start: number,
    label: string,
    maximumSectors = sectorCount,
  ): number[] => {
    const ids: number[] = []
    const visited = new Set<number>()
    let current = start

    while (current !== ENDOFCHAIN) {
      if (current >= sectorCount) {
        throw new CompoundFileFormatError(
          `${label} steps to sector ${current}, outside the file's ${sectorCount} physical sectors`,
        )
      }
      if (visited.has(current)) {
        throw new CompoundFileFormatError(
          `${label} cycles at sector ${current}`,
        )
      }
      if (ids.length >= maximumSectors) {
        throw new CompoundFileFormatError(
          `${label} exceeds its ${maximumSectors}-sector ceiling`,
        )
      }
      visited.add(current)
      claimPhysicalSector(current, label)
      ids.push(current)

      const next = fatEntry(current)
      if (next === FREESECT || next === FATSECT || next === DIFSECT) {
        throw new CompoundFileFormatError(
          `${label} reaches sector-role marker ${next} after sector ${current}`,
        )
      }
      current = next
    }
    return ids
  }

  const copySectorIds = (ids: readonly number[], label: string): Uint8Array => {
    const output = checkedInputAllocation(
      ids.length * sectorSize,
      `${label} bytes`,
    )
    for (let index = 0; index < ids.length; index += 1) {
      const sector = ids[index]
      if (sector === undefined) continue
      output.set(sectorBytes(sector), index * sectorSize)
    }
    return output
  }

  const copySectorPrefix = (
    ids: readonly number[],
    byteLength: number,
    label: string,
  ): Uint8Array => {
    if (byteLength === 0) return new Uint8Array(0)
    const chainCapacity = ids.length * sectorSize
    if (chainCapacity < byteLength) {
      throw new CompoundFileFormatError(
        `${label} declares ${byteLength} bytes but its chain holds ${chainCapacity}`,
      )
    }
    const output = checkedInputAllocation(byteLength, `${label} output`)
    let written = 0
    for (const sector of ids) {
      if (written >= byteLength) break
      const chunk = sectorBytes(sector)
      const count = Math.min(chunk.byteLength, byteLength - written)
      output.set(chunk.subarray(0, count), written)
      written += count
    }
    return output
  }

  const maximumDirectorySectors = Math.ceil(
    MAX_CFB_DIRECTORY_ENTRIES / (sectorSize / DIRECTORY_ENTRY_SIZE),
  )
  const directorySectorIds = readFatChainSectorIds(
    firstDirectorySector,
    "Directory FAT chain",
    maximumDirectorySectors,
  )
  if (
    majorVersion === 4 &&
    directorySectorIds.length !== declaredDirectorySectorCount
  ) {
    throw new CompoundFileFormatError(
      `Compound file declares ${declaredDirectorySectorCount} directory sectors but chain contains ${directorySectorIds.length}`,
    )
  }
  const directoryBytes = copySectorIds(
    directorySectorIds,
    "Directory FAT chain",
  )
  if (directoryBytes.byteLength === 0) {
    throw new CompoundFileFormatError("Compound file has an empty directory")
  }
  if (directoryBytes.byteLength % DIRECTORY_ENTRY_SIZE !== 0) {
    throw new CompoundFileFormatError(
      "Compound file directory is not a whole number of 128-byte entries",
    )
  }

  const directoryView = new DataView(directoryBytes.buffer)
  const directoryEntryCount = directoryBytes.byteLength / DIRECTORY_ENTRY_SIZE
  if (directoryEntryCount > MAX_CFB_DIRECTORY_ENTRIES) {
    throw new CompoundFileFormatError(
      `Compound file has ${directoryEntryCount} directory entries, above the ${MAX_CFB_DIRECTORY_ENTRIES}-entry ceiling`,
    )
  }
  const directoryEntries: DirectoryEntry[] = []

  const decodeDirectoryName = (base: number, byteLength: number): string => {
    let name = ""
    for (let offset = 0; offset < byteLength; offset += 2) {
      name += String.fromCharCode(readUint16(directoryView, base + offset))
    }
    return name
  }

  for (let id = 0; id < directoryEntryCount; id += 1) {
    const base = id * DIRECTORY_ENTRY_SIZE
    const nameLength = readUint16(directoryView, base + 0x40)
    const decodableNameLength =
      nameLength >= 2 && nameLength <= 64 && nameLength % 2 === 0
        ? nameLength - 2
        : 0
    directoryEntries.push({
      name: decodeDirectoryName(base, decodableNameLength),
      nameLength,
      objectType: directoryView.getUint8(base + 0x42),
      colorFlag: directoryView.getUint8(base + 0x43),
      leftSibling: readUint32(directoryView, base + 0x44),
      rightSibling: readUint32(directoryView, base + 0x48),
      child: readUint32(directoryView, base + 0x4c),
      startSector: readUint32(directoryView, base + 0x74),
      sizeLow: readUint32(directoryView, base + 0x78),
      sizeHigh: readUint32(directoryView, base + 0x7c),
      hasNullTerminator:
        nameLength >= 2 &&
        nameLength <= 64 &&
        nameLength % 2 === 0 &&
        readUint16(directoryView, base + nameLength - 2) === 0,
    })
  }

  const directoryEntrySize = (entry: DirectoryEntry, label: string): number => {
    if (majorVersion === 3) {
      if (entry.sizeLow > VERSION_3_MAX_STREAM_SIZE) {
        throw new CompoundFileFormatError(
          `${label} exceeds the version-3 0x80000000-byte stream-size limit`,
        )
      }
      return entry.sizeLow
    }

    const size = entry.sizeHigh * UINT32_RANGE + entry.sizeLow
    if (!Number.isSafeInteger(size)) {
      throw new CompoundFileFormatError(
        `${label} declares a version-4 stream size outside JavaScript's safe integer range`,
      )
    }
    return size
  }

  const root = directoryEntries[0]
  if (root?.objectType !== OBJECT_TYPE_ROOT) {
    throw new CompoundFileFormatError(
      "First directory entry is not the root storage",
    )
  }
  if (root.colorFlag !== 0 && root.colorFlag !== 1) {
    throw new CompoundFileFormatError(
      `Root directory entry has invalid red-black color ${root.colorFlag}`,
    )
  }
  if (
    root.name !== "Root Entry" ||
    !root.hasNullTerminator ||
    root.name.includes("\0")
  ) {
    throw new CompoundFileFormatError(
      "Root directory entry name is not the NUL-terminated string 'Root Entry'",
    )
  }
  if (root.leftSibling !== NOSTREAM || root.rightSibling !== NOSTREAM) {
    throw new CompoundFileFormatError(
      "Root directory entry carries a sibling pointer",
    )
  }

  const rootSize = directoryEntrySize(root, "Root mini stream")
  if (rootSize % miniSectorSize !== 0) {
    throw new CompoundFileFormatError(
      `Root mini stream size ${rootSize} is not a whole number of 64-byte mini sectors`,
    )
  }

  const miniFatSectorIds = readFatChainSectorIds(
    firstMiniFatSector,
    "Mini-FAT sector chain",
    declaredMiniFatSectorCount,
  )
  if (miniFatSectorIds.length !== declaredMiniFatSectorCount) {
    throw new CompoundFileFormatError(
      `Compound file declares ${declaredMiniFatSectorCount} mini-FAT sectors but chain contains ${miniFatSectorIds.length}`,
    )
  }
  const miniFatBytes = copySectorIds(miniFatSectorIds, "Mini-FAT sector chain")
  const miniFatView = new DataView(miniFatBytes.buffer)

  const expectedMiniStreamSectorCount = Math.ceil(rootSize / sectorSize)
  const miniStreamSectorIds = readFatChainSectorIds(
    root.startSector,
    "Root mini-stream FAT chain",
    expectedMiniStreamSectorCount,
  )
  if (miniStreamSectorIds.length !== expectedMiniStreamSectorCount) {
    throw new CompoundFileFormatError(
      `Root mini stream needs ${expectedMiniStreamSectorCount} sectors but chain contains ${miniStreamSectorIds.length}`,
    )
  }
  const miniStream = copySectorPrefix(
    miniStreamSectorIds,
    rootSize,
    "Root mini-stream FAT chain",
  )
  const miniSectorCount = miniStream.byteLength / miniSectorSize

  const miniFatEntry = (miniSector: number): number => {
    const offset = miniSector * 4
    if (offset < 0 || offset + 4 > miniFatBytes.byteLength) {
      throw new CompoundFileFormatError(
        `Mini-FAT entry ${miniSector} lies beyond the mini-FAT table`,
      )
    }
    return readUint32(miniFatView, offset)
  }
  if (miniSectorCount > miniFatBytes.byteLength / 4) {
    throw new CompoundFileFormatError(
      "Mini-FAT table does not cover every mini-stream sector",
    )
  }

  const miniSectorOwners = new Map<number, string>()
  const claimMiniSector = (miniSector: number, owner: string): void => {
    const existingOwner = miniSectorOwners.get(miniSector)
    if (existingOwner !== undefined) {
      throw new CompoundFileFormatError(
        `${owner} overlaps ${existingOwner} at mini sector ${miniSector}`,
      )
    }
    miniSectorOwners.set(miniSector, owner)
  }

  const readMiniFatChainSectorIds = (
    start: number,
    label: string,
    maximumSectors: number,
  ): number[] => {
    const ids: number[] = []
    const visited = new Set<number>()
    let current = start

    while (current !== ENDOFCHAIN) {
      if (current >= miniSectorCount) {
        throw new CompoundFileFormatError(
          `${label} steps to mini sector ${current}, outside the mini stream's ${miniSectorCount} sectors`,
        )
      }
      if (visited.has(current)) {
        throw new CompoundFileFormatError(
          `${label} cycles at mini sector ${current}`,
        )
      }
      if (ids.length >= maximumSectors) {
        throw new CompoundFileFormatError(
          `${label} exceeds its ${maximumSectors}-mini-sector ceiling`,
        )
      }
      visited.add(current)
      claimMiniSector(current, label)
      ids.push(current)

      const next = miniFatEntry(current)
      if (next === FREESECT || next === FATSECT || next === DIFSECT) {
        throw new CompoundFileFormatError(
          `${label} reaches sector-role marker ${next} after mini sector ${current}`,
        )
      }
      current = next
    }
    return ids
  }

  let totalExtractedBytes = 0
  const extractStream = (
    entry: DirectoryEntry,
    entryId: number,
    path: string,
  ): Uint8Array => {
    const size = directoryEntrySize(
      entry,
      `Directory stream ${entryId} ('${entry.name}')`,
    )
    if (size === 0) return new Uint8Array(0)

    const remainingBudget = maxTotalBytes - totalExtractedBytes
    if (size > remainingBudget) {
      throw new CompoundFileFormatError(
        `Cumulative stream size exceeds the ${maxTotalBytes}-byte budget at '${entry.name}'`,
      )
    }

    let output: Uint8Array
    if (size < miniStreamCutoff) {
      const expectedMiniSectorCount = Math.ceil(size / miniSectorSize)
      const ids = readMiniFatChainSectorIds(
        entry.startSector,
        `Mini-FAT chain for '${path}'`,
        expectedMiniSectorCount,
      )
      if (ids.length !== expectedMiniSectorCount) {
        throw new CompoundFileFormatError(
          `Stream '${path}' needs ${expectedMiniSectorCount} mini sectors but chain contains ${ids.length}`,
        )
      }
      output = checkedInputAllocation(size, `Stream '${path}' output`)
      let written = 0
      for (const miniSector of ids) {
        if (written >= size) break
        const start = miniSector * miniSectorSize
        const chunk = miniStream.subarray(start, start + miniSectorSize)
        const count = Math.min(chunk.byteLength, size - written)
        output.set(chunk.subarray(0, count), written)
        written += count
      }
    } else {
      const expectedSectorCount = Math.ceil(size / sectorSize)
      const ids = readFatChainSectorIds(
        entry.startSector,
        `FAT chain for '${path}'`,
        expectedSectorCount,
      )
      if (ids.length !== expectedSectorCount) {
        throw new CompoundFileFormatError(
          `Stream '${path}' needs ${expectedSectorCount} sectors but chain contains ${ids.length}`,
        )
      }
      output = copySectorPrefix(ids, size, `FAT chain for '${path}'`)
    }

    totalExtractedBytes += size
    return output
  }

  interface PathFrame {
    readonly id: number
    readonly prefix: PathPrefix | undefined
    readonly ownerStorageId: number
    readonly lowerBound: DirectoryEntry | undefined
    readonly upperBound: DirectoryEntry | undefined
    readonly parentWasRed: boolean
    readonly isSiblingTreeRoot: boolean
    readonly stage: "descend"
  }
  interface EntryFrame {
    readonly entry: DirectoryEntry
    readonly entryId: number
    readonly prefix: PathPrefix | undefined
    readonly ownerStorageId: number
    readonly lowerBound: DirectoryEntry | undefined
    readonly upperBound: DirectoryEntry | undefined
    readonly stage: "self"
  }
  type DirectoryFrame = PathFrame | EntryFrame

  const streams: CompoundFileStream[] = []
  const visitedDirectoryEntries = new Set<number>()
  const siblingNamesByStorage = new Map<number, Set<string>>()
  let totalPathCodeUnits = 0
  const stack: DirectoryFrame[] = [
    {
      id: root.child,
      prefix: undefined,
      ownerStorageId: 0,
      lowerBound: undefined,
      upperBound: undefined,
      parentWasRed: false,
      isSiblingTreeRoot: true,
      stage: "descend",
    },
  ]

  const validateDirectoryEntry = (
    entry: DirectoryEntry,
    entryId: number,
  ): void => {
    if (
      entry.nameLength < 2 ||
      entry.nameLength > 64 ||
      entry.nameLength % 2 !== 0
    ) {
      throw new CompoundFileFormatError(
        `Directory entry ${entryId} has invalid name length ${entry.nameLength}`,
      )
    }
    if (!entry.hasNullTerminator || entry.name.includes("\0")) {
      throw new CompoundFileFormatError(
        `Directory entry ${entryId} name is not exactly NUL-terminated`,
      )
    }
    if (entry.name.length === 0) {
      throw new CompoundFileFormatError(
        `Directory entry ${entryId} has an empty non-root name`,
      )
    }
    if (FORBIDDEN_DIRECTORY_NAME_CHARACTERS.test(entry.name)) {
      throw new CompoundFileFormatError(
        `Directory entry ${entryId} name contains a forbidden /, \\, :, or ! character`,
      )
    }
    for (let index = 0; index < entry.name.length; index += 1) {
      if (entry.name.charCodeAt(index) > 0x7f) {
        throw new CompoundFileFormatError(
          `Directory entry ${entryId} name contains non-ASCII characters, which this reader does not support`,
        )
      }
    }
    if (
      entry.objectType !== OBJECT_TYPE_STORAGE &&
      entry.objectType !== OBJECT_TYPE_STREAM
    ) {
      throw new CompoundFileFormatError(
        `Directory entry ${entryId} ('${entry.name}') is not a storage or stream`,
      )
    }
    if (entry.colorFlag !== 0 && entry.colorFlag !== 1) {
      throw new CompoundFileFormatError(
        `Directory entry ${entryId} has invalid red-black color ${entry.colorFlag}`,
      )
    }
    if (entry.objectType === OBJECT_TYPE_STREAM && entry.child !== NOSTREAM) {
      throw new CompoundFileFormatError(
        `Stream directory entry ${entryId} has a child pointer`,
      )
    }
    if (
      entry.objectType === OBJECT_TYPE_STORAGE &&
      (entry.sizeLow !== 0 || entry.sizeHigh !== 0)
    ) {
      throw new CompoundFileFormatError(
        `Storage directory entry ${entryId} has nonzero stream size`,
      )
    }
    if (entry.objectType === OBJECT_TYPE_STORAGE && entry.startSector !== 0) {
      throw new CompoundFileFormatError(
        `Storage directory entry ${entryId} has nonzero starting sector ${entry.startSector}`,
      )
    }
  }

  const extendPrefix = (
    prefix: PathPrefix | undefined,
    segment: string,
  ): PathPrefix => {
    const depth = (prefix?.depth ?? 0) + 1
    if (depth > MAX_CFB_STORAGE_DEPTH) {
      throw new CompoundFileFormatError(
        `Storage hierarchy exceeds the ${MAX_CFB_STORAGE_DEPTH}-level depth ceiling at '${segment}'`,
      )
    }
    const codeUnitsWithSeparators =
      (prefix?.codeUnitsWithSeparators ?? 0) + segment.length + 1
    if (codeUnitsWithSeparators > MAX_CFB_PATH_CODE_UNITS) {
      throw new CompoundFileFormatError(
        `Storage path exceeds the ${MAX_CFB_PATH_CODE_UNITS}-code-unit path ceiling at '${segment}'`,
      )
    }
    return { parent: prefix, segment, depth, codeUnitsWithSeparators }
  }

  const buildStreamPath = (
    prefix: PathPrefix | undefined,
    name: string,
  ): string => {
    const pathCodeUnits = (prefix?.codeUnitsWithSeparators ?? 0) + name.length
    if (pathCodeUnits > MAX_CFB_PATH_CODE_UNITS) {
      throw new CompoundFileFormatError(
        `Stream path ending in '${name}' exceeds the ${MAX_CFB_PATH_CODE_UNITS}-code-unit ceiling`,
      )
    }
    totalPathCodeUnits += pathCodeUnits
    if (totalPathCodeUnits > MAX_CFB_TOTAL_PATH_CODE_UNITS) {
      throw new CompoundFileFormatError(
        `Cumulative stream paths exceed the ${MAX_CFB_TOTAL_PATH_CODE_UNITS}-code-unit ceiling`,
      )
    }

    const segments = [name]
    for (
      let current = prefix;
      current !== undefined;
      current = current.parent
    ) {
      segments.push(current.segment)
    }
    segments.reverse()
    return segments.join("/")
  }

  for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
    if (frame.stage === "descend") {
      if (frame.id === NOSTREAM) continue
      const entry = directoryEntries[frame.id]
      if (frame.id >= directoryEntryCount || entry === undefined) {
        throw new CompoundFileFormatError(
          `Directory tree links to entry ${frame.id}, outside its ${directoryEntryCount} entries`,
        )
      }
      if (visitedDirectoryEntries.has(frame.id)) {
        throw new CompoundFileFormatError(
          `Directory tree reaches entry ${frame.id} twice and therefore cycles`,
        )
      }
      visitedDirectoryEntries.add(frame.id)
      validateDirectoryEntry(entry, frame.id)
      if (
        frame.lowerBound !== undefined &&
        compareDirectoryNames(entry, frame.lowerBound) <= 0
      ) {
        throw new CompoundFileFormatError(
          `Directory sibling tree is not strictly sorted at '${entry.name}'`,
        )
      }
      if (
        frame.upperBound !== undefined &&
        compareDirectoryNames(entry, frame.upperBound) >= 0
      ) {
        throw new CompoundFileFormatError(
          `Directory sibling tree is not strictly sorted at '${entry.name}'`,
        )
      }
      const siblingNames =
        siblingNamesByStorage.get(frame.ownerStorageId) ?? new Set<string>()
      siblingNamesByStorage.set(frame.ownerStorageId, siblingNames)
      const nameKey = directoryNameSortKey(entry)
      if (siblingNames.has(nameKey)) {
        throw new CompoundFileFormatError(
          `Storage entry ${frame.ownerStorageId} has duplicate case-insensitive child name '${entry.name}'`,
        )
      }
      siblingNames.add(nameKey)
      if (frame.isSiblingTreeRoot && entry.colorFlag !== 1) {
        throw new CompoundFileFormatError(
          `Sibling tree root '${entry.name}' is not black`,
        )
      }
      if (frame.parentWasRed && entry.colorFlag === 0) {
        throw new CompoundFileFormatError(
          `Sibling tree has consecutive red entries at '${entry.name}'`,
        )
      }

      stack.push({
        entry,
        entryId: frame.id,
        prefix: frame.prefix,
        ownerStorageId: frame.ownerStorageId,
        lowerBound: frame.lowerBound,
        upperBound: frame.upperBound,
        stage: "self",
      })
      stack.push({
        id: entry.leftSibling,
        prefix: frame.prefix,
        ownerStorageId: frame.ownerStorageId,
        lowerBound: frame.lowerBound,
        upperBound: entry,
        parentWasRed: entry.colorFlag === 0,
        isSiblingTreeRoot: false,
        stage: "descend",
      })
      continue
    }

    if (frame.entry.objectType === OBJECT_TYPE_STREAM) {
      if (streams.length >= MAX_CFB_STREAM_COUNT) {
        throw new CompoundFileFormatError(
          `Compound file exceeds the ${MAX_CFB_STREAM_COUNT}-stream ceiling`,
        )
      }
      const path = buildStreamPath(frame.prefix, frame.entry.name)
      streams.push(
        Object.freeze({
          path,
          bytes: extractStream(frame.entry, frame.entryId, path),
        }),
      )
      stack.push({
        id: frame.entry.rightSibling,
        prefix: frame.prefix,
        ownerStorageId: frame.ownerStorageId,
        lowerBound: frame.entry,
        upperBound: frame.upperBound,
        parentWasRed: frame.entry.colorFlag === 0,
        isSiblingTreeRoot: false,
        stage: "descend",
      })
      continue
    }

    if (frame.entry.objectType === OBJECT_TYPE_STORAGE) {
      const childPrefix = extendPrefix(frame.prefix, frame.entry.name)
      stack.push({
        id: frame.entry.rightSibling,
        prefix: frame.prefix,
        ownerStorageId: frame.ownerStorageId,
        lowerBound: frame.entry,
        upperBound: frame.upperBound,
        parentWasRed: frame.entry.colorFlag === 0,
        isSiblingTreeRoot: false,
        stage: "descend",
      })
      stack.push({
        id: frame.entry.child,
        prefix: childPrefix,
        ownerStorageId: frame.entryId,
        lowerBound: undefined,
        upperBound: undefined,
        parentWasRed: false,
        isSiblingTreeRoot: true,
        stage: "descend",
      })
      continue
    }

    throw new CompoundFileFormatError("Directory tree reaches a second root")
  }

  for (let entryId = 1; entryId < directoryEntryCount; entryId += 1) {
    const entry = directoryEntries[entryId]
    if (
      entry !== undefined &&
      entry.objectType !== 0 &&
      !visitedDirectoryEntries.has(entryId)
    ) {
      throw new CompoundFileFormatError(
        `Directory entry ${entryId} has nonzero object type ${entry.objectType} but is not reachable from the root storage`,
      )
    }
  }

  for (let miniSector = 0; miniSector < miniSectorCount; miniSector += 1) {
    const allocation = miniFatEntry(miniSector)
    if (!miniSectorOwners.has(miniSector) && allocation !== FREESECT) {
      throw new CompoundFileFormatError(
        `Unowned mini sector ${miniSector} is not marked FREESECT`,
      )
    }
  }
  for (
    let miniSector = miniSectorCount;
    miniSector < miniFatBytes.byteLength / 4;
    miniSector += 1
  ) {
    if (miniFatEntry(miniSector) !== FREESECT) {
      throw new CompoundFileFormatError(
        `Mini-FAT entry ${miniSector} lies past the mini stream and is not FREESECT`,
      )
    }
  }
  for (let sector = 0; sector < sectorCount; sector += 1) {
    if (!physicalSectorOwners.has(sector) && fatEntry(sector) !== FREESECT) {
      throw new CompoundFileFormatError(
        `Unowned physical sector ${sector} is not marked FREESECT`,
      )
    }
  }

  return Object.freeze(streams)
}
