// Keeps Pixel Studio and the Image Editor in step with the library: when the file they
// have open is moved or renamed they follow it, and when it's deleted they close it (or,
// with unsaved changes, keep the work open but stop pointing at the missing file).

import { basenameRel, dirnameRel, followMoves, stripExt } from '@shared/paths'
import type { LibrarySnapshot } from '@shared/types'
import { useEditor } from '@/editor/store'
import { useStudio } from '@/studio/store'
import { useApp } from './store'

export function syncOpenDocuments(snapshot: LibrarySnapshot): void {
  const moves = snapshot.moved ?? []
  const present = new Set(snapshot.items.map((i) => i.path))
  const folders = new Set(['', ...snapshot.folders])
  const notify = useApp.getState().notify

  // ---- Pixel Studio ----
  const studio = useStudio.getState()
  if (studio.doc) {
    let savedPath = studio.savedPath && followMoves(studio.savedPath, moves)
    let folder = followMoves(studio.folder, moves)
    let name = studio.name
    if (savedPath && present.has(savedPath)) {
      folder = dirnameRel(savedPath)
      name = stripExt(basenameRel(savedPath))
    } else if (savedPath) {
      const file = basenameRel(savedPath)
      if (!studio.dirty) {
        studio.closeDoc()
        notify(`“${file}” was deleted, so it was closed in Pixel Studio.`)
        return syncEditor()
      }
      // Unsaved work stays open; Save will now ask for a name instead of writing to a missing file.
      savedPath = null
      notify(`“${file}” was deleted. Your unsaved changes are still open in Pixel Studio; save them to keep them.`, 'error')
    }
    if (!folders.has(folder)) folder = ''
    if (savedPath !== studio.savedPath || folder !== studio.folder || name !== studio.name) {
      useStudio.setState({ savedPath, folder, name })
    }
  }
  syncEditor()

  // ---- Image Editor ----
  function syncEditor(): void {
    const editor = useEditor.getState()
    const source = editor.source
    if (!source || !editor.image) return
    const path = followMoves(source.path, moves)
    if (present.has(path)) {
      if (path !== source.path) {
        const file = basenameRel(path)
        useEditor.setState({ source: { ...source, path, folder: dirnameRel(path), name: stripExt(file) } })
      }
      return
    }
    if (!editor.dirty) {
      editor.close()
      notify(`“${source.name}.${source.ext}” was deleted, so it was closed in the Image Editor.`)
      return
    }
    // Keep the edits; with the original gone, Save makes a copy instead of overwriting.
    const folder = folders.has(dirnameRel(path)) ? dirnameRel(path) : ''
    useEditor.setState({ source: { ...source, path, folder }, canOverwrite: false })
    notify(`“${source.name}.${source.ext}” was deleted. Your edits are still open; Save will make a new copy.`, 'error')
  }
}
