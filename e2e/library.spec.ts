import path from 'node:path'
import { byText, check, sidebar, test, W, type App } from './support/app'

const studioState = (app: App) =>
  app.js<{ open: boolean; name: string | null; unsaved: boolean }>(
    `({ open: !!document.querySelector('.pixel-canvas'), name: document.querySelector('.doc-name')?.textContent ?? null, unsaved: (document.querySelector('.doc-title .muted')?.textContent ?? '').includes('not saved yet') })`
  )

/** Double-clicks a library image, which opens it in Pixel Studio. */
const openInStudio = (app: App, file: string) =>
  app.js(`(async () => { ${W} ;[...document.querySelectorAll('.rail-btn')][0].click(); await w(200); ${sidebar('All Images')}.click(); await w(200)
    const it = [...document.querySelectorAll('.card, .list tbody tr')].find(c => (c.getAttribute('title') || c.dataset.tip || c.textContent).includes(${JSON.stringify(file)}))
    it.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await w(700); return 1 })()`)

/** Drags one sidebar folder onto another; returns whether the drop was allowed. */
const dragFolder = (app: App, from: string, to: string, drop = true) =>
  app.js<boolean>(`(() => { const from = ${sidebar(from)}; const to = ${sidebar(to)}; const dt = new DataTransfer()
    from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }); to.dispatchEvent(over)
    if (${drop}) to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); return over.defaultPrevented })()`)

test('an open sprite follows renames and deletes made in the Library', async ({ app }) => {
  await app.importCopy('Tiles/grass.png', 'doomed.png')
  await openInStudio(app, 'doomed.png')
  await check('doomed.png open in Studio', (await studioState(app)).name?.startsWith('doomed'))
  await app.js(`window.api.renameItem('doomed.png', 'renamed')`)
  await app.wait(500)
  await check('Studio follows a rename made in the Library', (await studioState(app)).name?.startsWith('renamed'), (await studioState(app)).name)
  await app.js(`window.api.deleteItems(['renamed.png'])`)
  await app.wait(600)
  await check('deleting it closes the clean sprite in Studio', !(await studioState(app)).open)
  await check('…and says so', (await app.toasts()).includes('was deleted, so it was closed'), await app.toasts())

  await app.importCopy('Tiles/grass.png', 'doomed2.png')
  await openInStudio(app, 'doomed2.png')
  await app.js(`[...document.querySelectorAll('.rail-btn')][1].click()`)
  await app.wait(200)
  await app.regeo(16)
  // Pick a colour that differs from the image, so the click really changes a pixel.
  await app.js(`(() => { const i = document.querySelector('.swatch-big.primary input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '#ff0000'); i.dispatchEvent(new Event('input', { bubbles: true })); return 1 })()`)
  await app.tool('b')
  await app.click(0, 0)
  await app.js(`window.api.deleteItems(['doomed2.png'])`)
  await app.wait(600)
  const kept = await studioState(app)
  await check('with unsaved changes the work stays open', kept.open)
  await check('…and it now shows as not saved (Save will ask for a name)', kept.unsaved)

  // Save into another folder, then Save As into a brand-new folder
  await app.js(`(async () => { ${W} ${byText('.studio-bar .btn', 'Save')}.click(); await w(300); return 1 })()`)
  const options = await app.js<string[]>(`[...document.querySelectorAll('.modal select option')].map(o => o.textContent.trim())`)
  await check('save dialog offers a folder picker', options.includes('Tiles') && options.at(-1) === 'New folder…', options)
  await app.js(`(async () => { ${W} const s = document.querySelector('.modal select'); s.value = 'Tiles'; s.dispatchEvent(new Event('change', { bubbles: true })); await w(80)
    const i = document.querySelector('.modal input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'saved-in-tiles'); i.dispatchEvent(new Event('input', { bubbles: true })); await w(80)
    document.querySelector('.modal button[type=submit]').click(); await w(900); return 1 })()`)
  await check('saved into the chosen folder', await app.has('Tiles/saved-in-tiles.png'))
  await app.js(`(async () => { ${W} ${byText('.studio-bar .btn', 'Save As')}.click(); await w(300)
    const s = document.querySelector('.modal select'); s.value = s.options[s.options.length - 1].value; s.dispatchEvent(new Event('change', { bubbles: true })); await w(120)
    const inputs = document.querySelectorAll('.modal input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(inputs[0], 'in-new-folder'); inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    set.call(inputs[1], 'Brand New'); inputs[1].dispatchEvent(new Event('input', { bubbles: true })); await w(100)
    document.querySelector('.modal button[type=submit]').click(); await w(1200); return 1 })()`)
  await check('Save As can create a new folder and save into it', await app.has('Tiles/Brand New/in-new-folder.png'))
})

