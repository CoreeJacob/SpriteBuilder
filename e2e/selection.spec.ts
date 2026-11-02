import { ALT, byTip, check, META, SHIFT, test, type App } from './support/app'

/** Which pixels in a rectangle are drawn, as rows of '#' and '.'. */
async function rows(app: App, x0: number, y0: number, x1: number, y1: number): Promise<string[]> {
  const out: string[] = []
  for (let y = y0; y <= y1; y++) {
    let row = ''
    for (let x = x0; x <= x1; x++) row += (await app.px(x, y)) === 'empty' ? '.' : '#'
    out.push(row)
  }
  return out
}

/** Draws a lasso loop through these pixels (the loop closes itself). */
async function lasso(app: App, points: Array<[number, number]>, modifiers = 0): Promise<void> {
  await app.remeasure()
  await app.drag(points.map(([x, y]) => app.cell(x, y)), modifiers)
}

/** Clears the selected pixels, checks the picture, then undoes. */
async function clearAndCheck(app: App, what: string, expected: string[]): Promise<void> {
  await app.key('Backspace', 'Backspace')
  const got = await rows(app, 2, 2, 9, 9)
  await check(what, got.join() === expected.join(), got)
  await app.undo()
}

test('the lasso selects a free shape, which moves, limits drawing and undoes', async ({ app }) => {
  await app.newSprite(16)
  // A filled 8×8 square at 2–9
  await app.tool('r')
  await app.tool('f')
  await app.dragCells([2, 2], [9, 9])
  await app.tool('f')

  await app.tool('q')
  await check('Q picks the lasso', await app.js(`!!document.querySelector('.tool.on[title^="Lasso"]')`))
  await check('…and the flip/rotate/resize menu is there for it too', await app.js(`!!document.querySelector('.tool-popover [title^="Flip, rotate or resize"]')`))

  // Lasso the square's top-left half (a triangle), then drag it down by 7
  await lasso(app, [[2, 2], [9, 2], [2, 9]])
  await app.dragCells([3, 3], [3, 10])
  await app.key('Escape', 'Escape') // put it down
  // The triangle includes its diagonal edge (pixels on the drawn line count), and its last row ends up off the canvas.
  const moved = await rows(app, 2, 2, 9, 15)
  const expected = [
    '........', '.......#', '......##', '.....###', '....####', '...#####', '..######', // what's left of the square
    '########', // the square's last row, plus the triangle's top row moved down onto it
    '#######.', '######..', '#####...', '####....', '###.....', '##......' // the moved triangle
  ]
  await check('dragging inside the lasso moves just that shape', moved.join() === expected.join(), moved)
  await app.undo()
  await check('one undo puts it back', (await rows(app, 2, 2, 9, 9)).every((r) => r === '########'), await rows(app, 2, 2, 9, 9))

  // Drawing stays inside a lasso selection
  await app.tool('e')
  await app.dragCells([0, 0], [15, 15]) // rub out the square, outside the selection too
  await app.undo()
  await app.tool('q')
  await lasso(app, [[2, 2], [9, 2], [2, 9]])
  await app.tool('e')
  await app.dragCells([2, 5], [9, 5]) // an eraser line across the square
  const erased = (await rows(app, 2, 5, 9, 5))[0]
  await check('the eraser only works inside the lasso shape (up to its diagonal)', erased === '.....###', erased)

  // A plain click with the lasso clears the selection
  await app.tool('q')
  await app.click(14, 14)
  await app.tool('e')
  await app.dragCells([2, 8], [9, 8])
  await check('a plain lasso click clears the selection, so drawing works everywhere again', (await rows(app, 2, 8, 9, 8))[0] === '........', await rows(app, 2, 8, 9, 8))
})

