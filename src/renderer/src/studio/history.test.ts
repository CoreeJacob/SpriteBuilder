import { describe, expect, it } from 'vitest'
import { History } from './history'

describe('History', () => {
  it('undoes and redoes in order and drops redo after a new push', () => {
    const h = new History<number>(3)
    h.push(1)
    h.push(2)
    expect(h.undo()).toBe(2)
    expect(h.redo()).toBe(2)
    expect(h.undo()).toBe(2)
    h.push(3)
    expect(h.canRedo).toBe(false)
    h.push(4)
    h.push(5)
    // The limit of 3 drops the oldest entry.
    expect([h.undo(), h.undo(), h.undo(), h.undo()]).toEqual([5, 4, 3, null])
  })
})
