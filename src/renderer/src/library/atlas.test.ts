import { describe, expect, it } from 'vitest'
import { atlasJson, buildAtlas, DEFAULT_ATLAS_OPTIONS, pack, type AtlasSprite } from './atlas'

const options = { ...DEFAULT_ATLAS_OPTIONS, padding: 0, trim: false }

/** A w×h sprite filled with one colour (red channel = `shade`), optionally with clear borders. */
function sprite(name: string, w: number, h: number, shade = 200, border = 0): AtlasSprite {
  const pixels = new Uint8ClampedArray(w * h * 4)
  for (let y = border; y < h - border; y++) for (let x = border; x < w - border; x++) pixels.set([shade, 0, 0, 255], (y * w + x) * 4)
  return { name, w, h, pixels }
}

/** Seeded random sizes, so a failure can be replayed. */
function randomSizes(count: number, seed = 3) {
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  return Array.from({ length: count }, () => ({ w: 1 + Math.floor(rnd() * 40), h: 1 + Math.floor(rnd() * 40) }))
}

describe('pack', () => {
  it('places every rectangle inside the atlas without overlaps, keeping the gaps', () => {
    const sizes = randomSizes(60)
    for (const padding of [0, 2]) {
      const p = pack(sizes, { maxSize: 512, padding, powerOfTwo: false })!
      expect(p).not.toBeNull()
      const boxes = p.positions.map(([x, y], i) => ({ x, y, w: sizes[i].w, h: sizes[i].h }))
      for (const b of boxes) {
        expect(b.x >= 0 && b.y >= 0 && b.x + b.w <= p.width && b.y + b.h <= p.height).toBe(true)
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const [a, b] = [boxes[i], boxes[j]]
          // With padding, boxes grown by the gap still mustn't touch.
          const apart = a.x + a.w + padding <= b.x || b.x + b.w + padding <= a.x || a.y + a.h + padding <= b.y || b.y + b.h + padding <= a.y
          expect(apart, `boxes ${i} and ${j}`).toBe(true)
        }
      }
    }
  })

  it('packs tightly: identical squares fill a square with no waste', () => {
    const p = pack(Array(16).fill({ w: 16, h: 16 }), { maxSize: 1024, padding: 0, powerOfTwo: false })!
    expect([p.width, p.height]).toEqual([64, 64])
  })

  it('a random mix uses most of the space', () => {
    const sizes = randomSizes(80)
    const p = pack(sizes, { maxSize: 1024, padding: 0, powerOfTwo: false })!
    const used = sizes.reduce((a, s) => a + s.w * s.h, 0)
    expect(used / (p.width * p.height)).toBeGreaterThan(0.75)
  })

  it('rounds up to power-of-two sides when asked', () => {
    const p = pack([{ w: 20, h: 10 }, { w: 30, h: 30 }], { maxSize: 256, padding: 0, powerOfTwo: true })!
    expect([p.width, p.height].every((n) => (n & (n - 1)) === 0)).toBe(true)
  })

  it('says no when the sprites can’t fit in the size limit', () => {
    expect(pack([{ w: 300, h: 10 }], { maxSize: 256, padding: 0, powerOfTwo: false })).toBeNull()
    expect(pack(Array(5).fill({ w: 128, h: 128 }), { maxSize: 256, padding: 0, powerOfTwo: false })).toBeNull()
    expect(pack([], { maxSize: 256, padding: 0, powerOfTwo: false })).toBeNull()
  })

  it('packs a big folder quickly, into a roughly square atlas', () => {
    const sizes = randomSizes(800, 11)
    const start = performance.now()
    const p = pack(sizes, { maxSize: 4096, padding: 2, powerOfTwo: false })!
    // About 0.1 s normally; it took 8 s before. The limit allows for a busy machine.
    expect(performance.now() - start).toBeLessThan(1500)
    expect(Math.max(p.width, p.height) / Math.min(p.width, p.height)).toBeLessThan(1.25) // not a long thin strip
    expect(sizes.reduce((a, s) => a + s.w * s.h, 0) / (p.width * p.height)).toBeGreaterThan(0.7)
  })

  it('gives the same result every time', () => {
    const sizes = randomSizes(30)
    expect(pack(sizes, { maxSize: 512, padding: 1, powerOfTwo: false })).toEqual(pack(sizes, { maxSize: 512, padding: 1, powerOfTwo: false }))
  })
})

describe('buildAtlas', () => {
  it('draws each sprite where the JSON says, trimmed of clear edges, with the original size recorded', () => {
    const sprites = [sprite('ship.png', 10, 8, 100, 2), sprite('laser.png', 4, 4, 50)]
    const atlas = buildAtlas(sprites, { ...options, trim: true })!
    const ship = atlas.frames.find((f) => f.name === 'ship.png')!
    expect(ship.frame).toMatchObject({ w: 6, h: 4 })
    expect(ship.source).toEqual({ x: 2, y: 2, w: 6, h: 4 })
    expect(ship.sourceSize).toEqual({ w: 10, h: 8 })
    // The atlas pixel at the trimmed frame's corner is the ship's colour.
    const at = (x: number, y: number) => atlas.pixels[(y * atlas.width + x) * 4]
    expect(at(ship.frame.x, ship.frame.y)).toBe(100)
    const laser = atlas.frames.find((f) => f.name === 'laser.png')!
    expect(at(laser.frame.x + 3, laser.frame.y + 3)).toBe(50)
  })

  it('keeps a spot for a sprite with nothing visible in it', () => {
    const atlas = buildAtlas([sprite('blank.png', 8, 8, 0, 4)], { ...options, trim: true })!
    expect(atlas.frames[0].frame).toMatchObject({ w: 1, h: 1 })
  })
})

describe('atlasJson', () => {
  it('writes frames in the sprite sheet format, with durations and animation tags', () => {
    const frames = [sprite('walk_0.png', 4, 4), sprite('walk_1.png', 4, 4), sprite('tree.png', 8, 8, 9, 1)].map((s, i) => (i < 2 ? { ...s, duration: 120 } : s))
    const atlas = buildAtlas(frames, { ...options, trim: true })!
    const json = JSON.parse(atlasJson(atlas, 'forest-atlas.png', [{ name: 'walk', from: 'walk_0.png', to: 'walk_1.png' }]))
    expect(Object.keys(json.frames)).toEqual(['walk_0.png', 'walk_1.png', 'tree.png'])
    expect(json.frames['walk_0.png']).toMatchObject({ rotated: false, trimmed: false, duration: 120, sourceSize: { w: 4, h: 4 } })
    expect(json.frames['tree.png']).toMatchObject({ trimmed: true, spriteSourceSize: { x: 1, y: 1, w: 6, h: 6 } })
    expect(json.frames['tree.png'].duration).toBeUndefined()
    expect(json.meta).toMatchObject({ app: 'SpriteBuilder', image: 'forest-atlas.png', size: { w: atlas.width, h: atlas.height } })
    expect(json.meta.frameTags).toEqual([{ name: 'walk', from: 0, to: 1, direction: 'forward' }])
  })
})
