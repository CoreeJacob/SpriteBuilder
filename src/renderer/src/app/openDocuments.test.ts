import { beforeEach, describe, expect, it } from 'vitest'
import type { LibraryItem, LibrarySnapshot } from '@shared/types'
import { useEditor } from '@/editor/store'
import { blank } from '@/editor/ops'
import { createDoc } from '@/studio/model'
import { useStudio } from '@/studio/store'
import { syncOpenDocuments } from './openDocuments'

const item = (path: string): LibraryItem =>
  ({ path, name: path.split('/').pop()!, folder: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '' }) as LibraryItem
const snap = (paths: string[], folders: string[] = [], moved?: LibrarySnapshot['moved']): LibrarySnapshot => ({
  root: '/lib',
  folders,
  items: paths.map(item),
  moved
})

const openSprite = (savedPath: string | null, dirty = false): void => {
  useStudio.getState().loadDoc(createDoc(4, 4), { savedPath, name: 'hero', folder: savedPath?.includes('/') ? savedPath.split('/')[0] : '' })
  useStudio.setState({ dirty })
}

describe('Pixel Studio follows its file', () => {
  beforeEach(() => useStudio.getState().closeDoc())

  it('follows a rename', () => {
    openSprite('hero.png')
    syncOpenDocuments(snap(['knight.png'], [], [{ from: 'hero.png', to: 'knight.png' }]))
    expect(useStudio.getState()).toMatchObject({ savedPath: 'knight.png', name: 'knight', folder: '' })
  })

  it('closes a deleted sprite with no unsaved changes', () => {
    openSprite('hero.png')
    syncOpenDocuments(snap([]))
    expect(useStudio.getState().doc).toBeNull()
  })

  it('keeps unsaved work open when its file is deleted, but stops pointing at the file', () => {
    openSprite('hero.png', true)
    syncOpenDocuments(snap([]))
    expect(useStudio.getState().doc).not.toBeNull()
    expect(useStudio.getState()).toMatchObject({ savedPath: null, dirty: true })
  })

  it('moves an unsaved sprite’s target folder back to the library root if that folder goes', () => {
    openSprite(null, true)
    useStudio.setState({ folder: 'Gone' })
    syncOpenDocuments(snap([], []))
    expect(useStudio.getState().folder).toBe('')
  })

  it('leaves never-saved sprites alone', () => {
    openSprite(null)
    syncOpenDocuments(snap([]))
    expect(useStudio.getState().doc).not.toBeNull()
  })
})

describe('Image Editor follows its file', () => {
  const openImage = (path: string, dirty = false): void => {
    useEditor.getState().open({ path, name: 'tiles', folder: '', ext: 'png', hasProject: false }, blank(2, 2))
    useEditor.setState({ dirty })
  }

  it('follows a move', () => {
    openImage('tiles.png')
    syncOpenDocuments(snap(['Art/tiles.png'], ['Art'], [{ from: 'tiles.png', to: 'Art/tiles.png' }]))
    expect(useEditor.getState().source).toMatchObject({ path: 'Art/tiles.png', folder: 'Art', name: 'tiles' })
  })

  it('closes when the image is deleted and nothing is unsaved', () => {
    openImage('tiles.png')
    syncOpenDocuments(snap([]))
    expect(useEditor.getState().image).toBeNull()
  })

  it('keeps unsaved edits and switches Save to “save a copy”', () => {
    openImage('tiles.png', true)
    syncOpenDocuments(snap([]))
    expect(useEditor.getState().image).not.toBeNull()
    expect(useEditor.getState().canOverwrite).toBe(false)
  })
})
