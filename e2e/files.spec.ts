// Everything that goes through a macOS file dialog. The dialogs are answered from the test.

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { unzipSync } from 'fflate'
import { byText, byTip, card, check, menuItem, sidebar, test, type App } from './support/app'

/** Size, frame count and a few pixels of an image file, read by the app's own browser engine. */
async function inspectImage(app: App, file: string, type: string, points: Array<[number, number]>) {
  const b64 = (await readFile(file)).toString('base64')
  return app.js<{ width: number; height: number; frames: number; pixels: string[] }>(`(async () => {
    const data = Uint8Array.from(atob('${b64}'), c => c.charCodeAt(0))
    const dec = new ImageDecoder({ data, type: '${type}' }); await dec.tracks.ready
    const { image } = await dec.decode({ frameIndex: 0 })
    const c = new OffscreenCanvas(image.displayWidth, image.displayHeight); const g = c.getContext('2d'); g.drawImage(image, 0, 0)
    const pixels = ${JSON.stringify(points)}.map(([x, y]) => { const d = g.getImageData(x, y, 1, 1).data; return d[3] === 0 ? 'clear' : '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('') })
    return { width: image.displayWidth, height: image.displayHeight, frames: dec.tracks.selectedTrack.frameCount, pixels } })()`)
}

/** Export ▸ (scale) ▸ item in Pixel Studio. */
async function exportAs(app: App, item: string, scale: number): Promise<void> {
  await app.js(`${byText('.studio-bar .btn', 'Export')}.click()`)
  await app.settle()
  await app.js(`[...document.querySelectorAll('.dropdown .chip')].find(c => c.textContent === '${scale}×').click()`)
  await app.settle()
  await app.js(`${byText('.dropdown-item', item)}.click()`)
}

/** Picks an entry from the menu behind the "…" button at the bottom of the folder list. */
async function libraryMenu(app: App, label: string): Promise<void> {
  await app.js(`${byTip('.footer-actions .icon-btn', 'Back up')}.click()`)
  await app.untilJs(`!!${menuItem(label)}`)
  await app.js(`${menuItem(label)}.click()`)
}

/** Waits for a file to be written. */
const written = (app: App, file: string) => app.until(() => existsSync(file))

test('exporting PNGs and GIFs, and cancelling', async ({ app }) => {
  const { outside } = app.dirs
  await app.newSprite(8)
  await app.setColour('#ff0000')
  await app.tool('b')
  await app.click(0, 0)
  await app.addFrame()
  await app.click(7, 7)
  await app.key(',', 'Comma') // back to frame 1

  await app.answerSaveDialogs(path.join(outside, 'hero.png'), path.join(outside, 'hero.gif'))
  await exportAs(app, 'PNG image', 4)
  const png = path.join(outside, 'hero.png')
  // The message comes after the file is written, so wait for it before reading the file.
  const exported = await app.toast('Exported hero.png')
  await check('PNG written where the Save dialog said', existsSync(png))
  await check('…and the app says so', exported.includes('Exported hero.png'), exported)
  const still = existsSync(png) ? await inspectImage(app, png, 'image/png', [[0, 0], [3, 3], [4, 4], [31, 31]]) : null
  await check('PNG is the current frame at 4× (32×32, red 4×4 block in the corner)', still?.width === 32 && still.pixels.join() === '#ff0000,#ff0000,clear,clear', still)

  await exportAs(app, 'Animated GIF', 2)
  const gifFile = path.join(outside, 'hero.gif')
  await app.toast('Exported hero.gif')
  const gif = existsSync(gifFile) ? await inspectImage(app, gifFile, 'image/gif', [[0, 0], [15, 15]]) : null
  await check('GIF has both frames at 2× (16×16)', gif?.frames === 2 && gif.width === 16, gif)
  await check('GIF frame 1 matches the sprite', gif?.pixels.join() === '#ff0000,clear', gif?.pixels)

  // Cancelling the dialog writes nothing and shows no error. There's nothing to wait for,
  // so give a would-be export a moment to (wrongly) appear.
  await app.answerSaveDialogs()
  await exportAs(app, 'PNG image', 1)
  await app.wait(300)
  await check('cancelled export writes no file', !existsSync(path.join(outside, 'Untitled.png')))
  await check('…and shows no error', !(await app.js(`!!document.querySelector('.toast.error')`)), await app.toasts())

  // Export… from a library image's menu copies the file as it is
  const copied = path.join(outside, 'sheet-copy.png')
  await app.answerSaveDialogs(copied)
  await app.showAll('walk-sheet.png')
  await app.rightClick(card('walk-sheet.png'))
  await app.pickMenu('Export…')
  const original = await readFile(path.join(app.dirs.library, 'walk-sheet.png'))
  const same = await app.until(async () => existsSync(copied) && (await readFile(copied)).equals(original))
  await check('Library Export… copies the file unchanged', same)
})

