import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '@shared/types'
import { decideSave } from './saveTarget'

const item = (path: string, hasProject = false): LibraryItem => ({ path, name: path.split('/').pop()!, hasProject }) as LibraryItem
const items = [item('hero 2.png'), item('Tiles/grass.png'), item('walk.png', true)]
const studio = { mayReplaceSprites: true }
const editor = { mayReplaceSprites: false }

describe('decideSave', () => {
  it('saves over the open file when its name is kept (the duplicate bug)', () => {
    expect(decideSave(items, '', 'hero 2', 'hero 2.png', studio)).toEqual({ kind: 'self', path: 'hero 2.png' })
    expect(decideSave(items, '', 'Hero 2', 'hero 2.png', studio).kind).toBe('self') // case doesn't matter on macOS
  })

  it('asks before replacing a different existing file', () => {
    expect(decideSave(items, 'Tiles', 'grass.png', 'hero 2.png', studio)).toEqual({ kind: 'replace', path: 'Tiles/grass.png' })
  })

  it('makes a new file for a new name or folder', () => {
    expect(decideSave(items, '', 'knight', 'hero 2.png', studio)).toEqual({ kind: 'new', path: 'knight.png' })
    expect(decideSave(items, 'Tiles', 'hero 2', 'hero 2.png', studio)).toEqual({ kind: 'new', path: 'Tiles/hero 2.png' })
  })

  it('lets Pixel Studio replace a sprite but not the Image Editor', () => {
    expect(decideSave(items, '', 'walk', null, studio).kind).toBe('replace')
    expect(decideSave(items, '', 'walk', null, editor).kind).toBe('blocked')
    expect(decideSave(items, '', 'walk', 'walk.png', editor).kind).toBe('blocked')
  })
})
