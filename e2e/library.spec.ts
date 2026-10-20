import path from 'node:path'
import { byText, card, check, sidebar, test, type App } from './support/app'

const studioState = (app: App) =>
  app.js<{ open: boolean; name: string | null; unsaved: boolean }>(
    `({ open: !!document.querySelector('.pixel-canvas'), name: document.querySelector('.doc-name')?.textContent ?? null, unsaved: (document.querySelector('.doc-title .muted')?.textContent ?? '').includes('not saved yet') })`
  )

/** Double-clicks a library image, which opens it in Pixel Studio. */
async function openInStudio(app: App, file: string): Promise<void> {
  await app.showAll(file)
  await app.dblclick(card(file))
  await app.untilJs(`(document.querySelector('.doc-name')?.textContent ?? '').startsWith(${JSON.stringify(file.replace(/\.png$/, ''))})`)
}

test('an open sprite follows renames and deletes made in the Library', async ({ app }) => {
  const name = async () => (await studioState(app)).name ?? ''
  await app.importCopy('Tiles/grass.png', 'doomed.png')
  await openInStudio(app, 'doomed.png')
  await check('doomed.png open in Studio', (await name()).startsWith('doomed'))
  await app.js(`window.api.renameItem('doomed.png', 'renamed')`)
  await check('Studio follows a rename made in the Library', await app.until(async () => (await name()).startsWith('renamed')), await name())
  await app.js(`window.api.deleteItems(['renamed.png'])`)
  await check('deleting it closes the clean sprite in Studio', await app.until(async () => !(await studioState(app)).open))
  await check('…and says so', (await app.toast('was deleted, so it was closed')).includes('was deleted'), await app.toasts())

  await app.importCopy('Tiles/grass.png', 'doomed2.png')
  await openInStudio(app, 'doomed2.png')
  await app.goTo('Pixel Studio')
  await app.regeo(16)
  await app.setColour('#ff0000') // differs from the image, so the click really changes a pixel
  await app.tool('b')
  await app.click(0, 0)
  await app.js(`window.api.deleteItems(['doomed2.png'])`)
  const kept = await app.until(async () => {
    const s = await studioState(app)
    return s.unsaved && s
  })
  await check('with unsaved changes the work stays open', kept && kept.open)
  await check('…and it now shows as not saved (Save will ask for a name)', !!kept)

  // Save into another folder, then Save As into a brand-new folder
  await app.js(`${byText('.studio-bar .btn', 'Save')}.click()`)
  const options = await app.untilJs<string[]>(`[...document.querySelectorAll('.modal select option')].map(o => o.textContent.trim())`)
  await check('save dialog offers a folder picker', options.includes('Tiles') && options.at(-1) === 'New folder…', options)
  await app.answer('saved-in-tiles', { folder: 'Tiles' })
  await check('saved into the chosen folder', await app.waitForItem('Tiles/saved-in-tiles.png'))
  await app.js(`${byText('.studio-bar .btn', 'Save As')}.click()`)
  await app.answer('in-new-folder', { folder: 'new', newFolder: 'Brand New' })
  await check('Save As can create a new folder and save into it', await app.waitForItem('Tiles/Brand New/in-new-folder.png'))
})

test('folders: drag into another folder, and Finder drops', async ({ app }) => {
  await app.goTo('Library')
  await app.js(`${sidebar('Enemies')}.click()`)
  await app.settle()
  await app.dragDrop(sidebar('Enemies'), sidebar('Heroes'))
  const moved = await app.until(async () => (await app.library()).folders.includes('Heroes/Enemies'))
  const folders = (await app.library()).folders
  await check('folder dragged into another folder', moved && !folders.includes('Test Folder/Enemies'), folders)
  await check('images moved with it', await app.has('Heroes/Enemies/bat.png'))
  await check('the open folder view followed the move', await app.untilJs(`document.querySelector('.lib-header h1')?.textContent === 'Enemies'`))
  await app.untilJs(`!!${sidebar('Enemies')}`)
  await check('a folder can’t be dropped inside itself', !(await app.dragDrop(sidebar('Heroes'), sidebar('Enemies'), { drop: false })))

  // A real file drop from "Finder" onto a sidebar folder
  const [x, y] = await app.centre(sidebar('Tiles'))
  const file = path.join(app.dirs.outside, 'from-finder.png')
  for (const type of ['dragEnter', 'dragOver', 'drop']) {
    await app.call('Input.dispatchDragEvent', { type, x, y, data: { items: [], files: [file], dragOperationsMask: 1 } })
  }
  await check('dropping a Finder file on a sidebar folder imports it there', await app.waitForItem('Tiles/from-finder.png'))
})

test('the Library preview plays a sprite’s frames', async ({ app }) => {
  await app.newSprite(8)
  await app.tool('b')
  await app.click(1, 1)
  await app.addFrame()
  await app.click(6, 6)
  await app.js(`${byText('.studio-bar .btn', 'Save')}.click()`)
  await app.answer('blinker')
  await app.waitForItem('blinker.png')

  await app.showAll('blinker.png')
  await app.js(`${card('blinker.png')}.click()`)
  const preview = () => app.js<string | null>(`document.querySelector('.sprite-animation')?.toDataURL() ?? null`)
  const seen = new Set<string>()
  await app.until(async () => {
    const shot = await preview()
    if (shot) seen.add(shot)
    return seen.size >= 2
  }, 3000)
  await check('Library preview plays the sprite’s frames', seen.size === 2, `${seen.size} different pictures`)

  await app.js(`[...document.querySelectorAll('.preview-controls .chip')].find(b => b.textContent.includes('Pause')).click()`)
  await app.settle()
  // Watch for longer than a frame lasts (100 ms) to be sure nothing moves.
  const still = new Set<string>()
  for (let k = 0; k < 5; k++) {
    still.add((await preview()) ?? '')
    await app.wait(70)
  }
  await check('Pause stops it', still.size === 1, `${still.size} different pictures while paused`)
})
