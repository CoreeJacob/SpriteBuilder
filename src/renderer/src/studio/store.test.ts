import { beforeEach, describe, expect, it } from 'vitest'
import { useStudio } from './store'

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
