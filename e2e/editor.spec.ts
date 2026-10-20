import { byText, byTip, check, test } from './support/app'

test('Image Editor: transform, adjust, colours, slice, crop, resize and save', async ({ app }) => {
  const dims = () => app.editorSize()
  // A pixel of the editor canvas, in image coordinates.
  const epx = (x: number, y: number) =>
    app.js<string>(`(() => { const d = document.querySelector('.editor-canvas').getContext('2d').getImageData(${x}, ${y}, 1, 1).data; return d[3] === 0 ? 'clear' : '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('') })()`)
  const openSection = (title: string) =>
    app.js(`(() => { const b = ${byText('.section-toggle', title)}; if (!b.closest('.panel-section').classList.contains('open')) b.click(); return 1 })()`)
  const button = (text: string) => app.js(`${byText('.editor-panel .btn', text)}.click()`)
  const tip = (text: string) => app.js(`${byTip('.editor-panel button', text)}.click()`)

  // Tag the sheet so we can check that saving keeps its details.
  await app.js(`window.api.updateMeta(['walk-sheet.png'], { tags: ['hero'] })`)

  // Open through the Editor tab's picker
  await app.openInEditor('walk-sheet.png')
  const opened = await app.js<string>(`document.querySelector('.doc-name')?.textContent`)
  await check('picker opens the image', (opened ?? '').startsWith('walk-sheet'), opened)
  await check('size shown 32×8', (await dims()) === '32×8 px')

  // Rotate, then undo
  await tip('Rotate 90° right')
  await app.settle()
  await check('rotate right → 8×32', (await dims()) === '8×32 px')
  await app.undo()
  await check('undo → 32×8 again', (await dims()) === '32×8 px')

  // Invert previews live; Reset puts it back
  await app.js(`[...document.querySelectorAll('.editor-panel .check')].find(l => l.textContent.includes('Invert')).querySelector('input').click()`)
  await app.settle()
  await check('invert previews live (white → black)', (await epx(0, 0)) === '#000000')
  await button('Reset')
  await app.settle()
  await check('reset restores white', (await epx(0, 0)) === '#ffffff')

  // Remove background
  await openSection('Colours')
  await button('Remove background')
  await app.settle()
  await check('background removed (corner clear)', (await epx(0, 0)) === 'clear')
  await check('sprite pixels kept (red)', (await epx(3, 3)) === '#ff0000')

  // Slice into 8×8 cells: the empty one is skipped, leaving 3 frames
  await openSection('Slice')
  const field = (label: string) => `[...document.querySelectorAll('.editor-panel .field')].find(f => f.textContent.includes('${label}')).querySelector('input')`
  await app.setInput(field('Cell width'), '8')
  await app.setInput(field('Cell height'), '8')
  const sliceInfo = await app.js<string>(`[...document.querySelectorAll('.editor-panel .small.muted')].map(p => p.textContent).find(t => /frame/.test(t))`)
  await check('slice: empty cell skipped → 3 frames of 8×8', sliceInfo === '3 frames of 8×8', sliceInfo)
  await button('Show grid')
  await app.settle()
  await check('slice grid drawn', (await app.js(`document.querySelectorAll('.slice-cell').length`)) === 3)
  await button('Open as animation')
  await check('Pixel Studio gets 3 frames', (await app.untilJs(`document.querySelectorAll('.frame-cell').length === 3`)))
  await check('Studio canvas is 8×8', (await app.docInfo()) === '8×8')

  // Back to the editor: slice into PNG files
  await app.goTo('Image Editor')
  await button('Save frames as PNG')
  await app.answer('walk frames')
  const inFolder = async () => (await app.library()).items.filter((i) => i.folder === 'walk frames').map((i) => i.name)
  await app.until(async () => (await inFolder()).length === 3)
  const frameFiles = await inFolder()
  await check('frames saved as 3 PNGs in a new folder', frameFiles.length === 3, frameFiles.join(', '))

  // Crop by dragging on the canvas
  await button('Show grid')
  await openSection('Transform')
  await tip('Drag on the image')
  await app.settle()
  const box = await app.js<{ x: number; y: number; s: number }>(`(() => { const r = document.querySelector('.editor-canvas').getBoundingClientRect(); return { x: r.x, y: r.y, s: r.width / 32 } })()`)
  const at = (x: number, y: number): [number, number] => [box.x + (x + 0.5) * box.s, box.y + (y + 0.5) * box.s]
  await app.mouse('mousePressed', at(0, 0))
  await app.mouse('mouseMoved', at(4, 4))
  await app.mouse('mouseMoved', at(7, 7))
  await app.mouse('mouseReleased', at(7, 7))
  await app.settle()
  await check('crop label shows 8×8', (await app.js(`document.querySelector('.crop-label')?.textContent`)) === '8×8')
  await app.key('Enter', 'Enter')
  await app.settle()
  await check('Enter applies the crop → 8×8', (await dims()) === '8×8 px')

  // Resize 4×, then magic-erase the red square
  await app.js(`${byText('.editor-panel .chip', '4×')}.click()`)
  await app.settle()
  await check('4× pixel-perfect resize → 32×32', (await dims()) === '32×32 px')
  await check('resize kept hard edges (red at 8,8)', (await epx(8, 8)) === '#ff0000')
  await openSection('Colours')
  await button('Magic eraser')
  await app.settle()
  const box2 = await app.js<{ x: number; y: number; s: number }>(`(() => { const r = document.querySelector('.editor-canvas').getBoundingClientRect(); return { x: r.x, y: r.y, s: r.width / 32 } })()`)
  await app.mouse('mousePressed', [box2.x + 12 * box2.s, box2.y + 12 * box2.s])
  await app.mouse('mouseReleased', [box2.x + 12 * box2.s, box2.y + 12 * box2.s])
  await app.settle()
  await check('magic eraser cleared the red square', (await epx(12, 12)) === 'clear')
  await app.undo()
  await check('undo brings it back', (await epx(12, 12)) === '#ff0000')

  // Save as a copy
  await app.key('Escape', 'Escape')
  await app.js(`${byText('.studio-bar .btn', 'Save as Copy')}.click()`)
  await app.answer('walk-red')
  await app.untilJs(`document.querySelector('.doc-name')?.textContent === 'walk-red.png'`)
  await app.waitForItem('walk-red.png')
  const afterCopy = await app.js<{ name: string; dirty: boolean }>(`({ name: document.querySelector('.doc-name').textContent, dirty: !!document.querySelector('.doc-name .dot') })`)
  await check('save as copy switches to the copy and is clean', afterCopy.name === 'walk-red.png' && !afterCopy.dirty, afterCopy)
  const copy = (await app.library()).items.find((i) => i.name === 'walk-red.png')
  await check('copy is in the library at 32×32', copy?.width === 32 && copy?.height === 32, copy && [copy.width, copy.height])

  // Overwrite the original sheet: open it again, flip, save
  await app.openInEditor('walk-sheet.png')
  await tip('Flip left')
  await app.settle()
  await app.js(`${byText('.studio-bar .btn', 'Save')}.click()`)
  const redOnTheRight = () => app.js<string>(`(async () => { const img = new Image(); img.crossOrigin = 'anonymous'; img.src = 'sprite://library/walk-sheet.png?v=' + Date.now(); await img.decode(); const c = document.createElement('canvas'); c.width = 32; c.height = 8; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(26, 3, 1, 1).data; return [d[0], d[1], d[2]].join() })()`)
  const flipped = await app.until(async () => (await redOnTheRight()) === '255,0,0' && redOnTheRight())
  const original = (await app.library()).items.find((i) => i.name === 'walk-sheet.png')!
  await check('overwrite save keeps tags', original.tags.join() === 'hero', original.tags)
  await check('saved file is flipped (red now on the right)', flipped === '255,0,0', flipped)
})
