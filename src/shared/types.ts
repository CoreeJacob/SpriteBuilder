// Types shared by the Electron main process, the preload bridge and the UI.

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] as const
export const PROJECT_SUFFIX = '.sprite.json'

/** Metadata the user edits by hand. */
export interface EditableMeta {
  tags: string[]
  favorite: boolean
  rating: number // 0–5
  notes: string
}

/** Metadata measured by the UI after decoding the image. */
export interface ComputedMeta {
  path: string
  width: number
  height: number
  colorCount: number | null // null when the image is too large to count
}

export interface LibraryItem extends EditableMeta {
  /** Path relative to the library root, using forward slashes. Also the item's id. */
  path: string
  name: string
  /** Folder relative to the root ("" is the root itself). */
  folder: string
  ext: string
  size: number
  addedAt: number
  modifiedAt: number
  width: number | null
  height: number | null
  /** Number of animation frames, or null if unknown. Greater than 1 means animated. */
  frames: number | null
  colorCount: number | null
  /** A Pixel Studio project (`name.sprite.json`) sits next to this PNG. */
  hasProject: boolean
}

export interface LibrarySnapshot {
  root: string
  folders: string[]
  items: LibraryItem[]
}

export interface ImportedFile {
  name: string
  data: Uint8Array
}

export interface SaveSpriteRequest {
  folder: string
  name: string // without extension
  png: Uint8Array
  project: string // JSON text
  overwrite: boolean
}

export interface SpriteBuilderApi {
  getLibrary(): Promise<LibrarySnapshot>
  chooseLibraryRoot(): Promise<LibrarySnapshot | null>
  onLibraryChanged(callback: (snapshot: LibrarySnapshot) => void): () => void

  createFolder(parent: string, name: string): Promise<string>
  renameFolder(path: string, newName: string): Promise<string>
  deleteFolder(path: string): Promise<void>

  /** Copies files into the library. With no paths, shows an Open dialog first. */
  importFiles(destFolder: string, absolutePaths?: string[]): Promise<string[]>
  importData(destFolder: string, files: ImportedFile[]): Promise<string[]>
  moveItems(paths: string[], destFolder: string): Promise<string[]>
  renameItem(path: string, newName: string): Promise<string>
  duplicateItem(path: string): Promise<string>
  deleteItems(paths: string[]): Promise<void>
  updateMeta(paths: string[], patch: Partial<EditableMeta>): Promise<void>
  setComputedMeta(entries: ComputedMeta[]): Promise<void>
  revealItem(path: string): Promise<void>
  exportItem(path: string): Promise<string | null>

  readProject(imagePath: string): Promise<string | null>
  saveSprite(request: SaveSpriteRequest): Promise<string>
  exportPng(defaultName: string, data: Uint8Array): Promise<string | null>
  exportGif(defaultName: string, data: Uint8Array): Promise<string | null>
  /** Saves a sprite-sheet PNG, plus its frame data as a .json file next to it when `json` is given. */
  exportSheet(defaultName: string, png: Uint8Array, json: string | null): Promise<string | null>
  saveSheetToLibrary(folder: string, name: string, png: Uint8Array, json: string | null): Promise<string>

  /** Absolute path of a file dropped from Finder. */
  getPathForFile(file: File): string

  /** Undo/Redo/Select All from the app menu (the menu swallows ⌘Z and ⌘A before the page sees them). */
  onMenuCommand(callback: (command: MenuCommand) => void): () => void
}

export type MenuCommand = 'undo' | 'redo' | 'selectAll'
