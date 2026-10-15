import { beforeEach, describe, expect, it } from 'vitest'
import { cloneState } from './layers'
import { createDoc } from './model'
import { sameState, useStudio } from './store'

describe('change detection for undo', () => {
  it('notices frame timing and order changes, not just pixels', () => {
    const doc = createDoc(1, 1)
    const before = cloneState(doc)
    doc.frames[0].duration = 50
    expect(sameState(before, cloneState(doc))).toBe(false)
  })
})

describe('studio frame actions', () => {
  beforeEach(() => useStudio.getState().newDoc(2, 2))

  it('FPS changes redraw and can be undone', () => {
    const s = useStudio.getState()
    s.addFrame()
    const version = useStudio.getState().version
    useStudio.getState().setFps(12)
    const after = useStudio.getState()
    expect(after.doc!.frames.map((f) => f.duration)).toEqual([83, 83])
    expect(after.version).toBeGreaterThan(version)
    expect(after.canUndo).toBe(true)
    after.undo()
    expect(useStudio.getState().doc!.frames.map((f) => f.duration)).toEqual([100, 100])
  })

  it('a single frame duration change is undoable', () => {
    useStudio.getState().setFrameDuration(0, 250)
    expect(useStudio.getState().doc!.frames[0].duration).toBe(250)
    useStudio.getState().undo()
    expect(useStudio.getState().doc!.frames[0].duration).toBe(100)
  })
})
