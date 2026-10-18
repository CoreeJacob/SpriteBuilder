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

describe('insert image as layer', () => {
  beforeEach(() => useStudio.getState().newDoc(4, 4))
  const red = { w: 2, h: 2, pixels: new Uint8ClampedArray(16).fill(255) }

  it('adds a named layer above the current one with the picture centred and movable', () => {
    const bottom = useStudio.getState().layerId
    useStudio.getState().insertImage(red, 'ship')
    const s = useStudio.getState()
    expect(s.doc!.layers.map((l) => l.name)).toEqual(['Layer 1', 'ship'])
    expect(s.layerId).toBe(s.doc!.layers[1].id)
    expect(s.layerId).not.toBe(bottom)
    expect(s.tool).toBe('select')
    expect(s.floating).toMatchObject({ x: 1, y: 1, w: 2, h: 2 })
  })

  it('is one undo step once the picture is placed', () => {
    useStudio.getState().insertImage(red, 'ship')
    useStudio.getState().moveFloating(0, 0)
    useStudio.getState().commitFloating()
    const placed = useStudio.getState()
    expect(Array.from(placed.doc!.frames[0].cels[placed.layerId].slice(0, 4))).toEqual([255, 255, 255, 255])

    placed.undo()
    expect(useStudio.getState().doc!.layers.map((l) => l.name)).toEqual(['Layer 1'])
    expect(useStudio.getState().canUndo).toBe(false)

    useStudio.getState().redo()
    const redone = useStudio.getState()
    expect(redone.doc!.layers.map((l) => l.name)).toEqual(['Layer 1', 'ship'])
    expect(redone.doc!.frames[0].cels[redone.layerId][0]).toBe(255)
  })

  it('pictures bigger than the canvas hang off the edges until moved', () => {
    useStudio.getState().insertImage({ w: 6, h: 6, pixels: new Uint8ClampedArray(144) }, 'big')
    expect(useStudio.getState().floating).toMatchObject({ x: -1, y: -1, w: 6, h: 6 })
  })
})
