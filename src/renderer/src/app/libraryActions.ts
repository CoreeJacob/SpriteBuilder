// Whole-library actions: backing up, restoring and switching library folders.

import type { LibrarySnapshot } from '@shared/types'
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