test('backing up the library and restoring it into a new folder', async ({ app }) => {
  const { outside, library, userData } = app.dirs
  const root = async () => (await app.library()).root
  const rootBecomes = (want: string) => app.until(async () => (await root()) === want)
  await app.js(`window.api.updateMeta(['walk-sheet.png'], { tags: ['hero'], favorite: true })`)
  await app.showAll()

  const zip = path.join(outside, 'My Backup.zip')
  await app.answerSaveDialogs(zip)
  await libraryMenu(app, 'Back Up Library…')
  // The report comes once the zip is written.
  const report = await app.toast('Backed up')
  await check('backup reports what it saved', /Backed up \d+ files .* to My Backup\.zip/.test(report), report)
  const names = existsSync(zip) ? Object.keys(unzipSync(new Uint8Array(await readFile(zip)))) : []
  const expected = ['walk-sheet.png', 'gif-check.gif', 'Tiles/grass.png', 'Test Folder/Enemies/bat.png', '.spritebuilder/library.json']
  await check('the zip holds every image, folder and the tags file', expected.every((n) => names.includes(n)), names)

  // Restore: pick the zip, then the place to put it
  const restoredRoot = path.join(outside, 'My Backup')
  await app.answerOpenDialogs(zip, outside)
  await libraryMenu(app, 'Restore from Backup…')
  await check('restore opens a new folder named after the backup', await rootBecomes(restoredRoot), await root())
  const restored = await app.library()
  await check('…with every image and folder', ['walk-sheet.png', 'Tiles/grass.png', 'Test Folder/Enemies/bat.png'].every((p) => restored.items.some((i) => i.path === p)))
  const sheet = restored.items.find((i) => i.path === 'walk-sheet.png')
  await check('…and tags and favourites kept', sheet?.tags.join() === 'hero' && sheet.favorite, sheet)
  await check('…and says so', (await app.toast('Restored')).includes('Restored'), await app.toasts())
  await check('the app remembers the restored library for next time', JSON.parse(await readFile(path.join(userData, 'settings.json'), 'utf8')).libraryRoot === restoredRoot)
  await check('the original library is left alone', existsSync(path.join(library, 'walk-sheet.png')) && existsSync(path.join(library, 'Tiles/grass.png')))
  await check('the sidebar shows the restored folders', await app.untilJs(`!!${sidebar('Enemies')}`))

  // Restoring the same backup again never overwrites: it makes "My Backup 2"
  const second = path.join(outside, 'My Backup 2')
  await app.answerOpenDialogs(zip, outside)
  await libraryMenu(app, 'Restore from Backup…')
  await check('a second restore goes into a new folder', await rootBecomes(second), await root())

  // A file that isn't a zip is refused, and the current library stays open
  const broken = path.join(outside, 'broken.zip')
  await writeFile(broken, 'not a zip')
  await app.answerOpenDialogs(broken, outside)
  await libraryMenu(app, 'Restore from Backup…')
  const refusal = await app.toast('isn’t a readable .zip backup')
  await check('a broken backup is refused with a message', refusal.includes('isn’t a readable .zip backup'), refusal)
  await check('…and the open library doesn’t change', (await root()) === second)
})
