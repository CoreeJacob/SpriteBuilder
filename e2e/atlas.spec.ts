import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { byText, check, menuItem, sidebar, test, type App } from './support/app'

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number }
  trimmed: boolean
  spriteSourceSize: { x: number; y: number; w: number; h: number }
  sourceSize: { w: number; h: number }
  duration?: number
}
interface AtlasFile {
  frames: Record<string, AtlasFrame>
  meta: { image: string; size: { w: number; h: number }; frameTags: Array<{ name: string; from: number; to: number }> }
}

const stats = (app: App) => app.js<string>(`document.querySelector('.atlas-stats')?.textContent ?? ''`)
const dialogTitle = (app: App) => app.js<string>(`document.querySelector('.atlas-dialog h2')?.textContent ?? ''`)

/** Right-click a sidebar folder ▸ Pack into Atlas…, and wait for the preview. */
async function openAtlas(app: App, folder: string): Promise<void> {
  await app.goTo('Library')
  await app.rightClick(sidebar(folder))
  await app.js(`${menuItem('Pack into Atlas…')}.click()`)
  await app.untilJs(`/sprite/.test(document.querySelector('.atlas-stats')?.textContent ?? '')`)
}

const toggle = (app: App, label: string) => app.js(`${byText('.atlas-dialog .check', label)}.querySelector('input').click()`).then(() => app.settle())

async function packAndRead(app: App, file: string): Promise<AtlasFile | null> {
  await app.js(`[...document.querySelectorAll('.atlas-dialog .modal-actions .btn')].find(b => /^(Pack|Repack)$/.test(b.textContent.trim())).click()`)
  await app.untilJs(`!document.querySelector('.atlas-dialog')`)
  const json = path.join(app.dirs.library, file.replace(/\.png$/, '.json'))
  await app.until(() => existsSync(json))
  return existsSync(json) ? JSON.parse(await readFile(json, 'utf8')) : null
}

/** A pixel of the saved atlas image, read by the app's browser engine. */
const atlasPixel = (app: App, file: string, x: number, y: number) =>
  app.js<string>(`(async () => { const img = new Image(); img.crossOrigin = 'anonymous'; img.src = 'sprite://library/${file}?v=' + Date.now(); await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0)
    const d = g.getImageData(${x}, ${y}, 1, 1).data; return d[3] === 0 ? 'clear' : '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('') })()`)

test('packing a folder into an atlas, then repacking it', async ({ app }) => {
  // A two-frame Pixel Studio sprite in Heroes, next to the 8×8 knight.
  await app.newSprite(8)
  await app.tool('b')
  await app.click(1, 1)
  await app.addFrame()
  await app.click(6, 6)
  await app.js(`${byText('.studio-bar .btn', 'Save')}.click()`)
  await app.answer('hero-walk', { folder: 'Heroes' })
  await app.waitForItem('Heroes/hero-walk.png')

  await openAtlas(app, 'Heroes')
  await check('the folder menu opens the atlas dialog', (await dialogTitle(app)) === 'Pack “Heroes” into an Atlas', await dialogTitle(app))
  await check('it counts every frame of every image', (await stats(app)).startsWith('3 sprites from 2 images'), await stats(app))
  await check('and shows a preview of the packed atlas', await app.js(`!!document.querySelector('.atlas-preview canvas')`))
  await toggle(app, 'Power-of-two')
  const size = (await stats(app)).match(/(\d+)×(\d+) px/)?.slice(1).map(Number) ?? []
  await check('power-of-two makes both sides a power of two', size.length === 2 && size.every((n) => (n & (n - 1)) === 0), await stats(app))

  const atlas = await packAndRead(app, 'Heroes-atlas.png')
  await check('saved next to the folder, with its JSON', (await app.waitForItem('Heroes-atlas.png')) && !!atlas)
  await check('…and says so', (await app.toast('Packed 3 sprites into Heroes-atlas.png')).includes('Packed 3 sprites'), await app.toasts())
  await check('frames are named by path, animation frames numbered', JSON.stringify(Object.keys(atlas?.frames ?? {})) === JSON.stringify(['hero-walk_0.png', 'hero-walk_1.png', 'knight.png']), Object.keys(atlas?.frames ?? {}))
  const knight = atlas?.frames['knight.png']
  await check('the knight is trimmed of its clear top and bottom rows, keeping its full size in the JSON', knight?.trimmed && knight.frame.w === 8 && knight.frame.h === 6 && knight.spriteSourceSize.y === 1 && knight.sourceSize.h === 8, knight)
  await check('animation frames keep their timing, and the animation is a tag', atlas?.frames['hero-walk_0.png'].duration === 100 && atlas.meta.frameTags[0]?.name === 'hero-walk' && atlas.meta.frameTags[0].to === 1, atlas?.meta.frameTags)
  const corner = knight ? await atlasPixel(app, 'Heroes-atlas.png', knight.frame.x, knight.frame.y) : ''
  await check('the image holds each sprite where the JSON says', corner === '#1d2b53', corner)
  await check('the JSON names the image and its size', atlas?.meta.image === 'Heroes-atlas.png' && atlas.meta.size.w === size[0] && atlas.meta.size.h === size[1], atlas?.meta)

  // Add a sprite to the folder and repack: the same settings, the same file
  await app.js(`(async () => window.api.importData('Heroes', [{ name: 'grass.png', data: new Uint8Array(await (await fetch('sprite://library/Tiles/grass.png')).arrayBuffer()) }]))()`)
  await app.waitForItem('Heroes/grass.png')
  await openAtlas(app, 'Heroes')
  await check('opening it again offers to repack, with the same settings', (await dialogTitle(app)).startsWith('Repack') && (await app.js(`${byText('.atlas-dialog .check', 'Power-of-two')}.querySelector('input').checked`)))
  await check('…and finds the new sprite', (await stats(app)).startsWith('4 sprites from 3 images'), await stats(app))
  const repacked = await packAndRead(app, 'Heroes-atlas.png')
  await check('repacking updates the same atlas', Object.keys(repacked?.frames ?? {}).includes('grass.png') && (await app.files('Heroes-atlas')).length === 1, await app.files('Heroes-atlas'))
})

test('an atlas of the whole library leaves other atlases out', async ({ app }) => {
  await openAtlas(app, 'Heroes')
  await packAndRead(app, 'Heroes-atlas.png')
  await openAtlas(app, 'Library')
  const all = await packAndRead(app, 'Library-atlas.png')
  const names = Object.keys(all?.frames ?? {})
  await check('every image in every folder is in it, animations frame by frame', ['Heroes/knight.png', 'Tiles/grass.png', 'Test Folder/Enemies/bat.png', 'gif-check_0.gif', 'gif-check_2.gif'].every((n) => names.includes(n)), names)
  await check('…but not the Heroes atlas', !names.some((n) => n.includes('atlas')), names)

  // Without subfolders, only the images sitting in the folder itself
  await openAtlas(app, 'Library')
  await toggle(app, 'Include subfolders')
  await check('turning off subfolders leaves just the top-level images', (await stats(app)).startsWith('5 sprites from 3 images'), await stats(app))
})
