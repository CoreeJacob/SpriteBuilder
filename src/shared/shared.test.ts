import { describe, expect, it } from 'vitest'
import { countFrames } from './imageInfo'
import { followMoves, isInside, isValidName, projectPathFor, uniqueName } from './paths'

describe('paths', () => {
  it('builds unique names', () => {
    const taken = new Set(['hero.png', 'hero 2.png'])
    expect(uniqueName('hero.png', (n) => taken.has(n))).toBe('hero 3.png')
    expect(uniqueName('new.png', (n) => taken.has(n))).toBe('new.png')
  })
  it('validates names', () => {
    expect(isValidName('Tiles')).toBe(true)
    expect(isValidName('../x')).toBe(false)
    expect(isValidName('.hidden')).toBe(false)
    expect(isValidName('  ')).toBe(false)
  })
  it('knows folder containment', () => {
    expect(isInside('Tiles/Water', 'Tiles')).toBe(true)
    expect(isInside('TilesExtra', 'Tiles')).toBe(false)
    expect(projectPathFor('a/b.png')).toBe('a/b.sprite.json')
  })
})

describe('countFrames', () => {
  // Smallest valid 1×1 GIFs: one image, then the same with a second image block.
  const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255]
  const image = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x44, 0x01, 0x00]
  const gce = [0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00]

  it('counts GIF frames', () => {
    expect(countFrames(new Uint8Array([...header, ...image, 0x3b]), 'gif')).toBe(1)
    expect(countFrames(new Uint8Array([...header, ...gce, ...image, ...gce, ...image, 0x3b]), 'gif')).toBe(2)
  })
  it('treats unknown data as one frame', () => {
    expect(countFrames(new Uint8Array([1, 2, 3]), 'gif')).toBe(1)
    expect(countFrames(new Uint8Array([1, 2, 3]), 'jpg')).toBe(1)
  })
})

describe('followMoves', () => {
  it('follows file moves and folder moves, in order', () => {
    const moves = [
      { from: 'hero.png', to: 'Heroes/hero.png' },
      { from: 'Heroes', to: 'Characters/Heroes' }
    ]
    expect(followMoves('hero.png', moves)).toBe('Characters/Heroes/hero.png')
    expect(followMoves('Heroes/x/y.png', moves)).toBe('Characters/Heroes/x/y.png')
    expect(followMoves('HeroesExtra/z.png', moves)).toBe('HeroesExtra/z.png')
    expect(followMoves('other.png', moves)).toBe('other.png')
  })
})