test('magic wand, ⇧ to add, ⌥ to take away, and ⌘-drag to copy', async ({ app }) => {
  await app.newSprite(16)
  // An 8×8 red square at 2–9 with a blue middle (4–7), and one slightly different red in its corner at (9, 9)
  await app.tool('r')
  await app.tool('f')
  await app.setColour('#c80000')
  await app.dragCells([2, 2], [9, 9])
  await app.setColour('#0000c8')
  await app.dragCells([4, 4], [7, 7])
  await app.tool('f')
  await app.setColour('#d20a00')
  await app.tool('b')
  await app.click(9, 9)
  const ring = ['........', '........', '..####..', '..####..', '..####..', '..####..', '........', '.......#']

  await app.tool('w')
  await check('W picks the magic wand', await app.js(`!!document.querySelector('.tool.on[title^="Magic wand"]')`))
  const tolerance = byTip('.tool-popover .tool', 'Magic wand tolerance')
  await check('…with its tolerance (starting at 0) next to it', (await app.js<string>(`${tolerance}.textContent`)) === '±0')
  await app.click(2, 2)
  await clearAndCheck(app, 'clicking red selects the red that touches it, at tolerance 0 not the slightly different corner', ring)

  await app.js(`${tolerance}.click()`)
  await app.settle()
  await app.setInput(`document.querySelector('.tool-popover .adjust-input')`, '10')
  await app.closeMenu()
  await check('the tolerance can be typed', (await app.js<string>(`${tolerance}.textContent`)) === '±10')
  await app.click(2, 2)
  await clearAndCheck(app, 'at tolerance 10 the similar red is picked too', ring.slice(0, 7).concat('........'))

  await app.click(2, 2)
  await app.click(5, 5, SHIFT)
  await clearAndCheck(app, '⇧-click adds the blue middle to the selection', Array(8).fill('........'))

  // Dragging inside a wand selection moves it
  await app.click(5, 5)
  await app.dragCells([5, 5], [5, 12])
  await app.key('Escape', 'Escape')
  await check('dragging inside a wand selection moves it', (await app.px(5, 12)) === '#0000c8' && (await app.px(5, 5)) === 'empty', [await app.px(5, 12), await app.px(5, 5)])
  await app.undo()

  // ⌥ takes away, even when the press starts inside the selection
  await app.key('Escape', 'Escape') // deselect, so the next drag makes a new selection instead of moving this one
  await app.tool('m')
  await app.dragCells([2, 2], [9, 9])
  await app.dragCells([2, 2], [5, 9], ALT)
  await clearAndCheck(app, '⌥-dragging a rectangle takes the left half away (so clearing leaves it)', Array(8).fill('####....'))

  // ⇧ adds a second lasso shape
  await app.click(14, 14) // clear the selection
  await app.tool('q')
  await lasso(app, [[2, 2], [3, 2], [3, 3], [2, 3]])
  await lasso(app, [[8, 8], [9, 8], [9, 9], [8, 9]], SHIFT)
  const corners = await (async () => {
    await app.key('Backspace', 'Backspace')
    const got = await rows(app, 2, 2, 9, 9)
    await app.undo()
    return got
  })()
  await check('⇧ with the lasso adds a second shape', corners[0] === '..######' && corners[1] === '..######' && corners[6] === '######..' && corners[7] === '######..', corners)

  // ⌘-drag inside a selection moves a copy and leaves the original
  await app.key('Escape', 'Escape')
  await app.tool('m')
  await app.dragCells([2, 2], [9, 9])
  await app.dragCells([3, 3], [9, 3], META)
  await app.key('Escape', 'Escape')
  await check('⌘-dragging moves a copy, leaving the original where it was', (await app.px(2, 2)) === '#c80000' && (await app.px(15, 2)) === '#c80000' && (await app.px(12, 5)) === '#0000c8', [await app.px(2, 2), await app.px(15, 2), await app.px(12, 5)])
  await app.undo()
  await check('…and one undo takes the copy away', (await app.px(15, 2)) === 'empty' && (await app.px(2, 2)) === '#c80000')
})
