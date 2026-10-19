// Builds the small library every test starts from. The images are drawn here in code,
// so the tests don't depend on binary files and each image's pixels are easy to reason about.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { applyPalette, GIFEncoder } from 'gifenc'

type RGBA = [number, number, number, number]
const CLEAR: RGBA = [0, 0, 0, 0]
const WHITE: RGBA = [255, 255, 255, 255]
const RED: RGBA = [255, 0, 0, 255]
const NAVY: RGBA = [0x1d, 0x2b, 0x53, 255]
const ORANGE: RGBA = [0xff, 0xa3, 0x00, 255]

function draw(width: number, height: number, colorAt: (x: number, y: number) => RGBA): Uint8Array {
  const out = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out.set(colorAt(x, y), (y * width + x) * 4)
  return out
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

/** A plain 8-bit RGBA PNG. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 6, 0, 0, 0], 8) // 8 bits per channel, RGBA, no interlace
  const rows = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', new Uint8Array())
  ])
}

const png = (width: number, height: number, colorAt: (x: number, y: number) => RGBA): Buffer => encodePng(width, height, draw(width, height, colorAt))

/** 16×16 green tile with diagonal stripes. */
export const grass = (): Buffer => png(16, 16, (x, y) => ((x + y) % 4 < 2 ? [0x63, 0xc7, 0x4d, 255] : [0x3e, 0x89, 0x48, 255]))

/** 8×8 figure: navy sides and orange body on rows 1–6, clear top and bottom rows. */
const knight = (): Buffer => png(8, 8, (x, y) => (y === 0 || y === 7 ? CLEAR : x === 0 || x === 7 ? NAVY : ORANGE))

const bat = (): Buffer => png(8, 8, (x, y) => (Math.abs(x - 3.5) + Math.abs(y - 3.5) < 4 ? [0x5d, 0x27, 0x5d, 255] : CLEAR))

/** 32×8 sheet of four 8×8 cells on white: red squares (2–5, 2–5) in the first three, the last one blank. */
const walkSheet = (): Buffer =>
  png(32, 8, (x, y) => {
    const cell = Math.floor(x / 8)
    const cx = x % 8
    return cell < 3 && cx >= 2 && cx <= 5 && y >= 2 && y <= 5 ? RED : WHITE
  })

/** A 600×400 opaque gradient, bigger than any sprite. */
const bigPhoto = (): Buffer => png(600, 400, (x, y) => [Math.round((x / 599) * 255), Math.round((y / 399) * 255), 128, 255])

/** 32×32 GIF with 3 frames of 100, 100 and 300 ms; frame 1 has a red top-left quarter. */
function gifCheck(): Uint8Array {
  const palette = [
    [255, 255, 255],
    [255, 0, 0],
    [0, 0, 255],
    [0, 255, 0]
  ]
  const gif = GIFEncoder()
  const frames: Array<[RGBA, number]> = [
    [RED, 100],
    [[0, 0, 255, 255], 100],
    [[0, 255, 0, 255], 300]
  ]
  frames.forEach(([color, delay], i) => {
    const rgba = draw(32, 32, (x, y) => {
      const inQuarter = i === 0 ? x < 16 && y < 16 : i === 1 ? x >= 16 && y < 16 : y >= 16
      return inQuarter ? color : WHITE
    })
    gif.writeFrame(applyPalette(rgba, palette), 32, 32, { palette, delay, repeat: 0 })
  })
  gif.finish()
  return gif.bytes()
}

/** The library folder each test starts with. */
export async function seedLibrary(root: string): Promise<void> {
  const files: Record<string, Uint8Array> = {
    'walk-sheet.png': walkSheet(),
    'big-photo.png': bigPhoto(),
    'gif-check.gif': gifCheck(),
    'Tiles/grass.png': grass(),
    'Heroes/knight.png': knight(),
    'Test Folder/Enemies/bat.png': bat()
  }
  for (const [rel, data] of Object.entries(files)) {
    const file = path.join(root, rel)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, data)
  }
}
