import { byTip, check, SHIFT, META, test } from './support/app'

test('drawing tools, mirror, layers, selection and clipboard', async ({ app }) => {
  await app.newSprite(16)

  // Rectangle outline 2,2 → 6,5
  await app.tool('r')
  await app.dragCells([2, 2], [6, 5])
  await check('rect outline: corner drawn', (await app.px(2, 2)) !== 'empty')
  await check('rect outline: edge drawn', (await app.px(4, 5)) !== 'empty')
  await check('rect outline: centre empty', (await app.px(4, 3)) === 'empty')

  // Filled ellipse via the F toggle
  await app.tool('o')
  await app.tool('f')
  await app.dragCells([8, 8], [14, 14])
  await check('filled ellipse: centre filled', (await app.px(11, 11)) !== 'empty')
  await check('filled ellipse: box corner empty', (await app.px(8, 8)) === 'empty')
  await app.tool('f')

  // Line with shift snaps to 45°
  await app.tool('l')
  await app.dragCells([0, 15], [5, 9], SHIFT)
  await check('shift-line snapped diagonal', (await app.px(3, 12)) !== 'empty' && (await app.px(6, 9)) !== 'empty', `(6,9)=${await app.px(6, 9)}`)
  await app.undo()
  await check('undo removed the line', (await app.px(3, 12)) === 'empty')

  // Mirror left↔right with the pencil
  const mirror = `[...document.querySelectorAll('.studio-bar button')].find(b => (b.title || b.dataset.tip || '') === 'Mirror left ↔ right')`
  await app.js(`${mirror}.click()`)
  await app.tool('b')
  await app.click(1, 0)
  await check('mirror: original pixel', (await app.px(1, 0)) !== 'empty')
  await check('mirror: mirrored pixel at x=14', (await app.px(14, 0)) !== 'empty')
  await app.js(`${mirror}.click()`)

  // Layers: add, draw, hide, merge, undo
  const layerBtn = (label: string) => app.js(`${byTip('.layer-actions button', label)}.click()`).then(() => app.settle())
  const layerCount = () => app.js<number>(`document.querySelectorAll('.layer-row').length`)
  await layerBtn('New layer above this one')
  await check('two layers after add', (await layerCount()) === 2)
  await app.click(10, 2)
  await check('drew on new layer', (await app.px(10, 2)) !== 'empty')
  await app.js(`document.querySelector('.layer-row.active .eye').click()`)
  await app.settle()
  await check('hiding the layer hides its pixels', (await app.px(10, 2)) === 'empty')
  await app.js(`document.querySelector('.layer-row.active .eye').click()`)
  await app.settle()
  await layerBtn('Merge into the layer below')
  await check('merge down leaves one layer', (await layerCount()) === 1)
  await check('merged pixel still visible', (await app.px(10, 2)) !== 'empty')
  await app.undo()
  await check('undo brings the layer back', (await layerCount()) === 2)

  // Selection: select the rectangle and drag it 8 to the right
  await app.js(`document.querySelectorAll('.layer-row')[1].click()`) // bottom layer (the list is top-first)
  await app.tool('m')
  await app.dragCells([2, 2], [6, 5])
  await app.dragCells([3, 3], [11, 3])
  await check('moved: old corner now empty', (await app.px(2, 2)) === 'empty')
  await check('moved: far corner drawn at (14,5)', (await app.px(14, 5)) !== 'empty')
  await check('moved: hollow centre stays empty', (await app.px(12, 3)) === 'empty')
  await app.key('Escape', 'Escape')
  await app.undo()
  await check('undo puts the rectangle back', (await app.px(2, 2)) !== 'empty')

  // Copy and paste through clipboard events (what the Edit menu sends)
  await app.dragCells([2, 2], [6, 5])
  await app.js(`document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: new DataTransfer(), bubbles: true }))`)
  await app.js(`document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: new DataTransfer(), bubbles: true }))`)
  await app.settle()
  await app.dragCells([3, 3], [3, 10])
  await app.key('Enter', 'Enter')
  await app.key('Escape', 'Escape')
  await check('paste: copy placed lower down', (await app.px(2, 9)) !== 'empty')
  await check('paste: original still there', (await app.px(2, 2)) !== 'empty')

  // A selection limits where drawing lands
  await app.dragCells([0, 0], [3, 3])
  await app.tool('b')
  await app.dragCells([0, 7], [6, 7])
  await check('drawing outside selection is blocked', (await app.px(1, 7)) === 'empty')
  await app.click(1, 1)
  await check('drawing inside selection works', (await app.px(1, 1)) !== 'empty')
  await app.key('d', 'KeyD', META)

  // Select All (what ⌘A sends from the menu), then delete
  await app.js(`window.dispatchEvent(new Event('studio:selectAll'))`)
  await app.settle()
  await app.key('Backspace', 'Backspace')
  await check('select all + delete clears the layer', (await app.px(2, 2)) === 'empty')
})
