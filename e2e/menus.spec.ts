import { card, check, META, menuItem, sidebar, test, type App } from './support/app'

const menuLabels = (app: App) =>
  app.js<string[]>(
    `[...document.querySelectorAll('.context-menu:not(.submenu) > .menu-item-wrap > .menu-item')].map(b => b.querySelector('.menu-label').textContent + (b.disabled ? ' (off)' : ''))`
  )
const menuOpen = (app: App) => app.js<boolean>(`!!document.querySelector('.context-menu')`)

test('right-click menus in the Library', async ({ app }) => {
  await app.importCopy('Tiles/grass.png', 'menu-test.png')
  await app.showAll('menu-test.png')

  await app.rightClick(card('menu-test.png'))
  await check('right-click selects that image', (await app.js(`document.querySelector('.card.selected .card-name')?.textContent`)) === 'menu-test.png')
  const single = await menuLabels(app)
  const expected = ['Open in Pixel Studio', 'Edit Image', 'Rename…', 'Duplicate', 'Add to Favourites', 'Move to', 'Copy Image', 'Show in Finder', 'Export…', 'Move to Trash']
  await check('single-image menu has all the actions', expected.every((l) => single.includes(l)), single.join(' · '))

  await app.js(`${menuItem('Rename…')}.click()`)
  await app.answer('menu-renamed')
  await check('Rename… renames the file', await app.waitForItem('menu-renamed.png'))
  await app.untilJs(`!!${card('menu-renamed.png')}`)

  await app.rightClick(card('menu-renamed.png'))
  await app.js(`${menuItem('Duplicate')}.click()`)
  await check('Duplicate makes a copy', await app.waitForItem('menu-renamed 2.png'))

  await app.rightClick(card('menu-renamed.png'))
  await app.js(`${menuItem('Add to Favourites')}.click()`)
  const favourite = async () => (await app.library()).items.find((i) => i.path === 'menu-renamed.png')?.favorite === true
  await check('Add to Favourites works', await app.until(favourite))

  // Move to ▸ Tiles: hover to open the sub-menu, then click
  await app.rightClick(card('menu-renamed.png'))
  await app.hover(...(await app.centre(menuItem('Move to'))))
  await app.untilJs(`!!document.querySelector('.context-menu.submenu')`)
  const sub = await app.js<string[]>(`[...document.querySelectorAll('.context-menu.submenu .menu-label')].map(l => l.textContent.trim())`)
  await check('Move to opens a folder list', sub.includes('Library') && sub.includes('Tiles'), sub)
  const [tx, ty] = await app.centre(`[...document.querySelectorAll('.context-menu.submenu .menu-item')].find(b => b.textContent.trim() === 'Tiles')`)
  await app.hover(tx, ty)
  await app.clickAt(tx, ty)
  await check('…and moves the image there', await app.waitForItem('Tiles/menu-renamed.png'))

  await app.rightClick(card('menu-renamed 2.png'))
  await app.js(`${menuItem('Copy Image')}.click()`)
  const copied = await app.toast('Copied menu-renamed 2.png')
  await check('Copy Image confirms', copied.includes('Copied menu-renamed 2.png'), copied)

  // Multi-select: ⌘-click two, then right-click inside the selection
  await app.js(`window.api.importData('', [{ name: 'multi-a.png', data: new Uint8Array(1) }, { name: 'multi-b.png', data: new Uint8Array(1) }])`)
  await app.showAll('multi-b.png')
  await app.clickAt(...(await app.centre(card('multi-a.png'))))
  const [bx, by] = await app.centre(card('multi-b.png'))
  await app.clickAt(bx, by, 'left', META)
  await app.clickAt(bx, by, 'right')
  const multi = await menuLabels(app)
  await check('multi-select menu acts on both', multi.includes('Move 2 Items to') && multi.includes('Move 2 Items to Trash'), multi.join(' · '))
  await check('right-clicking inside the selection keeps it', (await app.js(`document.querySelectorAll('.card.selected').length`)) === 2)
  await app.js(`${menuItem('Move 2 Items to Trash')}.click()`)
  const gone = (await app.waitForItem('multi-a.png', false)) && (await app.waitForItem('multi-b.png', false))
  await check('Move 2 Items to Trash deletes both', gone)

  // Escape closes it; a menu opened in the bottom-right corner stays on screen
  await app.rightClick(card('menu-renamed 2.png'))
  await app.key('Escape', 'Escape')
  await check('Escape closes the menu', !(await menuOpen(app)))
  const [w, h] = await app.js<[number, number]>(`[innerWidth, innerHeight]`)
  await app.js(`${card('menu-renamed 2.png')}.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: ${w - 5}, clientY: ${h - 5} }))`)
  await app.settle()
  const box = await app.js<number[]>(`(() => { const r = document.querySelector('.context-menu').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom] })()`)
  await check('menu opened at the corner stays inside the window', box[2] <= w && box[3] <= h && box[0] >= 0 && box[1] >= 0, box.map(Math.round))
  await app.clickAt(30, 30)
  await check('clicking elsewhere closes it', !(await menuOpen(app)))

  // Sidebar folders use the same menu
  await app.rightClick(sidebar('Tiles'))
  const folderMenu = await menuLabels(app)
  await check('folder menu: New Folder, Rename, Show in Finder, Trash', ['New Folder Inside…', 'Rename…', 'Show in Finder', 'Move to Trash'].every((l) => folderMenu.includes(l)), folderMenu.join(' · '))
})
