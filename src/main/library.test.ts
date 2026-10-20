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

const { Library, matchMoves } = await import('./library')

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

describe('folder watching', () => {
  it('rescans once for the app’s own changes, but still notices changes made in Finder', async () => {
    await open()
    const scan = vi.spyOn(lib as unknown as { scan: () => Promise<void> }, 'scan')
    await lib.importData('', [{ name: 'own.png', data: PNG }])
    await new Promise((r) => setTimeout(r, 900)) // long enough for the watcher to have reacted
    expect(scan).toHaveBeenCalledTimes(1) // just the scan that importData itself does

    await new Promise((r) => setTimeout(r, 300)) // past the grace period
    await write('from-finder.png') // a change the app didn't make
    for (let i = 0; i < 30 && !item('from-finder.png'); i++) await new Promise((r) => setTimeout(r, 100))
    expect(item('from-finder.png')).toBeDefined()
  })
})

describe('bulk tags', () => {
  it('adds and removes tags on many images in one go, keeping their other tags', async () => {
    await write('a.png')
    await write('b.png')
    await open()
    await lib.updateMeta(['a.png'], { tags: ['hero'] })
    await lib.updateMeta(['b.png'], { tags: ['enemy', 'old'] })
    await lib.editTags(['a.png', 'b.png'], ['sprite', ' sprite '], ['old'])
    expect(item('a.png')?.tags).toEqual(['hero', 'sprite'])
    expect(item('b.png')?.tags).toEqual(['enemy', 'sprite'])
  })
})

describe('files moved or renamed outside the app (e.g. in Finder)', () => {
  const finderMove = async (from: string, to: string): Promise<void> => {
    await fs.mkdir(path.dirname(path.join(root, to)), { recursive: true })
    await fs.rename(path.join(root, from), path.join(root, to))
  }
  const until = async (ok: () => boolean): Promise<void> => {
    for (let i = 0; i < 40 && !ok(); i++) await new Promise((r) => setTimeout(r, 100))
  }

  it('keeps tags, favourite and notes when a file is moved and renamed while the app is closed', async () => {
    await write('hero.png')
    await open()
    await lib.updateMeta(['hero.png'], { tags: ['player'], favorite: true, notes: 'main character' })
    lib.close()
    await finderMove('hero.png', 'Heroes/knight.png')
    await open()
    expect(names()).toEqual(['Heroes/knight.png'])
    expect(item('Heroes/knight.png')).toMatchObject({ tags: ['player'], favorite: true, notes: 'main character' })
  })

  it('notices a move made while the app is running, and announces it so open documents follow', async () => {
    await write('hero.png')
    await open()
    await lib.updateMeta(['hero.png'], { tags: ['player'] })
    const updates: LibrarySnapshot[] = []
    lib.close()
    lib = await Library.open(root, (s) => (updates.push(s), (snapshot = s)))
    await new Promise((r) => setTimeout(r, 1100)) // past the app's own-change grace period
    await finderMove('hero.png', 'renamed.png')
    await until(() => !!item('renamed.png'))
    expect(item('renamed.png')?.tags).toEqual(['player'])
    expect(updates.flatMap((u) => u.moved ?? [])).toEqual([{ from: 'hero.png', to: 'renamed.png' }])
  })

  it('falls back to the same name, size and time when the file’s identity changed (copied to another drive)', async () => {
    await write('hero.png')
    await open()
    await lib.updateMeta(['hero.png'], { tags: ['player'] })
    lib.close()
    // A copy-then-delete: a new file on disk, but Finder keeps the modified time.
    const { mtime, atime } = await fs.stat(path.join(root, 'hero.png'))
    await fs.mkdir(path.join(root, 'Heroes'))
    await fs.copyFile(path.join(root, 'hero.png'), path.join(root, 'Heroes/hero.png'))
    await fs.utimes(path.join(root, 'Heroes/hero.png'), atime, mtime)
    await fs.rm(path.join(root, 'hero.png'))
    await open()
    expect(item('Heroes/hero.png')?.tags).toEqual(['player'])
  })

  it('never hands one file’s details to a different new file', async () => {
    await write('hero.png')
    await open()
    await lib.updateMeta(['hero.png'], { tags: ['player'] })
    lib.close()
    await fs.rm(path.join(root, 'hero.png'))
    await write('other.png', GIF) // different name, size and identity
    await open()
    expect(item('other.png')?.tags).toEqual([])
  })

  it('libraries saved before identity numbers were kept pick them up, then follow moves', async () => {
    await write('hero.png')
    await open()
    await lib.updateMeta(['hero.png'], { tags: ['player'] })
    lib.close()
    // Remove the identity numbers, as in an older index file.
    const indexFile = path.join(root, '.spritebuilder/library.json')
    const index = JSON.parse(await fs.readFile(indexFile, 'utf8'))
    for (const meta of Object.values(index.items) as Array<{ ino?: string }>) delete meta.ino
    await fs.writeFile(indexFile, JSON.stringify(index))
    await open()
    lib.close()
    expect(JSON.parse(await fs.readFile(indexFile, 'utf8')).items['hero.png'].ino).toBeTruthy()
    await finderMove('hero.png', 'zz/renamed.png')
    await open()
    expect(item('zz/renamed.png')?.tags).toEqual(['player'])
  })

  it('matches by identity first, never across file types, and not when changed much later', () => {
    const meta = (ino: string, size = 10, modifiedAt = 5) =>
      ({ ino, size, modifiedAt, tags: [], favorite: false, rating: 0, notes: '', addedAt: 0, width: null, height: null, frames: null, colorCount: null })
    const moves = matchMoves(
      [['a.png', meta('1')], ['b.png', meta('2')], ['c.png', meta('3')]],
      [
        { rel: 'x/b.png', ino: '1', size: 10, modifiedAt: 5 }, // same identity as a.png beats b.png's matching name
        { rel: 'c.gif', ino: '3', size: 1, modifiedAt: 1 }, // same identity, but a different type: not the same file
        { rel: 'y/c.png', ino: '9', size: 10, modifiedAt: 2500 } // same name and size, but changed long after: a different file
      ]
    )
    expect(moves).toEqual([{ from: 'a.png', to: 'x/b.png' }])
  })
})

