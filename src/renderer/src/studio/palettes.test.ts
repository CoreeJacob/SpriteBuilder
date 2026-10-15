import { describe, expect, it } from 'vitest'
import { lospecSlug, parsePaletteFile } from './palettes'

describe('palette files', () => {
  it('reads Lospec .hex files', () => {
    expect(parsePaletteFile('sweetie-16.hex', '1a1c2c\n5d275d\n\nB13E53\n')).toEqual({
      name: 'sweetie-16',
      colors: ['#1a1c2c', '#5d275d', '#b13e53']
    })
  })

  it('reads GIMP .gpl files, including the palette name', () => {
    const gpl = 'GIMP Palette\nName: Forest\nColumns: 4\n#\n 26  28  44\tdark\n255 255 255 white\n'
    expect(parsePaletteFile('x.gpl', gpl)).toEqual({ name: 'Forest', colors: ['#1a1c2c', '#ffffff'] })
  })

  it('reads JASC .pal files', () => {
    expect(parsePaletteFile('a.pal', 'JASC-PAL\n0100\n2\n0 0 0\n255 0 128\n').colors).toEqual(['#000000', '#ff0080'])
  })

  it('reads Paint.NET .txt files (alpha first)', () => {
    expect(parsePaletteFile('p.txt', ';paint.net Palette File\n;Colors: 2\nFF1A1C2C\nFFFFFFFF\n').colors).toEqual(['#1a1c2c', '#ffffff'])
  })

  it('removes duplicates and rejects files with no colours', () => {
    expect(parsePaletteFile('d.hex', '000000\n000000\n').colors).toEqual(['#000000'])
    expect(() => parsePaletteFile('empty.hex', 'nothing here')).toThrow(/No colours/)
  })
})

describe('lospecSlug', () => {
  it('accepts URLs, display names and slugs', () => {
    expect(lospecSlug('https://lospec.com/palette-list/sweetie-16')).toBe('sweetie-16')
    expect(lospecSlug('https://lospec.com/palette-list/sweetie-16.json')).toBe('sweetie-16')
    expect(lospecSlug('Sweetie 16')).toBe('sweetie-16')
    expect(lospecSlug('  endesga-32 ')).toBe('endesga-32')
  })
})
