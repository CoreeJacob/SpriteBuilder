// Tests for the file-handling side of the library, run against a real temporary folder.

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibrarySnapshot } from '@shared/types'

// "Move to Trash" just deletes in tests.
const trashed: string[] = []
vi.mock('electron', () => ({
  shell: {
    trashItem: async (p: string) => {
      trashed.push(p)
      await fs.rm(p, { recursive: true, force: true })
    }
  }
}))

const { Library } = await import('./library')

// A valid 1×1 PNG, plus a 2-frame GIF.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')
const GIF = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255,
  0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x44, 0x01, 0x00,
  0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b
])

let root: string
let lib: Awaited<ReturnType<typeof Library.open>>
let snapshot: LibrarySnapshot

const write = async (rel: string, data: Buffer | string = PNG): Promise<void> => {
  await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true })
  await fs.writeFile(path.join(root, rel), data)
}
const exists = (rel: string): Promise<boolean> =>
  fs.access(path.join(root, rel)).then(
    () => true,
    () => false
  )
const item = (rel: string) => snapshot.items.find((i) => i.path === rel)
const names = (): string[] => snapshot.items.map((i) => i.path).sort()
const open = async (): Promise<void> => {
  lib = await Library.open(root, (s) => (snapshot = s))
  snapshot = lib.getSnapshot()
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'spritebuilder-test-'))
  trashed.length = 0
})

afterEach(async () => {
  lib?.close()
  await fs.rm(root, { recursive: true, force: true })
})

describe('scanning', () => {
  it('finds images and folders, ignoring hidden files and other file types', async () => {
    await write('hero.png')
    await write('Tiles/Water/wave.gif', GIF)
    await write('notes.txt', 'hello')
    await write('.hidden.png')
    await write('.secret/inside.png')
    await open()
    expect(names()).toEqual(['Tiles/Water/wave.gif', 'hero.png'])
    expect(snapshot.folders).toEqual(['Tiles', 'Tiles/Water'])
    expect(item('Tiles/Water/wave.gif')?.frames).toBe(2)
    expect(item('hero.png')).toMatchObject({ folder: '', ext: 'png', tags: [], favorite: false, hasProject: false })
  })

  it('links a PNG with its Pixel Studio project and takes the frame count from it', async () => {
    await write('walk.png')
    await write('walk.sprite.json', JSON.stringify({ frames: [{}, {}, {}] }))
    await open()
    expect(item('walk.png')).toMatchObject({ hasProject: true, frames: 3 })
    expect(names()).toEqual(['walk.png']) // the project itself isn't listed
  })

  it('keeps metadata between sessions and survives a damaged index', async () => {
    await write('hero.png')
    await open()
    await lib.updateMeta(['hero.png'], { tags: ['player'] })
    lib.close()
    await open()
    expect(item('hero.png')?.tags).toEqual(['player'])
    lib.close()
    await fs.writeFile(path.join(root, '.spritebuilder/library.json'), '{ not json')
    await open()
    expect(item('hero.png')?.tags).toEqual([]) // starts fresh, file untouched
    expect(await exists('hero.png')).toBe(true)
  })

  it('forgets measured sizes when a file changes on disk, but keeps tags', async () => {
    await write('hero.png')
    await open()
    await lib.updateMeta(['hero.png'], { tags: ['player'] })
    await lib.setComputedMeta([{ path: 'hero.png', width: 1, height: 1, colorCount: 1 }])
    expect(item('hero.png')?.width).toBe(1)
    lib.close()
    await write('hero.png', Buffer.concat([PNG, Buffer.from('extra')]))
    await open()
    expect(item('hero.png')).toMatchObject({ width: null, colorCount: null, tags: ['player'] })
  })
})

describe('safety', () => {
  it('refuses paths that escape the library', async () => {
    await open()
    expect(() => lib.abs('../outside.png')).toThrow()
    expect(() => lib.abs('Tiles/../../x')).toThrow()
    await expect(lib.createFolder('', '../evil')).rejects.toThrow()
    await expect(lib.createFolder('', '.hidden')).rejects.toThrow()
  })

  it('never overwrites when importing; picks a free name instead', async () => {
    await write('hero.png')
    await open()
    const added = await lib.importData('', [
      { name: 'hero.png', data: PNG },
      { name: 'hero.png', data: PNG },
      { name: 'readme.txt', data: PNG }
    ])
    expect(added).toEqual(['hero 2.png', 'hero 3.png'])
    expect(names()).toEqual(['hero 2.png', 'hero 3.png', 'hero.png'])
  })

  it('does not let a new PNG adopt an old orphaned project file', async () => {
    await write('ghost.sprite.json', '{}')
    await open()
    expect(await lib.importData('', [{ name: 'ghost.png', data: PNG }])).toEqual(['ghost 2.png'])
  })
})

