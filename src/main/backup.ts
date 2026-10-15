// Library backups: the whole library folder (images, folders, and the hidden
// .spritebuilder folder with tags, notes and palettes) in one .zip file.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { unzipSync, zipSync, type Zippable } from 'fflate'

const SKIP = new Set(['.DS_Store'])
/** Already-compressed formats are stored as they are; zipping them again only costs time. */
const STORED = /\.(png|jpe?g|gif|webp)$/i

export interface BackupResult {
  files: number
  bytes: number
}

async function listFiles(root: string, rel = ''): Promise<string[]> {
  const out: string[] = []
  for (const entry of await fs.readdir(path.join(root, rel), { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.endsWith('.tmp')) continue
    const child = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...(await listFiles(root, child)))
    else if (entry.isFile()) out.push(child)
  }
  return out
}

/** Zips everything in the library folder. Paths inside the zip use forward slashes. */
export async function createBackup(root: string): Promise<{ zip: Uint8Array } & BackupResult> {
  const files = await listFiles(root)
  const entries: Zippable = {}
  for (const rel of files) {
    const data = new Uint8Array(await fs.readFile(path.join(root, ...rel.split('/'))))
    entries[rel] = [data, { level: STORED.test(rel) ? 0 : 6 }]
  }
  const zip = zipSync(entries)
  return { zip, files: files.length, bytes: zip.byteLength }
}

/** Rejects zip entries that would land outside the destination ("zip slip"). */
function safeTarget(dest: string, name: string): string {
  const target = path.resolve(dest, ...name.split('/'))
  if (name.startsWith('/') || name.includes('\\') || (target !== dest && !target.startsWith(dest + path.sep))) {
    throw new Error(`This backup contains an unsafe path (“${name}”), so it wasn’t restored.`)
  }
  return target
}

/** Unpacks a backup into `dest`, which must be empty or not exist yet. */
export async function restoreBackup(zip: Uint8Array, dest: string): Promise<BackupResult> {
  const root = path.resolve(dest)
  const existing = await fs.readdir(root).catch(() => [] as string[])
  if (existing.some((n) => !SKIP.has(n))) throw new Error('Restore needs an empty folder, so nothing gets overwritten.')
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(zip)
  } catch {
    throw new Error('That file isn’t a readable .zip backup.')
  }
  const names = Object.keys(entries).filter((n) => !n.endsWith('/'))
  // Check every path before writing anything.
  const targets = names.map((n) => safeTarget(root, n))
  let bytes = 0
  for (let i = 0; i < names.length; i++) {
    await fs.mkdir(path.dirname(targets[i]), { recursive: true })
    await fs.writeFile(targets[i], entries[names[i]])
    bytes += entries[names[i]].byteLength
  }
  return { files: names.length, bytes }
}
