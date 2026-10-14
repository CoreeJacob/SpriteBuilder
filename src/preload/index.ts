import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { LibrarySnapshot, MenuCommand, SpriteBuilderApi } from '@shared/types'

const subscribe = <T>(channel: string, callback: (value: T) => void): (() => void) => {
  const listener = (_event: IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: SpriteBuilderApi = {
  getLibrary: () => ipcRenderer.invoke('library:get'),
  chooseLibraryRoot: () => ipcRenderer.invoke('library:chooseRoot'),
  onLibraryChanged: (callback) => subscribe<LibrarySnapshot>('library:changed', callback),

  createFolder: (parent, name) => ipcRenderer.invoke('folder:create', parent, name),
  renameFolder: (path, name) => ipcRenderer.invoke('folder:rename', path, name),
  deleteFolder: (path) => ipcRenderer.invoke('folder:delete', path),

  importFiles: (dest, paths) => ipcRenderer.invoke('items:importFiles', dest, paths),
  importData: (dest, files) => ipcRenderer.invoke('items:importData', dest, files),
  moveItems: (paths, dest) => ipcRenderer.invoke('items:move', paths, dest),
  renameItem: (path, name) => ipcRenderer.invoke('items:rename', path, name),
  duplicateItem: (path) => ipcRenderer.invoke('items:duplicate', path),
  deleteItems: (paths) => ipcRenderer.invoke('items:delete', paths),
  updateMeta: (paths, patch) => ipcRenderer.invoke('items:updateMeta', paths, patch),
  setComputedMeta: (entries) => ipcRenderer.invoke('items:setComputed', entries),
  revealItem: (path) => ipcRenderer.invoke('items:reveal', path),
  exportItem: (path) => ipcRenderer.invoke('items:export', path),

  readProject: (path) => ipcRenderer.invoke('sprite:readProject', path),
  saveSprite: (request) => ipcRenderer.invoke('sprite:save', request),
  exportPng: (name, data) => ipcRenderer.invoke('sprite:exportPng', name, data),

  getPathForFile: (file) => webUtils.getPathForFile(file),
  onMenuCommand: (callback) => subscribe<MenuCommand>('menu:command', callback)
}

contextBridge.exposeInMainWorld('api', api)