describe('items', () => {
  it('moves an item with its project and metadata', async () => {
    await write('walk.png')
    await write('walk.sprite.json', '{"frames":[{}]}')
    await write('Heroes/.keep', '')
    await open()
    await lib.updateMeta(['walk.png'], { tags: ['anim'], rating: 4 })
    expect(await lib.moveItems(['walk.png'], 'Heroes')).toEqual(['Heroes/walk.png'])
    expect(await exists('Heroes/walk.sprite.json')).toBe(true)
    expect(await exists('walk.sprite.json')).toBe(false)
    expect(item('Heroes/walk.png')).toMatchObject({ tags: ['anim'], rating: 4, hasProject: true })
  })

  it('renames, keeping the extension, metadata and project', async () => {
    await write('walk.png')
    await write('walk.sprite.json', '{}')
    await open()
    await lib.updateMeta(['walk.png'], { favorite: true })
    expect(await lib.renameItem('walk.png', 'run')).toBe('run.png')
    expect(item('run.png')).toMatchObject({ favorite: true, hasProject: true })
    expect(await exists('run.sprite.json')).toBe(true)
    // Case-only renames work on macOS's case-insensitive disks.
    expect(await lib.renameItem('run.png', 'Run')).toBe('Run.png')
    await write('other.png')
    await expect(lib.renameItem('Run.png', 'other')).rejects.toThrow(/already exists/)
  })

  it('only moves a project along with a PNG, never with a GIF of the same name', async () => {
    await write('walk.png')
    await write('walk.gif', GIF)
    await write('walk.sprite.json', '{}')
    await write('Other/.keep', '')
    await open()
    await lib.moveItems(['walk.gif'], 'Other')
    expect(await exists('walk.sprite.json')).toBe(true)
    expect(item('walk.png')?.hasProject).toBe(true)
  })

  it('duplicates with a fresh name, copying tags and the project', async () => {
    await write('walk.png')
    await write('walk.sprite.json', '{}')
    await open()
    await lib.updateMeta(['walk.png'], { tags: ['anim'] })
    expect(await lib.duplicateItem('walk.png')).toBe('walk 2.png')
    expect(item('walk 2.png')).toMatchObject({ tags: ['anim'], hasProject: true })
  })

  it('moves deleted items (and their projects) to the Trash', async () => {
    await write('walk.png')
    await write('walk.sprite.json', '{}')
    await open()
    await lib.deleteItems(['walk.png'])
    expect(trashed.map((p) => path.basename(p)).sort()).toEqual(['walk.png', 'walk.sprite.json'])
    expect(names()).toEqual([])
  })

  it('cleans up metadata edits', async () => {
    await write('a.png')
    await open()
    await lib.updateMeta(['a.png'], { tags: [' hero ', 'hero', ''], rating: 9 })
    expect(item('a.png')).toMatchObject({ tags: ['hero'], rating: 5 })
  })

  it('replaces an image in place and keeps its tags', async () => {
    await write('a.png')
    await open()
    await lib.updateMeta(['a.png'], { tags: ['keep'] })
    await lib.replaceItem('a.png', Buffer.concat([PNG, Buffer.from('v2')]))
    expect(item('a.png')?.tags).toEqual(['keep'])
    expect((await fs.readFile(path.join(root, 'a.png'))).length).toBe(PNG.length + 2)
    await expect(lib.replaceItem('missing.png', PNG)).rejects.toThrow()
  })
})

describe('folders', () => {
  it('creates, renames (carrying metadata of everything inside) and deletes folders', async () => {
    await write('Tiles/Water/wave.png')
    await open()
    await lib.updateMeta(['Tiles/Water/wave.png'], { tags: ['sea'] })
    await expect(lib.createFolder('', 'Tiles')).rejects.toThrow(/already exists/)
    expect(await lib.createFolder('Tiles', 'Lava')).toBe('Tiles/Lava')
    expect(await lib.renameFolder('Tiles', 'Terrain')).toBe('Terrain')
    expect(item('Terrain/Water/wave.png')?.tags).toEqual(['sea'])
    expect(snapshot.folders).toEqual(['Terrain', 'Terrain/Lava', 'Terrain/Water'])
    // Case-only folder renames work too.
    expect(await lib.renameFolder('Terrain', 'terrain')).toBe('terrain')
    await lib.deleteFolder('terrain')
    expect(snapshot.folders).toEqual([])
    expect(names()).toEqual([])
  })

  it('will not rename or delete the library root', async () => {
    await open()
    await expect(lib.renameFolder('', 'x')).rejects.toThrow()
    await expect(lib.deleteFolder('')).rejects.toThrow()
  })
})