describe('dropping files on a folder', () => {
  it('moves the library’s own files (dragged out of a thumbnail) instead of copying them', async () => {
    await write('hero.png')
    await write('Heroes/.keep', '')
    await open()
    await lib.updateMeta(['hero.png'], { tags: ['player'] })
    const outside = path.join(os.tmpdir(), `spritebuilder-outside-${Date.now()}.png`)
    await fs.writeFile(outside, PNG)
    try {
      const result = await lib.importFiles('Heroes', [path.join(root, 'hero.png'), outside])
      expect(result.moved).toEqual(['Heroes/hero.png'])
      expect(result.imported).toHaveLength(1)
      expect(await exists('hero.png')).toBe(false)
      expect(item('Heroes/hero.png')?.tags).toEqual(['player'])
      // Dropped back on the folder it's already in: nothing happens.
      expect(await lib.importFiles('Heroes', [path.join(root, 'Heroes/hero.png')])).toEqual({ imported: [], moved: [], unchanged: ['Heroes/hero.png'] })
    } finally {
      await fs.rm(outside, { force: true })
    }
  })
})

describe('atlases', () => {
  const options = { maxSize: 512, padding: 2, trim: true, powerOfTwo: false, includeSubfolders: true }
  const json = (image: string) => JSON.stringify({ frames: {}, meta: { image } })

  it('saves the PNG and JSON, remembers how it was packed, and repacks in place', async () => {
    await write('Enemies/bat.png')
    await open()
    expect(await lib.saveAtlas('Enemies', { output: 'Enemies-atlas.png', options }, PNG, json('x.png'))).toBe('Enemies-atlas.png')
    expect(JSON.parse(await fs.readFile(path.join(root, 'Enemies-atlas.json'), 'utf8')).meta.image).toBe('Enemies-atlas.png')
    expect(item('Enemies-atlas.png')).toBeDefined()
    // Repacking overwrites rather than making "Enemies-atlas 2".
    await lib.saveAtlas('Enemies', { output: 'Enemies-atlas.png', options: { ...options, padding: 0 } }, GIF, json('x.png'))
    expect(names().filter((n) => n.startsWith('Enemies-atlas'))).toEqual(['Enemies-atlas.png'])
    lib.close()
    await open()
    expect(await lib.getAtlases()).toEqual({ Enemies: { output: 'Enemies-atlas.png', options: { ...options, padding: 0 } } })
  })

  it('follows renamed and moved folders, and an atlas file moved in the app or in Finder', async () => {
    await write('Enemies/bat.png')
    await write('Packs/.keep', '')
    await open()
    await lib.saveAtlas('Enemies', { output: 'Enemies/out.png', options }, PNG, json('out.png'))
    await lib.renameFolder('Enemies', 'Monsters')
    expect(Object.entries(await lib.getAtlases())).toEqual([['Monsters', { output: 'Monsters/out.png', options }]])
    await lib.moveFolder('Monsters', 'Packs')
    expect((await lib.getAtlases())['Packs/Monsters'].output).toBe('Packs/Monsters/out.png')
    await lib.moveItems(['Packs/Monsters/out.png'], 'Packs')
    expect((await lib.getAtlases())['Packs/Monsters'].output).toBe('Packs/out.png')
    lib.close()
    await fs.rename(path.join(root, 'Packs/out.png'), path.join(root, 'monsters-atlas.png')) // in Finder
    await open()
    expect((await lib.getAtlases())['Packs/Monsters'].output).toBe('monsters-atlas.png')
  })

  it('only saves atlases as PNGs inside the library', async () => {
    await open()
    await expect(lib.saveAtlas('', { output: 'atlas.gif', options }, PNG, json('a'))).rejects.toThrow()
    await expect(lib.saveAtlas('', { output: '../outside.png', options }, PNG, json('a'))).rejects.toThrow()
  })
})

describe('moves and renames are saved straight away', () => {
  const onDisk = async () => JSON.parse(await fs.readFile(path.join(root, '.spritebuilder/library.json'), 'utf8')).items as Record<string, { tags: string[] }>

  it('writes the new paths to the index file, so nothing depends on another save happening later', async () => {
    await write('hero.png')
    await write('Heroes/.keep', '')
    await open()
    await lib.updateMeta(['hero.png'], { tags: ['player'] })
    await lib.moveItems(['hero.png'], 'Heroes')
    expect((await onDisk())['Heroes/hero.png']?.tags).toEqual(['player'])
    await lib.renameItem('Heroes/hero.png', 'knight')
    expect(Object.keys(await onDisk())).toEqual(['Heroes/knight.png'])
    await lib.renameFolder('Heroes', 'Party')
    expect(Object.keys(await onDisk())).toEqual(['Party/knight.png'])
  })
})
