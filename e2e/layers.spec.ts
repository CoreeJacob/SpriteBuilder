import { check, menuItem, test, type App } from './support/app'

const names = (app: App) => app.js<string[]>(`[...document.querySelectorAll('.layer-name')].map(l => l.textContent)`)
const activeName = (app: App) => app.js<string>(`document.querySelector('.layer-row.active .layer-name')?.textContent ?? ''`)
const labels = (app: App) =>
  app.js<string[]>(`[...document.querySelectorAll('.context-menu .menu-item')].map(b => b.querySelector('.menu-label').textContent + (b.disabled ? ' (off)' : ''))`)
/** Layer rows are listed top layer first. */
const row = (i: number) => `document.querySelectorAll('.layer-row')[${i}]`
const pick = (app: App, label: string) => app.js(`${menuItem(label)}.click()`).then(() => app.settle())

test('right-clicking layers: duplicate, add, move, merge, hide, rename and delete', async ({ app }) => {
  await app.newSprite(8)
  await app.rightClick(row(0))
  const one = await labels(app)
  const expected = ['Rename…', 'Duplicate Layer', 'New Layer Above', 'Insert Image Above…', 'Move Up (off)', 'Move Down (off)', 'Merge Down (off)', 'Hide Layer', 'Delete Layer (off)']
  await check('the layer menu has the layer actions (moving, merging and deleting are off for a lone layer)', expected.every((l) => one.includes(l)), one)

  await pick(app, 'New Layer Above')
  await check('New Layer Above adds one on top', (await names(app)).join() === 'Layer 2,Layer 1', await names(app))
  await app.tool('b')
  await app.click(2, 2) // draw on Layer 2

  await app.rightClick(row(1)) // Layer 1
  await check('right-clicking a layer makes it the current one', (await activeName(app)) === 'Layer 1')
  await pick(app, 'Duplicate Layer')
  await check('Duplicate Layer copies it just above', (await names(app)).join() === 'Layer 2,Layer 1 copy,Layer 1', await names(app))

  await app.rightClick(row(0)) // Layer 2
  await pick(app, 'Move Down')
  await check('Move Down moves it below the next layer', (await names(app)).join() === 'Layer 1 copy,Layer 2,Layer 1', await names(app))

  await app.rightClick(row(1)) // Layer 2, with the pixel
  await pick(app, 'Hide Layer')
  await check('Hide Layer hides its pixels', (await app.px(2, 2)) === 'empty')
  await app.rightClick(row(1))
  await check('…and the menu then offers to show it', (await labels(app)).includes('Show Layer'))
  await pick(app, 'Show Layer')
  await check('Show Layer brings them back', (await app.px(2, 2)) !== 'empty')

  await app.rightClick(row(1))
  await pick(app, 'Merge Down')
  await check('Merge Down blends it into the layer below', (await names(app)).join() === 'Layer 1 copy,Layer 1' && (await app.px(2, 2)) !== 'empty', await names(app))

  await app.rightClick(row(0))
  await pick(app, 'Rename…')
  await app.untilJs(`!!document.querySelector('.layer-name-input')`)
  await app.setInput(`document.querySelector('.layer-name-input')`, 'Outline')
  await app.key('Enter', 'Enter')
  await check('Rename… edits the name in place', (await names(app))[0] === 'Outline', await names(app))

  await app.rightClick(row(0))
  await pick(app, 'Delete Layer')
  await check('Delete Layer removes it (after asking)', (await names(app)).join() === 'Layer 1', await names(app))
  await app.undo()
  await check('…and undo brings it back', (await names(app)).join() === 'Outline,Layer 1', await names(app))

  await app.rightClick(row(0))
  await pick(app, 'Insert Image Above…')
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