describe('saving from the Studio and exports', () => {
  it('saves a sprite as PNG + project, overwriting only when asked', async () => {
    await open()
    expect(await lib.saveSprite({ folder: '', name: 'hero', png: PNG, project: '{"frames":[{}]}', overwrite: false })).toBe('hero.png')
    expect(await lib.saveSprite({ folder: '', name: 'hero', png: PNG, project: '{}', overwrite: false })).toBe('hero 2.png')
    expect(await lib.saveSprite({ folder: '', name: 'hero', png: PNG, project: '{"frames":[{},{}]}', overwrite: true })).toBe('hero.png')
    expect(await fs.readFile(path.join(root, 'hero.sprite.json'), 'utf8')).toBe('{"frames":[{},{}]}')
  })

  it('saves sprite sheets with JSON that names the final image file', async () => {
    await write('walk-sheet.png')
    await open()
    const rel = await lib.saveSheet('', 'walk-sheet', PNG, JSON.stringify({ frames: {}, meta: { image: 'walk-sheet.png' } }))
    expect(rel).toBe('walk-sheet 2.png')
    const json = JSON.parse(await fs.readFile(path.join(root, 'walk-sheet 2.json'), 'utf8'))
    expect(json.meta.image).toBe('walk-sheet 2.png')
  })
})

describe('saved palettes', () => {
  it('saves, replaces by name, and deletes palettes, persisting them in the library', async () => {
    await open()
    expect(await lib.listPalettes()).toEqual([])
    await lib.savePalette({ name: 'Forest', colors: ['#112233', '#AABBCC'] })
    await lib.savePalette({ name: 'Sea', colors: ['#0000ff'] })
    const list = await lib.savePalette({ name: 'forest', colors: ['#ffffff'] }) // same name, any case
    expect(list.map((p) => p.name)).toEqual(['Sea', 'forest'])
    lib.close()
    await open()
    expect(await lib.listPalettes()).toEqual([
      { name: 'Sea', colors: ['#0000ff'] },
      { name: 'forest', colors: ['#ffffff'] }
    ])
    expect((await lib.deletePalette('Sea')).map((p) => p.name)).toEqual(['forest'])
  })

  it('rejects empty or malformed palettes', async () => {
    await open()
    await expect(lib.savePalette({ name: ' ', colors: ['#000000'] })).rejects.toThrow()
    await expect(lib.savePalette({ name: 'X', colors: [] })).rejects.toThrow()
    await expect(lib.savePalette({ name: 'X', colors: ['red'] })).rejects.toThrow()
  })
})

describe('moves are announced so open documents can follow them', () => {
  it('reports item moves and renames with the update they cause', async () => {
    await write('hero.png')
    await write('Heroes/.keep', '')
    await open()
    const updates: LibrarySnapshot[] = []
    lib.close()
    lib = await Library.open(root, (s) => updates.push(s))
    await lib.moveItems(['hero.png'], 'Heroes')
    await lib.renameItem('Heroes/hero.png', 'knight')
    const moves = updates.flatMap((u) => u.moved ?? [])
    expect(moves).toEqual([
      { from: 'hero.png', to: 'Heroes/hero.png' },
      { from: 'Heroes/hero.png', to: 'Heroes/knight.png' }
    ])
    // Later updates don't repeat old moves.
    await lib.updateMeta(['Heroes/knight.png'], { favorite: true })
    expect(updates.at(-1)?.moved).toBeUndefined()
  })
})

describe('moving folders', () => {
  it('moves a folder with everything inside, keeping metadata', async () => {
    await write('Enemies/Bats/bat.png')
    await write('Characters/.keep', '')
    await open()
    await lib.updateMeta(['Enemies/Bats/bat.png'], { tags: ['flying'] })
    expect(await lib.moveFolder('Enemies', 'Characters')).toBe('Characters/Enemies')
    expect(item('Characters/Enemies/Bats/bat.png')?.tags).toEqual(['flying'])
    expect(snapshot.folders).toEqual(['Characters', 'Characters/Enemies', 'Characters/Enemies/Bats'])
    expect(await lib.moveFolder('Characters/Enemies', '')).toBe('Enemies') // back to the top level
  })

  it('refuses impossible moves', async () => {
    await write('A/B/x.png')
    await write('C/A/.keep', '')
    await open()
    await expect(lib.moveFolder('A', 'A/B')).rejects.toThrow(/inside itself/)
    await expect(lib.moveFolder('A', 'A')).rejects.toThrow(/inside itself/)
    await expect(lib.moveFolder('A', 'C')).rejects.toThrow(/already exists/)
    await expect(lib.moveFolder('', 'C')).rejects.toThrow()
    expect(await lib.moveFolder('A/B', 'A')).toBe('A/B') // already there
  })
})
