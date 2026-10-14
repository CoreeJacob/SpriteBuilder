// The library lives in a real folder on disk. Sub-folders are library folders, and
// image files are library items. Extra metadata (tags, notes, measured sizes) is kept
// in `<root>/.spritebuilder/library.json`, keyed by each item's relative path.

import { promises as fs, watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import { shell } from 'electron'
import { countFrames } from '@shared/imageInfo'
import {
  basenameRel,
  dirnameRel,
  extOf,
  isInside,
  isValidName,
  joinRel,
  projectPathFor,
  stripExt,
  uniqueName
} from '@shared/paths'
import {
  IMAGE_EXTENSIONS,
  PROJECT_SUFFIX,
  type ComputedMeta,
  type EditableMeta,
  type ImportedFile,
  type LibraryItem,
  type LibrarySnapshot,
  type SaveSpriteRequest
} from '@shared/types'

const INDEX_DIR = '.spritebuilder'
const INDEX_FILE = 'library.json'
const MAX_FRAME_SCAN_BYTES = 50 * 1024 * 1024

interface StoredMeta extends EditableMeta {
  addedAt: number
  size: number
  modifiedAt: number
  width: number | null
  height: number | null
  frames: number | null
  colorCount: number | null
}

interface IndexFile {
  version: 1
  items: Record<string, StoredMeta>
}

const isImage = (name: string): boolean =>
  !name.startsWith('.') && (IMAGE_EXTENSIONS as readonly string[]).includes(extOf(name))

/** Only PNGs can have a Pixel Studio project next to them. */
const projectOf = (imagePath: string): string | null =>
  extOf(imagePath) === 'png' ? projectPathFor(imagePath) : null

const exists = async (p: string): Promise<boolean> =>
  fs.access(p).then(
    () => true,
    () => false
  )

export class Library {
  private index: IndexFile = { version: 1, items: {} }
  private snapshot: LibrarySnapshot
  private watcher: FSWatcher | null = null
  private rescanTimer: NodeJS.Timeout | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private lastEmitted = ''

  private constructor(
    readonly root: string,
    private readonly onChange: (snapshot: LibrarySnapshot) => void
  ) {
    this.snapshot = { root, folders: [], items: [] }
  }

  static async open(root: string, onChange: (s: LibrarySnapshot) => void): Promise<Library> {
    const library = new Library(path.resolve(root), onChange)
    await fs.mkdir(path.join(library.root, INDEX_DIR), { recursive: true })
    await library.loadIndex()
    await library.serial(() => library.scan())
    library.startWatching()
    return library
  }

  close(): void {
    this.watcher?.close()
    if (this.rescanTimer) clearTimeout(this.rescanTimer)
  }

  getSnapshot(): LibrarySnapshot {
    return this.snapshot
  }

  /** Absolute path for a library-relative path. Throws if it points outside the library. */
  abs(rel: string): string {
    const p = path.resolve(this.root, ...rel.split('/').filter(Boolean))
    if (p !== this.root && !p.startsWith(this.root + path.sep)) {
      throw new Error(`Path is outside the library: ${rel}`)
    }
    return p
  }

  // ---------- folders ----------

  createFolder(parent: string, name: string): Promise<string> {
    return this.mutate(async () => {
      this.assertName(name)
      const rel = joinRel(parent, name.trim())
      if (await exists(this.abs(rel))) throw new Error(`"${name}" already exists`)
      await fs.mkdir(this.abs(rel))
      return rel
    })
  }

  renameFolder(folder: string, newName: string): Promise<string> {
    return this.mutate(async () => {
      this.assertName(newName)
      if (!folder) throw new Error('The library root cannot be renamed')
      const target = joinRel(dirnameRel(folder), newName.trim())
      if (target === folder) return folder
      if (await exists(this.abs(target))) throw new Error(`"${newName}" already exists`)
      await fs.rename(this.abs(folder), this.abs(target))
      this.remapMeta((p) => (isInside(p, folder) ? target + p.slice(folder.length) : p))
      return target
    })
  }

  deleteFolder(folder: string): Promise<void> {
    return this.mutate(async () => {
      if (!folder) throw new Error('The library root cannot be deleted')
      await shell.trashItem(this.abs(folder))
    })
  }

  // ---------- items ----------

  importFiles(destFolder: string, absolutePaths: string[]): Promise<string[]> {
    return this.mutate(async () => {
      const added: string[] = []
      for (const source of absolutePaths) {
        const name = path.basename(source)
        if (!isImage(name)) continue
        const rel = await this.freePath(destFolder, name)
        await fs.copyFile(source, this.abs(rel))
        added.push(rel)
      }
      return added
    })
  }

  importData(destFolder: string, files: ImportedFile[]): Promise<string[]> {
    return this.mutate(async () => {
      const added: string[] = []
      for (const file of files) {
        if (!isImage(file.name)) continue
        const rel = await this.freePath(destFolder, file.name)
        await fs.writeFile(this.abs(rel), file.data)
        added.push(rel)
      }
      return added
    })
  }

  moveItems(paths: string[], destFolder: string): Promise<string[]> {
    return this.mutate(async () => {
      const moved: string[] = []
      for (const rel of paths) {
        if (dirnameRel(rel) === destFolder) {
          moved.push(rel)
          continue
        }
        const target = await this.freePath(destFolder, basenameRel(rel))
        await this.moveWithProject(rel, target)
        moved.push(target)
      }
      return moved
    })
  }

  renameItem(rel: string, newName: string): Promise<string> {
    return this.mutate(async () => {
      const ext = extOf(rel)
      let name = newName.trim()
      if (extOf(name) !== ext) name = `${name}.${ext}`
      this.assertName(name)
      const target = joinRel(dirnameRel(rel), name)
      if (target === rel) return rel
      // A case-only rename is fine on macOS's case-insensitive disks.
      if (target.toLowerCase() !== rel.toLowerCase() && (await exists(this.abs(target)))) {
        throw new Error(`"${name}" already exists`)
      }
      await this.moveWithProject(rel, target)
      return target
    })
  }

  duplicateItem(rel: string): Promise<string> {
    return this.mutate(async () => {
      const target = await this.freePath(dirnameRel(rel), basenameRel(rel))
      await fs.copyFile(this.abs(rel), this.abs(target))
      const project = projectOf(rel)
      if (project && (await exists(this.abs(project)))) {
        await fs.copyFile(this.abs(project), this.abs(projectPathFor(target)))
      }
      const meta = this.index.items[rel]
      if (meta) this.index.items[target] = { ...meta, tags: [...meta.tags], addedAt: Date.now() }
      await this.saveIndex()
      return target
    })
  }

  deleteItems(paths: string[]): Promise<void> {
    return this.mutate(async () => {
      for (const rel of paths) {
        await shell.trashItem(this.abs(rel))
        const project = projectOf(rel)
        if (project && (await exists(this.abs(project)))) await shell.trashItem(this.abs(project))
      }
    })
  }

  updateMeta(paths: string[], patch: Partial<EditableMeta>): Promise<void> {
    return this.serial(async () => {
      const clean: Partial<EditableMeta> = {}
      if (patch.tags) clean.tags = [...new Set(patch.tags.map((t) => t.trim()).filter(Boolean))]
      if (patch.favorite !== undefined) clean.favorite = patch.favorite
      if (patch.rating !== undefined) clean.rating = Math.max(0, Math.min(5, Math.round(patch.rating)))
      if (patch.notes !== undefined) clean.notes = patch.notes
      for (const rel of paths) {
        const meta = this.index.items[rel]
        if (meta) Object.assign(meta, clean)
      }
      await this.saveIndex()
      this.refreshFromIndex()
    })
  }

  setComputedMeta(entries: ComputedMeta[]): Promise<void> {
    return this.serial(async () => {
      for (const e of entries) {
        const meta = this.index.items[e.path]
        if (!meta) continue
        meta.width = e.width
        meta.height = e.height
        meta.colorCount = e.colorCount
      }
      await this.saveIndex()
      this.refreshFromIndex()
    })
  }

  async readProject(imagePath: string): Promise<string | null> {
    const project = projectOf(imagePath)
    if (!project || !(await exists(this.abs(project)))) return null
    return fs.readFile(this.abs(project), 'utf8')
  }

  saveSprite(req: SaveSpriteRequest): Promise<string> {
    return this.mutate(async () => {
      this.assertName(req.name)
      const fileName = `${stripExt(req.name.trim())}.png`
      const rel = req.overwrite ? joinRel(req.folder, fileName) : await this.freePath(req.folder, fileName)
      await fs.writeFile(this.abs(rel), req.png)
      await fs.writeFile(this.abs(projectPathFor(rel)), req.project, 'utf8')
      return rel
    })
  }

  // ---------- internals ----------

  /** Runs tasks one at a time so scans and edits never interleave. */
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task)
    this.queue = run.catch(() => undefined)
    return run
  }

  /** Runs a change to the files on disk, then rescans so the UI sees the result. */
  private mutate<T>(task: () => Promise<T>): Promise<T> {
    return this.serial(async () => {
      try {
        return await task()
      } finally {
        await this.scan()
      }
    })
  }

  private assertName(name: string): void {
    if (!isValidName(name)) throw new Error(`"${name}" is not a valid name`)
  }

  private async freePath(folder: string, name: string): Promise<string> {
    const taken = new Set(
      (await fs.readdir(this.abs(folder)).catch(() => [] as string[])).map((n) => n.toLowerCase())
    )
    // The project file must be free as well, so a new PNG never adopts an old project.
    const free = uniqueName(name, (c) => {
      const project = projectOf(c)
      return taken.has(c.toLowerCase()) || (project !== null && taken.has(project.toLowerCase()))
    })
    return joinRel(folder, free)
  }

  private async moveWithProject(from: string, to: string): Promise<void> {
    await fs.rename(this.abs(from), this.abs(to))
    const project = projectOf(from)
    if (project && (await exists(this.abs(project)))) {
      await fs.rename(this.abs(project), this.abs(projectPathFor(to)))
    }
    this.remapMeta((p) => (p === from ? to : p))
  }

  private remapMeta(map: (p: string) => string): void {
    const next: Record<string, StoredMeta> = {}
    for (const [p, meta] of Object.entries(this.index.items)) next[map(p)] = meta
    this.index.items = next
  }

  private async loadIndex(): Promise<void> {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(this.root, INDEX_DIR, INDEX_FILE), 'utf8'))
      if (raw && raw.version === 1 && raw.items) this.index = raw
    } catch {
      // Missing or unreadable index: start fresh. The files themselves are untouched.
    }
  }

  private async saveIndex(): Promise<void> {
    const file = path.join(this.root, INDEX_DIR, INDEX_FILE)
    const tmp = `${file}.tmp`
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(tmp, JSON.stringify(this.index, null, 2), 'utf8')
    await fs.rename(tmp, file)
  }

  private async scan(): Promise<void> {
    const folders: string[] = []
    const images: string[] = []
    const projects = new Set<string>()

    const walk = async (rel: string): Promise<void> => {
      const entries = await fs.readdir(this.abs(rel), { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const child = joinRel(rel, entry.name)
        if (entry.isDirectory()) {
          folders.push(child)
          await walk(child)
        } else if (entry.isFile()) {
          if (entry.name.toLowerCase().endsWith(PROJECT_SUFFIX)) projects.add(child.toLowerCase())
          else if (isImage(entry.name)) images.push(child)
        }
      }
    }
    await walk('')

    let changed = false
    const seen = new Set<string>()
    const items: LibraryItem[] = []

    for (const rel of images) {
      const stat = await fs.stat(this.abs(rel)).catch(() => null)
      if (!stat) continue
      seen.add(rel)
      const size = stat.size
      const modifiedAt = Math.round(stat.mtimeMs)
      let meta = this.index.items[rel]
      if (!meta) {
        meta = {
          addedAt: Math.round(stat.birthtimeMs || Date.now()),
          tags: [],
          favorite: false,
          rating: 0,
          notes: '',
          size,
          modifiedAt,
          width: null,
          height: null,
          frames: null,
          colorCount: null
        }
        this.index.items[rel] = meta
        changed = true
      } else if (meta.size !== size || meta.modifiedAt !== modifiedAt) {
        // The file changed on disk, so the measured values are stale.
        Object.assign(meta, { size, modifiedAt, width: null, height: null, frames: null, colorCount: null })
        changed = true
      }
      if (meta.frames === null && size <= MAX_FRAME_SCAN_BYTES) {
        const bytes = await fs.readFile(this.abs(rel)).catch(() => null)
        if (bytes) {
          meta.frames = countFrames(bytes, extOf(rel))
          changed = true
        }
      }
      const project = projectOf(rel)
      items.push(this.toItem(rel, meta, project !== null && projects.has(project.toLowerCase())))
    }

    for (const rel of Object.keys(this.index.items)) {
      if (!seen.has(rel)) {
        delete this.index.items[rel]
        changed = true
      }
    }
    if (changed) await this.saveIndex()

    folders.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    items.sort((a, b) => a.path.localeCompare(b.path))
    this.snapshot = { root: this.root, folders, items }
    this.emit()
  }

  /** Rebuilds the snapshot from the index without touching the disk (used for metadata edits). */
  private refreshFromIndex(): void {
    const items = this.snapshot.items
      .filter((item) => this.index.items[item.path])
      .map((item) => this.toItem(item.path, this.index.items[item.path], item.hasProject))
    this.snapshot = { ...this.snapshot, items }
    this.emit()
  }

  private toItem(rel: string, meta: StoredMeta, hasProject: boolean): LibraryItem {
    const name = basenameRel(rel)
    return {
      path: rel,
      name,
      folder: dirnameRel(rel),
      ext: extOf(name),
      size: meta.size,
      addedAt: meta.addedAt,
      modifiedAt: meta.modifiedAt,
      width: meta.width,
      height: meta.height,
      frames: meta.frames,
      colorCount: meta.colorCount,
      tags: meta.tags,
      favorite: meta.favorite,
      rating: meta.rating,
      notes: meta.notes,
      hasProject
    }
  }

  private emit(): void {
    const json = JSON.stringify(this.snapshot)
    if (json === this.lastEmitted) return
    this.lastEmitted = json
    this.onChange(this.snapshot)
  }

  private startWatching(): void {
    try {
      this.watcher = watch(this.root, { recursive: true }, (_event, filename) => {
        const name = filename?.toString() ?? ''
        if (name.split(path.sep).some((part) => part.startsWith('.'))) return
        if (this.rescanTimer) clearTimeout(this.rescanTimer)
        this.rescanTimer = setTimeout(() => void this.serial(() => this.scan()), 300)
      })
    } catch (err) {
      console.error('Could not watch the library folder:', err)
    }
  }
}
