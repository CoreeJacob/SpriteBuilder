// The right-click menu for library images: the same actions as the details panel.

import { useCallback, useState, type MouseEvent } from 'react'
import { stripExt } from '@shared/paths'
import type { LibraryItem } from '@shared/types'
import { ContextMenu, type MenuEntry, type MenuRequest } from '@/app/ContextMenu'
import { attempt, useApp } from '@/app/store'
import { openInEditor } from '@/editor/io'
import { canvasToBlob, imageToCanvas, loadImage } from '@/lib/canvas'
import { itemUrl } from '@/lib/fileUrl'
import { openInStudio } from '@/studio/io'
import { confirmDelete } from './DetailPanel'

/** Puts an image on the Mac clipboard as a PNG, ready to paste into other apps. */
async function copyImage(item: LibraryItem): Promise<void> {
  const img = await loadImage(itemUrl(item))
  const blob = await canvasToBlob(imageToCanvas(img, img.naturalWidth, img.naturalHeight))
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  useApp.getState().notify(`Copied ${item.name}`)
}

function folderEntries(folders: string[], current: string | null, move: (folder: string) => void): MenuEntry[] {
  return [
    { label: 'Library', icon: 'folder', disabled: current === '', onSelect: () => move('') },
    ...folders.map(
      (f): MenuEntry => ({
        // Indent by depth so the list reads like the sidebar tree.
        label: `${' '.repeat(f.split('/').length - 1)}${f.split('/').pop()}`,
        icon: 'folder',
        disabled: f === current,
        onSelect: () => move(f)
      })
    )
  ]
}

function entriesFor(items: LibraryItem[], folders: string[]): MenuEntry[] {
  const app = useApp.getState()
  const paths = items.map((i) => i.path)
  const move = (folder: string): void =>
    void attempt(async () => {
      const moved = await window.api.moveItems(paths, folder)
      app.select(moved)
      app.notify(`Moved ${moved.length === 1 ? items[0].name : `${moved.length} items`} to ${folder || 'Library'}`)
    })
  const allFavorite = items.every((i) => i.favorite)
  const favorite: MenuEntry = {
    label: allFavorite ? 'Remove from Favourites' : 'Add to Favourites',
    icon: 'star',
    onSelect: () => void attempt(() => window.api.updateMeta(paths, { favorite: !allFavorite }))
  }

  if (items.length > 1) {
    const sameFolder = items.every((i) => i.folder === items[0].folder) ? items[0].folder : null
    return [
      favorite,
      { label: `Move ${items.length} Items to`, icon: 'folder', submenu: folderEntries(folders, sameFolder, move) },
      'separator',
      { label: `Move ${items.length} Items to Trash`, icon: 'trash', hint: '⌫', danger: true, onSelect: () => void confirmDelete(paths) }
    ]
  }

  const item = items[0]
  const vector = item.ext === 'svg'
  return [
    {
      label: item.hasProject ? 'Edit Sprite' : 'Open in Pixel Studio',
      icon: 'studio',
      disabled: vector,
      onSelect: () => void openInStudio(item)
    },
    { label: 'Edit Image', icon: 'editor', disabled: vector, onSelect: () => void openInEditor(item) },
    'separator',
    {
      label: 'Rename…',
      icon: 'rename',
      onSelect: () =>
        void (async () => {
          const name = await app.ask({ title: 'Rename', value: stripExt(item.name), confirmLabel: 'Rename' })
          if (!name || name === stripExt(item.name)) return
          const renamed = await attempt(() => window.api.renameItem(item.path, name))
          if (renamed) app.select([renamed])
        })()
    },
    {
      label: 'Duplicate',
      icon: 'copy',
      onSelect: () => void attempt(async () => app.select([await window.api.duplicateItem(item.path)]))
    },
    favorite,
    { label: 'Move to', icon: 'folder', submenu: folderEntries(folders, item.folder, move) },
    'separator',
    { label: 'Copy Image', icon: 'copy', disabled: vector, onSelect: () => void attempt(() => copyImage(item)) },
    { label: 'Show in Finder', icon: 'reveal', onSelect: () => void attempt(() => window.api.revealItem(item.path)) },
    { label: 'Export…', icon: 'export', onSelect: () => void attempt(() => window.api.exportItem(item.path)) },
    'separator',
    { label: 'Move to Trash', icon: 'trash', hint: '⌫', danger: true, onSelect: () => void confirmDelete([item.path]) }
  ]
}

/** Right-click handling for library images: picks what the menu acts on, then shows it. */
export function useItemMenu() {
  const [menu, setMenu] = useState<MenuRequest | null>(null)
  const close = useCallback(() => setMenu(null), [])

  const open = (e: MouseEvent, item: LibraryItem): void => {
    e.preventDefault()
    e.stopPropagation()
    const app = useApp.getState()
    // Like Finder: right-clicking inside the selection acts on all of it; otherwise just this image.
    if (!app.selection.includes(item.path)) app.select([item.path])
    const chosen = new Set(app.selection.includes(item.path) ? app.selection : [item.path])
    const items = app.library?.items.filter((i) => chosen.has(i.path)) ?? [item]
    setMenu({ x: e.clientX, y: e.clientY, entries: entriesFor(items, app.library?.folders ?? []) })
  }

  return { open, element: menu ? <ContextMenu menu={menu} onClose={close} /> : null }
}
