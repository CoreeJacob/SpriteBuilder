import { beforeEach, describe, expect, it } from 'vitest'
import { serializeDoc } from './model'
import { undoMemory, useStudio } from './store'

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

describe('undo memory and exactness', () => {
  const state = () => useStudio.getState()
  const saved = () => serializeDoc(state().doc!)

  /** A small seeded random number generator, so a failure can be replayed. */
  const random = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)

  it('a random mix of drawing, layer and frame changes undoes and redoes exactly', () => {
    const rnd = random(7)
    const pick = <T,>(list: T[]): T => list[Math.floor(rnd() * list.length)]
    const draw = () => {
      const s = state()
      const done = s.beginEdit()
      const cel = s.activeCel()!
      for (let k = 0; k < 3; k++) cel.set([pick([0, 90, 255]), pick([0, 90, 255]), 9, 255], Math.floor(rnd() * (cel.length / 4)) * 4)
      done()
    }
    const ops: Array<() => void> = [
      draw,
      draw,
      () => state().addLayer(),
      () => state().duplicateLayer(),
      () => state().deleteLayer(),
      () => state().mergeDown(),
      () => state().moveLayer(pick([1, -1])),
      () => state().addFrame(),
      () => state().duplicateFrame(),
      () => state().deleteFrame(),
      () => state().moveFrame(0, state().doc!.frames.length - 1),
      () => state().setFps(pick([8, 12])),
      () => state().renameLayer(state().layerId, `L${Math.floor(rnd() * 9)}`),
      () => state().toggleLayerVisible(state().layerId),
      () => state().resize(pick([4, 6, 8]), pick([3, 5]), pick(['canvas', 'scale'] as const), [0.5, 0.5]),
      () => (state().turn(pick(['flipH', 'flipV', 'rotateCW'] as const)), state().commitFloating(), state().setSelection(null)),
      () => (state().insertImage({ w: 2, h: 2, pixels: new Uint8ClampedArray(16).fill(200) }, 'pic'), state().commitFloating()),
      () => state().setActiveLayer(pick(state().doc!.layers).id),
      () => state().setFrame(Math.floor(rnd() * state().doc!.frames.length))
    ]

    state().newDoc(6, 5)
    const states = [saved()]
    for (let i = 0; i < 80; i++) {
      pick(ops)()
      const now = saved()
      if (now !== states.at(-1)) states.push(now)
    }
    expect(states.length).toBeGreaterThan(40)

    for (let i = states.length - 2; i >= 0; i--) {
      state().undo()
      expect(saved(), `undo back to step ${i}`).toBe(states[i])
    }
    expect(state().canUndo).toBe(false)
    for (let i = 1; i < states.length; i++) {
      state().redo()
      expect(saved(), `redo to step ${i}`).toBe(states[i])
    }

    // Undo half way, branch off with new changes, then undo everything again.
    for (let i = 0; i < 10; i++) state().undo()
    const branch = [states[states.length - 11]]
    for (let i = 0; i < 20; i++) {
      pick(ops)()
      const now = saved()
      if (now !== branch.at(-1)) branch.push(now)
    }
    for (let i = branch.length - 2; i >= 0; i--) {
      state().undo()
      expect(saved(), `undo the branch back to step ${i}`).toBe(branch[i])
    }
    for (let i = states.length - 12; i >= 0; i--) {
      state().undo()
      expect(saved(), `undo before the branch to step ${i}`).toBe(states[i])
    }
  })

  it('on a big sprite, undo keeps only what each change replaced', () => {
    const MB = 512 * 512 * 4 // one 512×512 layer
    state().newDoc(512, 512)
    for (let i = 0; i < 9; i++) state().addFrame() // 10 frames: each new frame is one new layer buffer
    expect(undoMemory()).toBe(9 * MB)
    for (let i = 0; i < 3; i++) state().addLayer() // a new layer adds a buffer to all 10 frames
    expect(undoMemory()).toBe(39 * MB)
    state().renameLayer(state().layerId, 'Sky') // no pixels change: costs nothing
    expect(undoMemory()).toBe(39 * MB)

    // Drawing a 3×3 dot keeps just those 9 pixels, before and after.
    const done = state().beginEdit()
    const cel = state().activeCel()!
    for (let y = 10; y < 13; y++) for (let x = 10; x < 13; x++) cel.set([255, 0, 0, 255], (y * 512 + x) * 4)
    done()
    expect(undoMemory()).toBe(39 * MB + 2 * 9 * 4)
  })
})

describe('flip and rotate', () => {
  const state = () => useStudio.getState()
  const at = (x: number, y: number) => {
    const s = state()
    return s.activeCel()![(y * s.doc!.width + x) * 4]
  }
  const paint = (x: number, y: number, v = 255) => {
    const s = state()
    const done = s.beginEdit()
    s.activeCel()!.set([v, 0, 0, 255], (y * s.doc!.width + x) * 4)
    done()
  }

  it('with nothing selected, flips the whole layer in one undo step', () => {
    state().newDoc(4, 4)
    paint(0, 1)
    state().turn('flipH')
    expect([at(0, 1), at(3, 1)]).toEqual([0, 255])
    expect(state().floating).toBeNull()
    expect(state().selection).toBeNull()
    state().undo()
    expect([at(0, 1), at(3, 1)]).toEqual([255, 0])
  })

  it('turns a selection about its centre, swapping width and height, and leaves it movable', () => {
    state().newDoc(8, 8)
    paint(2, 3)
    state().setSelection({ x: 2, y: 3, w: 4, h: 2 })
    state().turn('rotateCW')
    expect(state().selection).toEqual({ x: 3, y: 2, w: 2, h: 4 })
    expect(state().tool).toBe('select')
    state().commitFloating()
    // The top-left pixel of the 4×2 block ends up top-right of the 2×4 block.
    expect([at(4, 2), at(2, 3)]).toEqual([255, 0])
  })

  it('a whole non-square layer turned on its side stays lifted, so it can be placed', () => {
    state().newDoc(8, 8)
    state().resize(8, 4, 'canvas', [0, 0])
    state().turn('rotateCW')
    expect(state().floating).toMatchObject({ w: 4, h: 8 })
  })
})

describe('display-only settings', () => {
  it('don’t count as changes to the pixels (no redraw of thumbnails, nothing for autosave)', () => {
    useStudio.getState().newDoc(8, 8)
    const before = useStudio.getState().version
    const s = useStudio.getState()
    s.setBrushSize(4)
    s.setBrushShape('round')
    s.toggleMirrorX()
    s.toggleMirrorY()
    s.toggleOnionSkin()
    s.setSelection({ x: 1, y: 1, w: 3, h: 3 })
    s.setSelection(null)
    expect(useStudio.getState().version).toBe(before)
    expect(useStudio.getState().dirty).toBe(false)
  })
})
