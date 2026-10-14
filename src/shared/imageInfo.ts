// Reads the frame count from image file bytes without decoding the pixels.

export function countFrames(bytes: Uint8Array, ext: string): number {
  try {
    switch (ext) {
      case 'gif':
        return countGifFrames(bytes)
      case 'png':
        return countPngFrames(bytes)
      case 'webp':
        return countWebpFrames(bytes)
      default:
        return 1
    }
  } catch {
    return 1
  }
}

function countGifFrames(b: Uint8Array): number {
  if (b.length < 13 || String.fromCharCode(b[0], b[1], b[2]) !== 'GIF') return 1
  let pos = 13
  const packed = b[10]
  if (packed & 0x80) pos += 3 * (1 << ((packed & 0x07) + 1))

  const skipSubBlocks = (): void => {
    while (pos < b.length) {
      const len = b[pos++]
      if (len === 0) return
      pos += len
    }
  }

  let frames = 0
  while (pos < b.length) {
    const marker = b[pos++]
    if (marker === 0x21) {
      pos++ // extension label
      skipSubBlocks()
    } else if (marker === 0x2c) {
      frames++
      const localPacked = b[pos + 8]
      pos += 9
      if (localPacked & 0x80) pos += 3 * (1 << ((localPacked & 0x07) + 1))
      pos++ // LZW minimum code size
      skipSubBlocks()
    } else {
      break // 0x3b trailer, or corrupt data
    }
  }
  return Math.max(frames, 1)
}

function countPngFrames(b: Uint8Array): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let pos = 8
  while (pos + 8 <= b.length) {
    const length = view.getUint32(pos)
    const type = String.fromCharCode(b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7])
    if (type === 'acTL') return Math.max(view.getUint32(pos + 8), 1)
    if (type === 'IDAT') return 1
    pos += 12 + length
  }
  return 1
}

function countWebpFrames(b: Uint8Array): number {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (String.fromCharCode(b[8], b[9], b[10], b[11]) !== 'WEBP') return 1
  let pos = 12
  let frames = 0
  while (pos + 8 <= b.length) {
    const type = String.fromCharCode(b[pos], b[pos + 1], b[pos + 2], b[pos + 3])
    const size = view.getUint32(pos + 4, true)
    if (type === 'ANMF') frames++
    pos += 8 + size + (size & 1)
  }
  return Math.max(frames, 1)
}
