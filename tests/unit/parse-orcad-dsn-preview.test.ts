import { expect, test } from "bun:test"
import { parseOrcadDsnPreview } from "../../lib"

test("rejects textual SPECCTRA data at the Preview boundary", () => {
  const bytes = new TextEncoder().encode(
    '(pcb example (parser "Specctra") (resolution mil 10))',
  )

  expect(() =>
    parseOrcadDsnPreview({ bytes, fileName: "ambiguous.dsn" }),
  ).toThrow("textual SPECCTRA .dsn is not supported")
})

test("requires a Uint8Array", () => {
  expect(() =>
    parseOrcadDsnPreview({
      // @ts-expect-error Runtime validation protects JavaScript callers.
      bytes: [0xd0, 0xcf, 0x11, 0xe0],
      fileName: "invalid.dsn",
    }),
  ).toThrow("bytes must be a Uint8Array")
})
