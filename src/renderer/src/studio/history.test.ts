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

describe('History memory budget', () => {
  const sized = () => new History<{ id: number; bytes: number }>(100, 100, (e) => e.bytes)

  it('forgets the oldest steps once the total is over budget', () => {
    const h = sized()
    for (let id = 1; id <= 4; id++) h.push({ id, bytes: 40 })
    expect(h.bytes).toBe(80)
    expect([h.undo()?.id, h.undo()?.id, h.undo()]).toEqual([4, 3, null])
  })

  it('keeps the newest step even when it is bigger than the budget', () => {
    const h = sized()
    h.push({ id: 1, bytes: 10 })
    h.push({ id: 2, bytes: 500 })
    expect(h.undo()?.id).toBe(2)
    expect(h.canUndo).toBe(false)
  })

  it('stops counting redo steps that a new change throws away', () => {
    const h = sized()
    h.push({ id: 1, bytes: 30 })
    h.push({ id: 2, bytes: 30 })
    h.undo()
    expect(h.bytes).toBe(60) // the undone step can still be redone
    h.push({ id: 3, bytes: 5 })
    expect(h.bytes).toBe(35)
  })
})
