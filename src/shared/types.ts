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

/** A file or folder the app moved or renamed (folders carry everything inside them). */
export interface PathMove {
  from: string
  to: string
}

export interface LibrarySnapshot {
  root: string
  folders: string[]
  items: LibraryItem[]
  /** Moves and renames that caused this update, so open documents can follow their files. */
  moved?: PathMove[]
}

export interface ImportedFile {
  name: string
  data: Uint8Array
}

export interface SavedPalette {
  name: string
  colors: string[] // '#rrggbb'
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
  /** Saves the whole library as a .zip chosen in a Save dialog. Null if cancelled. */
  backupLibrary(): Promise<{ path: string; files: number; bytes: number } | null>
  /** Unpacks a backup .zip into a new folder and opens it as the library. Null if cancelled. */
  restoreLibrary(): Promise<{ snapshot: LibrarySnapshot; folder: string; files: number } | null>
  chooseLibraryRoot(): Promise<LibrarySnapshot | null>
  onLibraryChanged(callback: (snapshot: LibrarySnapshot) => void): () => void

  createFolder(parent: string, name: string): Promise<string>
  renameFolder(path: string, newName: string): Promise<string>
  /** Moves a folder (and everything in it) inside another folder; "" is the library root. */
  moveFolder(path: string, destParent: string): Promise<string>
  deleteFolder(path: string): Promise<void>

  /** Copies files into the library. With no paths, shows an Open dialog first. */
  importFiles(destFolder: string, absolutePaths?: string[]): Promise<string[]>
  importData(destFolder: string, files: ImportedFile[]): Promise<string[]>
  moveItems(paths: string[], destFolder: string): Promise<string[]>
  renameItem(path: string, newName: string): Promise<string>
  duplicateItem(path: string): Promise<string>
  deleteItems(paths: string[]): Promise<void>
  /** Overwrites a library image with new bytes (the Image Editor's Save). */
  replaceItem(path: string, data: Uint8Array): Promise<string>
  updateMeta(paths: string[], patch: Partial<EditableMeta>): Promise<void>
  /** Adds and removes tags on several images in one go. */
  editTags(paths: string[], add: string[], remove: string[]): Promise<void>
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

  /** Palettes the user saved, stored with the library. */
  listPalettes(): Promise<SavedPalette[]>
  /** Adds a palette, or replaces the one with the same name. */
  savePalette(palette: SavedPalette): Promise<SavedPalette[]>
  deletePalette(name: string): Promise<SavedPalette[]>
  /** Downloads a palette from lospec.com by its name in the URL (e.g. "sweetie-16"). */
  fetchLospecPalette(slug: string): Promise<SavedPalette>

  /** Crash recovery for Pixel Studio: keeps one autosaved copy of unsaved work. */
  writeRecovery(content: string): Promise<void>
  readRecovery(): Promise<{ savedAt: number; content: string } | null>
  clearRecovery(): Promise<void>

  /** Absolute path of a file dropped from Finder. */
  getPathForFile(file: File): string

  /** Undo/Redo/Select All from the app menu (the menu swallows ⌘Z and ⌘A before the page sees them). */
  onMenuCommand(callback: (command: MenuCommand) => void): () => void
}

/** Edit-menu flips and quarter turns, sent to whichever screen is showing. */
const TURN_COMMANDS = ['flipH', 'flipV', 'rotateCW', 'rotateCCW'] as const
export type TurnCommand = (typeof TURN_COMMANDS)[number]
export const isTurnCommand = (command: string): command is TurnCommand => (TURN_COMMANDS as readonly string[]).includes(command)
export type MenuCommand = 'undo' | 'redo' | 'selectAll' | 'backup' | 'restore' | 'shortcuts' | TurnCommand
