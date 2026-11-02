import { check, test, type App } from './support/app'

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
async function lasso(app: App, points: Array<[number, number]>): Promise<void> {
  await app.remeasure()
  await app.drag(points.map(([x, y]) => app.cell(x, y)))
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
