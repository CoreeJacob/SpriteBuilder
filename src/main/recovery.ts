// A single crash-recovery copy of the sprite open in Pixel Studio, kept in the app's
// settings folder and removed whenever the work is saved or deliberately discarded.

import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface RecoveryFile {
  savedAt: number
  /** The renderer's own JSON (sprite plus where it belongs); the main process only stores it. */
  content: string
}

export class Recovery {
  constructor(private readonly dir: string) {}

  private get file(): string {
    return path.join(this.dir, 'studio-autosave.json')
  }

  async write(content: string): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    const data: RecoveryFile = { savedAt: Date.now(), content }
    await fs.writeFile(`${this.file}.tmp`, JSON.stringify(data), 'utf8')
    await fs.rename(`${this.file}.tmp`, this.file)
  }

  async read(): Promise<RecoveryFile | null> {
    try {
      const data = JSON.parse(await fs.readFile(this.file, 'utf8'))
      return typeof data?.content === 'string' && typeof data?.savedAt === 'number' ? data : null
    } catch {
      return null
    }
  }

  async clear(): Promise<void> {
    await fs.rm(this.file, { force: true })
  }
}
