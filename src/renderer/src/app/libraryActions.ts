// Whole-library actions: backing up, restoring and switching library folders.

import { basenameRel } from '@shared/paths'
import type { ImportResult, LibrarySnapshot } from '@shared/types'
import { formatBytes } from '@/lib/format'
import { syncOpenDocuments } from './openDocuments'
import { attempt, useApp } from './store'

/** Shows a different library. Documents open from the old one are closed (or detached if unsaved). */
function switchLibrary(snapshot: LibrarySnapshot): void {
  const app = useApp.getState()
  app.setScope({ kind: 'all' })
  app.setLibrary(snapshot)
  syncOpenDocuments(snapshot)
}

/** "hero.png" for one image, "3 images" for more. */
const images = (paths: string[]): string => (paths.length === 1 ? basenameRel(paths[0]) : `${paths.length} images`)

/** Says what an import or drop did and selects the results. `quietIfNone` for a cancelled dialog. */
export function reportImport({ imported, moved, unchanged }: ImportResult, folder: string, quietIfNone = false): void {
  const app = useApp.getState()
  if (!imported.length && !moved.length) {
    // Dropping images back where they already are does nothing, and needs no message.
    if (!quietIfNone && !unchanged.length) app.notify('Nothing imported. Supported types are PNG, JPG, GIF, WebP, SVG and BMP.', 'error')
    return
  }
  app.select([...imported, ...moved])
  const done = [imported.length && `Imported ${images(imported)}`, moved.length && `Moved ${images(moved)}`].filter(Boolean)
  app.notify(`${done.join(' and ')} into ${folder || 'Library'}`)
}

export async function backupLibrary(): Promise<void> {
  const result = await attempt(() => window.api.backupLibrary())
  if (!result) return
  const file = result.path.split('/').pop()
  useApp.getState().notify(`Backed up ${result.files} files (${formatBytes(result.bytes)}) to ${file}`)
}

export async function restoreLibrary(): Promise<void> {
  const result = await attempt(() => window.api.restoreLibrary())
  if (!result) return
  switchLibrary(result.snapshot)
  useApp.getState().setView('library')
  useApp.getState().notify(`Restored ${result.files} files into “${result.folder.split('/').pop()}” and opened it`)
}

export async function changeLibraryFolder(): Promise<void> {
  const snapshot = await attempt(() => window.api.chooseLibraryRoot())
  if (snapshot) switchLibrary(snapshot)
}
