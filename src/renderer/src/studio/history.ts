// A bounded undo/redo stack. It keeps at most `limit` steps and, when entries say how big
// they are, at most `maxBytes` in total: the oldest steps are forgotten first.

export class History<T> {
  private past: T[] = []
  private future: T[] = []
  private total = 0

  constructor(
    private readonly limit = 200,
    private readonly maxBytes = Infinity,
    private readonly sizeOf: (entry: T) => number = () => 0
  ) {}

  push(entry: T): void {
    this.past.push(entry)
    this.total += this.sizeOf(entry)
    for (const dropped of this.future) this.total -= this.sizeOf(dropped)
    this.future = []
    // Always keep the newest step, even if it alone is over the budget.
    while (this.past.length > 1 && (this.past.length > this.limit || this.total > this.maxBytes)) {
      this.total -= this.sizeOf(this.past.shift()!)
    }
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
    this.total = 0
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  /** Memory held by undo and redo steps, as reported by `sizeOf`. */
  get bytes(): number {
    return this.total
  }
}