test('folders: drag into another folder, and Finder drops', async ({ app }) => {
  await app.js(`(async () => { ${W} ;[...document.querySelectorAll('.rail-btn')][0].click(); await w(300); ${sidebar('Enemies')}.click(); await w(200); return 1 })()`)
  await dragFolder(app, 'Enemies', 'Heroes')
  await app.wait(700)
  const folders = (await app.library()).folders
  await check('folder dragged into another folder', !folders.includes('Test Folder/Enemies') && folders.includes('Heroes/Enemies'), folders)
  await check('images moved with it', await app.has('Heroes/Enemies/bat.png'))
  await check('the open folder view followed the move', (await app.js(`document.querySelector('.lib-header h1').textContent`)) === 'Enemies')
  await check('a folder can’t be dropped inside itself', !(await dragFolder(app, 'Heroes', 'Enemies', false)))

  // A real file drop from "Finder" onto a sidebar folder
  const [x, y] = await app.centre(sidebar('Tiles'))
  const file = path.join(app.dirs.outside, 'from-finder.png')
  for (const type of ['dragEnter', 'dragOver', 'drop']) {
    await app.call('Input.dispatchDragEvent', { type, x, y, data: { items: [], files: [file], dragOperationsMask: 1 } })
  }
  await app.wait(800)
  await check('dropping a Finder file on a sidebar folder imports it there', await app.has('Tiles/from-finder.png'))
})

test('the Library preview plays a sprite’s frames', async ({ app }) => {
  await app.newSprite(8)
  await app.tool('b')
  await app.click(1, 1)
  await app.js(`[...document.querySelectorAll('.timeline button')].find(b => (b.getAttribute('title') || b.dataset.tip || '').startsWith('New empty frame')).click()`)
  await app.wait(150)
  await app.click(6, 6)
  await app.js(`${byText('.studio-bar .btn', 'Save')}.click()`)
  await app.answer('blinker')
  await app.wait(300)
  const frames = await app.js<{ distinct: number; whilePaused: number } | string>(`(async () => { ${W} ;[...document.querySelectorAll('.rail-btn')][0].click(); await w(300); ${sidebar('All Images')}.click(); await w(200)
    const it = [...document.querySelectorAll('.card, .list tbody tr')].find(c => (c.getAttribute('title') || c.dataset.tip || c.textContent).includes('blinker.png'))
    it.click(); await w(700)
    const c = document.querySelector('.sprite-animation'); if (!c) return 'no animation canvas'
    const seen = new Set(); for (let k = 0; k < 8; k++) { seen.add(c.toDataURL()); await w(70) }
    ;[...document.querySelectorAll('.preview-controls .chip')].find(b => b.textContent.includes('Pause')).click(); await w(50)
    const still = new Set(); for (let k = 0; k < 5; k++) { still.add(c.toDataURL()); await w(70) }
    return { distinct: seen.size, whilePaused: still.size } })()`)
  await check('Library preview plays the sprite’s frames', typeof frames === 'object' && frames.distinct === 2, frames)
  await check('Pause stops it', typeof frames === 'object' && frames.whilePaused === 1, frames)
})
