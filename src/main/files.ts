// Small file helpers for the main process.

import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * Writes a file so it is never left half-written: the text goes to a temporary file
 * first, which then replaces the real one in a single step.
 */
export async function writeFileAtomic(file: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(`${file}.tmp`, text, 'utf8')
  await fs.rename(`${file}.tmp`, file)
}

export const exists = (p: string): Promise<boolean> =>
  fs.access(p).then(
    () => true,
    () => false
  )
