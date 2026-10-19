import { ALT, byText, byTip, check, SHIFT, test, type App } from './support/app'

const filled = async (app: App, cells: Array<[number, number]>) => {
  const out: boolean[] = []
  for (const [x, y] of cells) out.push((await app.px(x, y)) !== 'empty')
  return out
}
const brushLabel = (app: App) => app.js<string>(`document.querySelector('.tool-popover .brush-size')?.textContent ?? ''`)
const openBrushMenu = (app: App) => app.js(`${byTip('.tool-popover .tool', 'Brush')}.click()`).then(() => app.wait(120))
/** A freehand pencil drag through every listed cell, one pointer move per cell. */
async function stroke(app: App, cells: Array<[number, number]>): Promise<void> {
  await app.mouse('mousePressed', app.cell(...cells[0]))
  for (const c of cells.slice(1)) await app.mouse('mouseMoved', app.cell(...c))
  await app.mouse('mouseReleased', app.cell(...cells.at(-1)!))
  await app.wait(80)
}

test('brush sizes and shapes', async ({ app }) => {
  await app.newSprite(16)
  await app.tool('b')
  await check('brush starts at 1px', (await brushLabel(app)) === '1px', await brushLabel(app))
  await app.key(']', 'BracketRight')
  await app.key(']', 'BracketRight')
  await check('] makes the brush bigger', (await brushLabel(app)) === '3px', await brushLabel(app))

  await app.click(5, 5)
  const square = await filled(app, [[4, 4], [6, 6], [5, 5], [3, 5], [7, 5]])
  await check('a 3px square brush paints a 3×3 block', square.join() === 'true,true,true,false,false', square)
  await app.undo()
  await check('one undo takes the whole dab away', !(await filled(app, [[4, 4], [5, 5], [6, 6]])).some(Boolean))

  await openBrushMenu(app)
  await app.js(`${byText('.tool-popover .chip', 'Round')}.click()`)
  await app.js(`document.querySelector('.menu-scrim').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
  await app.wait(80)
  await app.click(5, 5)
  const round = await filled(app, [[5, 4], [4, 5], [5, 5], [4, 4], [6, 6]])
  await check('a 3px round brush paints a plus (no corners)', round.join() === 'true,true,true,false,false', round)

  // A 2px square line is two pixels thick
  await app.key('[', 'BracketLeft')
  await app.tool('l')
  await app.dragCells([2, 10], [10, 10])
  const line = await filled(app, [[2, 10], [11, 10], [2, 11], [10, 11], [2, 12], [12, 10]])
  await check('the line tool uses the brush size too', line.join() === 'true,true,true,true,false,false', line)

  // A 2px eraser rubs out a 2×2 patch
  await app.tool('e')
  await app.click(4, 10)
  const erased = await filled(app, [[4, 10], [5, 11], [3, 10], [6, 10]])
  await check('the eraser uses the brush size', erased.join() === 'false,false,true,true', erased)

  await app.key('[', 'BracketLeft')
  await app.key('[', 'BracketLeft')
  await check('[ stops at 1px', (await brushLabel(app)) === '1px', await brushLabel(app))
  await app.tool('g')
  await check('the brush button hides for tools that don’t use it', (await brushLabel(app)) === '')
})

test('pixel-perfect freehand lines', async ({ app }) => {
  const steps: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3]]
  await app.newSprite(16)
  await app.tool('b')
  await stroke(app, steps)
  await check('without it, a jagged drag leaves the corner pixels', (await filled(app, steps)).every(Boolean))
  await app.undo()

  await openBrushMenu(app)
  await app.js(`document.querySelector('.tool-popover input[type=checkbox]').click()`)
  await app.js(`document.querySelector('.menu-scrim').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
  await app.wait(80)
  await stroke(app, steps)
  const result = await filled(app, steps)
  await check('with it, only the clean diagonal stays', result.join() === 'true,false,true,false,true,false,true', result)
  await app.undo()
  await check('and it undoes as one stroke', !(await filled(app, steps)).some(Boolean))
})

test('flip and rotate, from keys and menus', async ({ app }) => {
  await app.newSprite(16)
  await app.tool('b')
  await app.click(1, 1)
  await app.key('H', 'KeyH', SHIFT)
  await check('⇧H with nothing selected flips the whole layer', (await app.px(1, 1)) === 'empty' && (await app.px(14, 1)) !== 'empty')
  await app.undo()
  await check('one undo flips it back', (await app.px(1, 1)) !== 'empty' && (await app.px(14, 1)) === 'empty')

  // Rotate a selection: an L shape in a 3×2 box
  await app.click(2, 6)
  await app.click(2, 7)
  await app.click(3, 7)
  await app.click(4, 7)
  await app.tool('m')
  await app.dragCells([2, 6], [4, 7])
  await app.key('R', 'KeyR', SHIFT)
  await app.key('Enter', 'Enter')
  await app.key('Escape', 'Escape')
  // The 3×2 box at (2,6) turned right becomes a 2×3 box at (2,5): the L now hangs from the top.
  const turned = await filled(app, [[2, 5], [3, 5], [2, 6], [2, 7], [3, 7], [4, 7]])
  await check('⇧R turns the selection a quarter turn about its centre', turned.join() === 'true,true,true,true,false,false', turned)

  // The toolbox menu (shown with the Select tool) does the same, for the whole layer here
  await app.js(`${byTip('.tool-popover .tool', 'Flip or rotate')}.click()`)
  await app.wait(120)
  const items = await app.js<string[]>(`[...document.querySelectorAll('.tool-popover .dropdown-item')].map(b => b.textContent.trim())`)
  await check('the Select tool’s menu lists flips and turns with their keys', items.length === 4 && items[0].includes('⇧H') && items[3].includes('⌥⇧R'), items)
  await app.js(`${byText('.tool-popover .dropdown-item', 'Flip vertically')}.click()`)
  await app.wait(120)
  await check('Flip vertically from the menu flips the layer top to bottom', (await app.px(1, 14)) !== 'empty' && (await app.px(1, 1)) === 'empty')

  // The app's Edit menu lists them, and its commands reach the Studio
  const editMenu = (await app.main(({ Menu }) => Menu.getApplicationMenu()!.items.find((i) => i.label === 'Edit')!.submenu!.items.map((i) => i.label), null)) as string[]
  await check('Edit menu has Flip and Rotate', ['Flip Horizontally', 'Flip Vertically', 'Rotate 90° Right', 'Rotate 90° Left'].every((l) => editMenu.includes(l)), editMenu)
  await app.main(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('menu:command', 'flipV'), null)
  await app.wait(150)
  await check('Edit ▸ Flip Vertically works in the Studio', (await app.px(1, 1)) !== 'empty' && (await app.px(1, 14)) === 'empty')

  // Typing a capital letter in a text box must not flip anything
  await app.js(`document.querySelector('.layer-row .layer-name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  await app.wait(150)
  await app.key('H', 'KeyH', SHIFT)
  await app.key('Escape', 'Escape')
  await check('⇧H while renaming a layer doesn’t flip the drawing', (await app.px(1, 1)) !== 'empty' && (await app.px(14, 1)) === 'empty')

  // ⌥⇧R turns the other way, and four quarter turns get back to the start
  await app.key('R', 'KeyR', SHIFT | ALT)
  await check('⌥⇧R rotates left', (await app.px(1, 14)) !== 'empty' && (await app.px(1, 1)) === 'empty')
  for (let i = 0; i < 3; i++) await app.key('R', 'KeyR', SHIFT | ALT)
  await check('four turns get back to the start', (await app.px(1, 1)) !== 'empty' && (await app.px(1, 14)) === 'empty')
})

test('the Image Editor flips and turns with the same keys', async ({ app }) => {
  const dims = () => app.js<string>(`document.querySelector('.editor-status span').textContent.trim()`)
  await app.js(`[...document.querySelectorAll('.rail-btn')][2].click()`)
  await app.wait(300)
  await app.js(`${byTip('.picker-grid .card', 'walk-sheet.png')}.click()`)
  await app.wait(600)
  await app.key('R', 'KeyR', SHIFT)
  await check('⇧R turns the image (32×8 → 8×32)', (await dims()) === '8×32 px', await dims())
  await app.main(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('menu:command', 'rotateCCW'), null)
  await app.wait(150)
  await check('Edit ▸ Rotate 90° Left turns it back', (await dims()) === '32×8 px', await dims())
})
