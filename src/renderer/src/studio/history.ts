// A bounded undo/redo stack.

export class History<T> {
  private past: T[] = []
  private future: T[] = []

  constructor(private readonly limit = 200) {}

  push(entry: T): void {
    this.past.push(entry)
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
  }

  /** Returns the entry to undo, or null when there is nothing left. */
  undo(): T | null {
    const entry = this.past.pop()
    if (entry === undefined) return null
    this.future.push(entry)
    return entry
  }

  redo(): T | null {
    const entry = this.future.pop()
    if (entry === undefined) return null
    this.past.push(entry)
    return entry
  }

  clear(): void {
    this.past = []
    this.future = []
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }
}
