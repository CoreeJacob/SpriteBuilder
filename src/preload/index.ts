import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { LibrarySnapshot, MenuCommand, SpriteBuilderApi } from '@shared/types'

const subscribe = <T>(channel: string, callback: (value: T) => void): (() => void) => {
  const listener = (_event: IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: SpriteBuilderApi = {
  getLibrary: () => ipcRenderer.invoke('library:get'),
  backupLibrary: () => ipcRenderer.invoke('library:backup'),
  restoreLibrary: () => ipcRenderer.invoke('library:restore'),
  chooseLibraryRoot: () => ipcRenderer.invoke('library:chooseRoot'),
  onLibraryChanged: (callback) => subscribe<LibrarySnapshot>('library:changed', callback),

  createFolder: (parent, name) => ipcRenderer.invoke('folder:create', parent, name),
  renameFolder: (path, name) => ipcRenderer.invoke('folder:rename', path, name),
  moveFolder: (path, dest) => ipcRenderer.invoke('folder:move', path, dest),
  deleteFolder: (path) => ipcRenderer.invoke('folder:delete', path),

  importFiles: (dest, paths) => ipcRenderer.invoke('items:importFiles', dest, paths),
  getAtlases: () => ipcRenderer.invoke('atlas:list'),
  saveAtlas: (folder, recipe, png, json) => ipcRenderer.invoke('atlas:save', folder, recipe, png, json),
  importData: (dest, files) => ipcRenderer.invoke('items:importData', dest, files),
  moveItems: (paths, dest) => ipcRenderer.invoke('items:move', paths, dest),
  renameItem: (path, name) => ipcRenderer.invoke('items:rename', path, name),
  duplicateItem: (path) => ipcRenderer.invoke('items:duplicate', path),
  deleteItems: (paths) => ipcRenderer.invoke('items:delete', paths),
  replaceItem: (path, data) => ipcRenderer.invoke('items:replace', path, data),
  updateMeta: (paths, patch) => ipcRenderer.invoke('items:updateMeta', paths, patch),
  editTags: (paths, add, remove) => ipcRenderer.invoke('items:editTags', paths, add, remove),
  setComputedMeta: (entries) => ipcRenderer.invoke('items:setComputed', entries),
  revealItem: (path) => ipcRenderer.invoke('items:reveal', path),
  startDrag: (paths) => ipcRenderer.send('items:startDrag', paths),
  exportItem: (path) => ipcRenderer.invoke('items:export', path),

  readProject: (path) => ipcRenderer.invoke('sprite:readProject', path),
  saveSprite: (request) => ipcRenderer.invoke('sprite:save', request),
  exportPng: (name, data) => ipcRenderer.invoke('sprite:exportPng', name, data),
  exportGif: (name, data) => ipcRenderer.invoke('sprite:exportGif', name, data),
  exportSheet: (name, png, json) => ipcRenderer.invoke('sprite:exportSheet', name, png, json),
  saveSheetToLibrary: (folder, name, png, json) => ipcRenderer.invoke('sprite:saveSheetToLibrary', folder, name, png, json),

  listPalettes: () => ipcRenderer.invoke('palettes:list'),
  savePalette: (palette) => ipcRenderer.invoke('palettes:save', palette),
  deletePalette: (name) => ipcRenderer.invoke('palettes:delete', name),
  fetchLospecPalette: (slug) => ipcRenderer.invoke('palettes:lospec', slug),

  writeRecovery: (content) => ipcRenderer.invoke('recovery:write', content),
  readRecovery: () => ipcRenderer.invoke('recovery:read'),
  clearRecovery: () => ipcRenderer.invoke('recovery:clear'),

  getPathForFile: (file) => webUtils.getPathForFile(file),
  onMenuCommand: (callback) => subscribe<MenuCommand>('menu:command', callback)
}

contextBridge.exposeInMainWorld('api', api)
