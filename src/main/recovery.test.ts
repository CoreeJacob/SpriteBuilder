import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Recovery } from './recovery'

let dir = ''
afterEach(() => fs.rm(dir, { recursive: true, force: true }))

describe('Recovery', () => {
  it('writes, reads back and clears the autosave', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-recovery-'))
    const recovery = new Recovery(path.join(dir, 'recovery'))
    expect(await recovery.read()).toBeNull()
    await recovery.write('{"doc":1}')
    const saved = await recovery.read()
    expect(saved?.content).toBe('{"doc":1}')
    expect(Math.abs(saved!.savedAt - Date.now())).toBeLessThan(5000)
    await recovery.write('{"doc":2}')
    expect((await recovery.read())?.content).toBe('{"doc":2}')
    await recovery.clear()
    expect(await recovery.read()).toBeNull()
    await recovery.clear() // clearing twice is fine
  })

  it('ignores a damaged file', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-recovery-'))
    await fs.mkdir(path.join(dir, 'recovery'))
    await fs.writeFile(path.join(dir, 'recovery', 'studio-autosave.json'), '{ broken')
    expect(await new Recovery(path.join(dir, 'recovery')).read()).toBeNull()
  })
})
