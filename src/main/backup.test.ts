import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBackup, restoreBackup } from './backup'

let dir = ''
beforeEach(async () => (dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-backup-'))))
afterEach(() => fs.rm(dir, { recursive: true, force: true }))

const write = async (rel: string, data: string | Buffer): Promise<void> => {
  await fs.mkdir(path.dirname(path.join(dir, 'lib', rel)), { recursive: true })
  await fs.writeFile(path.join(dir, 'lib', rel), data)
}
const read = (root: string, rel: string): Promise<string> => fs.readFile(path.join(dir, root, rel), 'utf8')

describe('library backups', () => {
  it('round-trips images, folders and the hidden metadata folder exactly', async () => {
    await write('hero.png', Buffer.from([137, 80, 78, 71, 1, 2, 3]))
    await write('Tiles/Water/wave.gif', 'GIF89a-ish')
    await write('.spritebuilder/library.json', '{"version":1}')
    await write('.spritebuilder/palettes.json', '{"palettes":[]}')
    await write('.DS_Store', 'junk')
    await write('.spritebuilder/library.json.tmp', 'half-written')
    const backup = await createBackup(path.join(dir, 'lib'))
    expect(backup.files).toBe(4) // .DS_Store and .tmp files are left out

    const result = await restoreBackup(backup.zip, path.join(dir, 'restored'))
    expect(result.files).toBe(4)
    expect(await read('restored', '.spritebuilder/library.json')).toBe('{"version":1}')
    expect(await read('restored', 'Tiles/Water/wave.gif')).toBe('GIF89a-ish')
    expect([...(await fs.readFile(path.join(dir, 'restored', 'hero.png')))]).toEqual([137, 80, 78, 71, 1, 2, 3])
  })

  it('refuses to restore over existing files', async () => {
    await write('a.png', 'x')
    const { zip } = await createBackup(path.join(dir, 'lib'))
    await expect(restoreBackup(zip, path.join(dir, 'lib'))).rejects.toThrow(/empty folder/)
  })

  it('refuses zips that try to write outside the folder, and writes nothing', async () => {
    const evil = zipSync({ 'ok.png': new Uint8Array([1]), '../escaped.txt': new Uint8Array([2]) })
    await expect(restoreBackup(evil, path.join(dir, 'out'))).rejects.toThrow(/unsafe path/)
    await expect(fs.access(path.join(dir, 'escaped.txt'))).rejects.toThrow()
    await expect(fs.access(path.join(dir, 'out', 'ok.png'))).rejects.toThrow()
  })

  it('explains when a file isn’t a zip', async () => {
    await expect(restoreBackup(new Uint8Array([1, 2, 3]), path.join(dir, 'x'))).rejects.toThrow(/isn’t a readable .zip/)
  })
})
