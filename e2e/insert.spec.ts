import { byText, byTip, check, test, type App } from './support/app'

const layerNames = (app: App) => app.js<string[]>(`[...document.querySelectorAll('.layer-name')].map(l => l.textContent)`)
const dialogOpen = (app: App) => app.js<boolean>(`!!document.querySelector('.insert-image-dialog')`)
const openInsert = async (app: App) => {
  await app.js(`${byTip('.layer-actions button', 'Insert an image')}.click()`)
  await app.untilJs(`!!document.querySelector('.insert-image-dialog .card')`)
}
/** Picks an image in the Insert dialog and waits for it to land (the dialog closes when it has). */
const choose = async (app: App, name: string) => {
  await app.js(`${byText('.insert-image-dialog .card .card-name', name)}.closest('button').click()`)
  await app.untilJs(`!document.querySelector('.insert-image-dialog')`)
  await app.settle()
}
/** Drops a file on the Studio canvas the way Finder does; returns the hint shown while dragging. */
const dropOnCanvas = (app: App, makeFile: string) =>
  app.js<string | null>(`(async () => {
    const file = await (${makeFile})
    const dt = new DataTransfer(); dt.items.add(file)
    const vp = document.querySelector('.canvas-viewport')
    vp.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    const hint = document.querySelector('.canvas-viewport .drop-overlay')?.textContent ?? null
    vp.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
    return hint })()`)

test('insert a library image or a dropped file as a new layer', async ({ app }) => {
  await app.newSprite(16)
  await openInsert(app)
  await check('dialog opens with library images', (await app.js(`document.querySelectorAll('.insert-image-dialog .card').length`)) > 3)
  await app.setInput(`document.querySelector('.insert-image-dialog .search input')`, 'knight')
  const found = await app.js(`[...document.querySelectorAll('.insert-image-dialog .card-name')].map(c => c.textContent).join()`)
  await check('search narrows the list', found === 'knight.png', found)
  await choose(app, 'knight')
  await check('dialog closes after choosing', !(await dialogOpen(app)))
  await check('new layer named after the image, on top', (await layerNames(app)).join() === 'knight,Layer 1', await layerNames(app))
  await check('new layer is the active one', (await app.js(`document.querySelector('.layer-row.active .layer-name').textContent`)) === 'knight')
  await check('select tool is on', await app.js(`!!document.querySelector('.tool.on[title^="Select"]')`))

  // The knight is 8×8, so on a 16×16 canvas it covers 4–11.
  const filledCells = async (ox: number, oy: number) => {
    let n = 0
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((await app.px(ox + x, oy + y)) !== 'empty') n++
    return n
  }
  const centred = await filledCells(4, 4)
  await check('picture is centred', centred === 48 && (await app.px(0, 0)) === 'empty' && (await app.px(15, 15)) === 'empty', `${centred} filled cells`)

  // Drag it 4 cells up and left
  const before: string[] = []
  for (let x = 4; x < 12; x++) before.push(await app.px(x, 7))
  await app.dragCells([7, 7], [3, 3])
  const after: string[] = []
  for (let x = 0; x < 8; x++) after.push(await app.px(x, 3))
  await check('dragging moves the picture', before.join() === after.join(), `${before} vs ${after}`)
  await app.js(`document.activeElement?.blur(); 1`)
  await app.key('Escape', 'Escape') // put it down
  await app.undo()
  await check('one undo removes the layer and the picture', (await layerNames(app)).join() === 'Layer 1' && (await filledCells(0, 0)) === 0, await layerNames(app))
  await app.redo()
  await check('redo brings both back', (await layerNames(app)).includes('knight') && (await filledCells(0, 0)) === centred)

  // A big image: full size, then scaled down to fit
  await openInsert(app)
  await choose(app, 'big-photo')
  await check('600×400 photo kept full size hangs off the canvas', (await layerNames(app))[0] === 'big-photo' && (await app.px(0, 0)) !== 'empty' && (await app.px(15, 15)) !== 'empty')
  await app.undo()
  await openInsert(app)
  await app.js(`document.querySelector('.insert-image-dialog input[type=checkbox]').click()`)
  await app.settle()
  await check('fit option shows the canvas size', (await app.js<string>(`document.querySelector('.insert-image-dialog .check').textContent`)).includes('16×16'))
  await choose(app, 'big-photo')
  // 600×400 → 16×11, centred on rows 2–12 (the knight sits at the top-left, columns 0–7)
  await check(
    'scaled to fit: full width, letterboxed',
    (await app.px(0, 12)) !== 'empty' && (await app.px(15, 12)) !== 'empty' && (await app.px(15, 2)) !== 'empty' && (await app.px(15, 1)) === 'empty' && (await app.px(0, 13)) === 'empty'
  )
  await app.undo()

  await openInsert(app)
  await app.key('Escape', 'Escape')
  await check('Escape closes the dialog without changes', !(await dialogOpen(app)) && (await layerNames(app)).length === 2)

  // Finder-style drops on the canvas
  const hint = await dropOnCanvas(
    app,
    `(async () => { const c = document.createElement('canvas'); c.width = 2; c.height = 2; const g = c.getContext('2d'); g.fillStyle = '#0000ff'; g.fillRect(0, 0, 2, 2)
      return new File([await new Promise(r => c.toBlob(r, 'image/png'))], 'laser.png', { type: 'image/png' }) })()`
  )
  await check('dragging a file over the canvas shows the drop hint', hint === 'Drop to add as a new layer', hint)
  await app.until(async () => (await layerNames(app))[0] === 'laser')
  await app.settle()
  await check(
    'dropped file lands as its own layer, centred',
    (await layerNames(app))[0] === 'laser' && (await app.px(7, 7)) === '#0000ff' && (await app.px(8, 8)) === '#0000ff' && (await app.px(9, 9)) === 'empty'
  )
  await dropOnCanvas(app, `new File(['hi'], 'notes.txt', { type: 'text/plain' })`)
  await check('non-image drop is refused with a message', (await app.toast('Only image files')).includes('Only image files') && (await layerNames(app)).length === 3)
})

test('the Image Editor picker shares the same chooser', async ({ app }) => {
  await app.goTo('Image Editor')
  await app.setInput(`document.querySelector('.editor-picker .search input')`, 'grass')
  const found = await app.js(`[...document.querySelectorAll('.editor-picker .card-name')].map(c => c.textContent).join()`)
  await check('Editor picker search works', found === 'grass.png', found)
  await app.js(`${byText('.editor-picker .card-name', 'grass')}.closest('button').click()`)
  await check('Editor picker opens the image', await app.untilJs(`!!document.querySelector('.editor-canvas')`))
})
