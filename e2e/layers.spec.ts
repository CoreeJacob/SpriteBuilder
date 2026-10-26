import { check, test, type App } from './support/app'

const activeName = (app: App) => app.js<string>(`document.querySelector('.layer-row.active .layer-name')?.textContent ?? ''`)
/** Layer rows are listed top layer first. */
const row = (i: number) => `document.querySelectorAll('.layer-row')[${i}]`

test('right-clicking layers: duplicate, add, move, merge, hide, rename and delete', async ({ app }) => {
  await app.newSprite(8)
  await app.rightClick(row(0))
  const one = await app.menuLabels()
  const expected = ['Rename…', 'Duplicate Layer', 'New Layer Above', 'Insert Image Above…', 'Move Up (off)', 'Move Down (off)', 'Merge Down (off)', 'Hide Layer', 'Delete Layer (off)']
  await check('the layer menu has the layer actions (moving, merging and deleting are off for a lone layer)', expected.every((l) => one.includes(l)), one)

  await app.pickMenu('New Layer Above')
  await check('New Layer Above adds one on top', (await app.layerNames()).join() === 'Layer 2,Layer 1', await app.layerNames())
  await app.tool('b')
  await app.click(2, 2) // draw on Layer 2

  await app.rightClick(row(1)) // Layer 1
  await check('right-clicking a layer makes it the current one', (await activeName(app)) === 'Layer 1')
  await app.pickMenu('Duplicate Layer')
  await check('Duplicate Layer copies it just above', (await app.layerNames()).join() === 'Layer 2,Layer 1 copy,Layer 1', await app.layerNames())

  await app.rightClick(row(0)) // Layer 2
  await app.pickMenu('Move Down')
  await check('Move Down moves it below the next layer', (await app.layerNames()).join() === 'Layer 1 copy,Layer 2,Layer 1', await app.layerNames())

  await app.rightClick(row(1)) // Layer 2, with the pixel
  await app.pickMenu('Hide Layer')
  await check('Hide Layer hides its pixels', (await app.px(2, 2)) === 'empty')
  await app.rightClick(row(1))
  await check('…and the menu then offers to show it', (await app.menuLabels()).includes('Show Layer'))
  await app.pickMenu('Show Layer')
  await check('Show Layer brings them back', (await app.px(2, 2)) !== 'empty')

  await app.rightClick(row(1))
  await app.pickMenu('Merge Down')
  await check('Merge Down blends it into the layer below', (await app.layerNames()).join() === 'Layer 1 copy,Layer 1' && (await app.px(2, 2)) !== 'empty', await app.layerNames())

  await app.rightClick(row(0))
  await app.pickMenu('Rename…')
  await app.untilJs(`!!document.querySelector('.layer-name-input')`)
  await app.setInput(`document.querySelector('.layer-name-input')`, 'Outline')
  await app.key('Enter', 'Enter')
  await check('Rename… edits the name in place', (await app.layerNames())[0] === 'Outline', await app.layerNames())

  await app.rightClick(row(0))
  await app.pickMenu('Delete Layer')
  await check('Delete Layer removes it (after asking)', (await app.layerNames()).join() === 'Layer 1', await app.layerNames())
  await app.undo()
  await check('…and undo brings it back', (await app.layerNames()).join() === 'Outline,Layer 1', await app.layerNames())

  await app.rightClick(row(0))
  await app.pickMenu('Insert Image Above…')
  await check('Insert Image Above… opens the image picker', await app.untilJs(`!!document.querySelector('.insert-image-dialog')`))
  await app.key('Escape', 'Escape')
})

test('typing an exact layer opacity, as one undo step', async ({ app }) => {
  const box = `document.querySelector('.opacity-row .adjust-input')`
  const opacity = () => app.js<{ box: string; slider: string; row: string }>(`({ box: ${box}.value, slider: document.querySelector('.opacity-row .slider').value, row: document.querySelector('.layer-row.active')?.textContent ?? '' })`)
  await app.newSprite(8)
  await app.tool('b')
  await app.click(1, 1)

  await app.js(`${box}.focus()`)
  await app.setInput(box, '3') // typed one key at a time…
  await app.setInput(box, '37')
  await app.js(`${box}.blur()`)
  await app.settle()
  const typed = await opacity()
  await check('typing 37 sets the layer to exactly 37%, and the slider follows', typed.box === '37' && typed.slider === '37' && typed.row.includes('37%'), typed)
  await app.undo()
  await check('…and one undo takes the whole edit back to 100%', (await opacity()).box === '100', await opacity())

  await app.js(`${box}.focus()`)
  await app.setInput(box, '10')
  await app.key('Escape', 'Escape')
  await check('Esc puts back the opacity from before typing', (await opacity()).box === '100', await opacity())

  await app.setInput(`document.querySelector('.opacity-row .slider')`, '60')
  await check('the slider still works, and the box follows it', (await opacity()).box === '60', await opacity())
})
