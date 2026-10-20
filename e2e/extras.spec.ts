import { byText, byTip, card, check, test } from './support/app'

const SWEETIE_16 = ['1a1c2c', '5d275d', 'b13e53', 'ef7d57', 'ffcd75', 'a7f070', '38b764', '257179', '29366f', '3b5dc9', '41a6f6', '73eff7', 'f4f4f4', '94b0c2', '566c86', '333c57']

test('canvas size: add space, undo, scale', async ({ app }) => {
  const field = (label: string) =>
    `[...document.querySelectorAll('.canvas-size-dialog .field')].find(f => f.textContent.startsWith('${label}')).querySelector('input')`
  const openDialog = () => app.js(`${byTip('.studio-bar button', 'Change the sprite')}.click()`).then(() => app.settle())
  const apply = async () => {
    await app.js(`document.querySelector('.canvas-size-dialog button[type=submit]').click()`)
    await app.untilJs(`!document.querySelector('.canvas-size-dialog')`)
    await app.settle()
  }

  await app.newSprite(16)
  await app.tool('b')
  await app.click(0, 0)
  await openDialog()
  await app.setInput(field('Width'), '24')
  await app.setInput(field('Height'), '24')
  await app.js(`document.querySelectorAll('.anchor')[8].click()`) // keep pixels at the bottom-right
  await app.settle()
  await apply()
  await check('canvas resized to 24×24', (await app.docInfo())?.startsWith('24×24'), await app.docInfo())
  await app.regeo(24)
  await check('pixels kept at bottom-right (moved to 8,8)', (await app.px(8, 8)) !== 'empty' && (await app.px(0, 0)) === 'empty')
  await app.undo()
  await app.regeo(16)
  await check('undo restores 16×16 with the pixel at 0,0', (await app.docInfo())?.startsWith('16×16') && (await app.px(0, 0)) !== 'empty')

  await openDialog()
  await app.js(`${byText('.canvas-size-dialog .chip', 'Scale the pixels')}.click()`)
  await app.settle()
  await app.setInput(field('Width'), '32')
  await app.setInput(field('Height'), '32')
  await apply()
  await app.regeo(32)
  await check('scale 2× → 32×32 with the pixel now 2×2', (await app.docInfo())?.startsWith('32×32') && (await app.px(1, 1)) !== 'empty' && (await app.px(2, 2)) === 'empty')
})

test('palettes: save, import from Lospec and from a file, delete', async ({ app }) => {
  // Lospec answers from here instead of the internet; remember what was asked for.
  await app.main(({ net }, colors) => {
    const g = globalThis as { lospecAsked?: string[] }
    g.lospecAsked = []
    net.fetch = (async (url: string) => {
      g.lospecAsked!.push(String(url))
      return new Response(JSON.stringify({ name: 'Sweetie 16', colors }), { headers: { 'content-type': 'application/json' } })
    }) as typeof net.fetch
  }, SWEETIE_16)
  const palettes = () => app.js<Array<{ name: string; colors: string[] }>>(`window.api.listPalettes()`)
  const menu = async (label: string) => {
    await app.js(`${byTip('.palette-picker .icon-btn', 'Save, import')}.click()`)
    await app.settle()
    await app.js(`${byText('.dropdown-item', label)}.click()`)
  }

  await app.newSprite(16)
  await menu('Save palette as')
  await app.answer('My Test Pal')
  const has = (name: string) => async () => (await palettes()).some((p) => p.name === name)
  await check('palette saved to the library', await app.until(has('My Test Pal')))

  await menu('Import from Lospec')
  await app.answer('https://lospec.com/palette-list/sweetie-16')
  await app.until(has('Sweetie 16'))
  const asked = (await app.main(() => (globalThis as { lospecAsked?: string[] }).lospecAsked, null)) as string[]
  await check('Lospec link turned into the palette’s JSON address', asked.join() === 'https://lospec.com/palette-list/sweetie-16.json', asked)
  const lospec = (await palettes()).find((p) => p.name === 'Sweetie 16')
  await check('Lospec import: Sweetie 16 with 16 colours', lospec?.colors.length === 16 && lospec.colors[0] === '#1a1c2c', lospec?.colors.slice(0, 3))
  await check('sprite switched to the imported palette', await app.untilJs(`document.querySelectorAll('.studio-panel .swatches')[0].children.length === 16`))

  await app.js(`(() => { const input = document.querySelector('.studio-panel input[type=file]'); const dt = new DataTransfer(); dt.items.add(new File(['GIMP Palette\\nName: Gameboy Mint\\n15 56 15\\n155 188 15\\n'], 'mint.gpl')); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); return 1 })()`)
  await app.until(has('Gameboy Mint'))
  await check('palette file import (.gpl)', (await palettes()).find((p) => p.name === 'Gameboy Mint')?.colors.join() === '#0f380f,#9bbc0f')
  await menu('Delete')
  await check('delete removes the saved palette', await app.until(async () => !(await has('Gameboy Mint')())))

  await app.js(`${byText('.studio-bar .btn', 'New')}.click()`)
  const listed = await app.untilJs(`!!document.querySelector('.new-sprite optgroup[label="My palettes"]')`)
  await app.js(`${byText('.btn', 'Cancel')}.click()`)
  await check('New Sprite dialog lists My palettes', listed)
})

test('named frame ranges (tags) follow frame changes and export', async ({ app }) => {
  const tagTip = () => app.js<string>(`(() => { const t = document.querySelector('.tag-bar'); return t.getAttribute('title') ?? t.dataset.tip ?? '' })()`)
  await app.newSprite(8)
  for (let i = 0; i < 3; i++) await app.addFrame()
  await app.js(`document.querySelectorAll('.frame-cell')[1].click()`)
  await app.settle()
  await app.js(`document.querySelectorAll('.frame-cell')[2].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))`)
  await app.settle()
  await check('shift-click selects frames 2–3', (await app.js(`document.querySelectorAll('.frame-cell.in-range').length`)) === 2)
  await app.js(`${byText('.timeline .btn', 'Name frames')}.click()`)
  await app.answer('walk')
  const tags = await app.js<string[]>(`[...document.querySelectorAll('.tag-bar')].map(t => t.textContent.replace('×', '').trim())`)
  await check('tag "walk" shown above the frames', tags.join() === 'walk', tags)

  await app.js(`document.querySelectorAll('.frame-cell')[3].click()`)
  await app.settle()
  await app.js(`document.querySelector('.tag-bar').click()`)
  await app.settle()
  const selected = await app.js(`[...document.querySelectorAll('.frame-cell')].map((c, i) => c.classList.contains('in-range') ? i : null).filter(i => i !== null).join()`)
  await check('clicking the tag selects its frames', selected === '1,2', selected)

  await app.js(`document.querySelectorAll('.frame-cell')[0].click()`)
  await app.settle()
  await app.js(`${byTip('.timeline button', 'Delete this frame')}.click()`)
  await app.settle()
  await check('deleting an earlier frame shifts the tag', (await tagTip()).includes('frames 1–2'), await tagTip())
  await app.undo()
  await check('undo restores frame and tag position', (await app.js(`document.querySelectorAll('.frame-cell').length`)) === 4 && (await tagTip()).includes('frames 2–3'))

  await app.openSheetDialog()
  await app.js(`${byText('.sheet-dialog .btn', 'Add to Library')}.click()`)
  await check('sheet saved', await app.waitForItem('Untitled-sheet.png'), await app.files('Untitled'))
})

test('an animated GIF opens in Pixel Studio as frames', async ({ app }) => {
  await app.showAll('gif-check.gif')
  await app.dblclick(card('gif-check.gif'))
  await app.untilJs(`document.querySelectorAll('.frame-cell').length === 3`)
  const timings = await app.js<string>(`[...document.querySelectorAll('.frame-cell')].map(c => (c.getAttribute('title') || c.dataset.tip).match(/(\\d+) ms/)[1]).join()`)
  await check('GIF opens as 3 frames with timings 100,100,300', timings === '100,100,300', timings)
  await check('GIF size kept (32×32)', (await app.docInfo())?.startsWith('32×32'), await app.docInfo())
})

test('unsaved work survives a crash', async ({ app }) => {
  await app.newSprite(16)
  await app.tool('b')
  await app.click(3, 3)
  await app.click(4, 4)
  await app.js(`window.dispatchEvent(new Event('blur'))`)
  const saved = await app.untilJs<{ content: string } | null>(`window.api.readRecovery()`)
  await check('autosave written when the window loses focus', saved !== null && JSON.parse(saved.content).name === 'Untitled')

  await app.crashAndRelaunch()
  const offered = await app.untilJs<string | null>(`document.querySelector('.recovery-dialog')?.textContent ?? null`)
  await check('recovery offered after a crash', !!offered && offered.includes('Untitled') && offered.includes('16×16'), offered)
  await app.js(`${byText('.recovery-dialog .btn', 'Recover')}.click()`)
  await app.untilJs(`!document.querySelector('.recovery-dialog') && !!document.querySelector('.pixel-canvas')`)
  await app.settle()
  await app.regeo(16)
  const dirty = await app.js<boolean>(`!!document.querySelector('.doc-name .dot')`)
  await check('recovered drawing is back in the Studio, unsaved', (await app.px(3, 3)) !== 'empty' && (await app.px(4, 4)) !== 'empty' && dirty)
  await app.js(`${byText('.studio-bar .btn', 'Save')}.click()`)
  await app.answer('recovered-sprite')
  await check('saving puts the sprite in the library', await app.waitForItem('recovered-sprite.png'))
  await check('…and clears the recovery copy', await app.untilJs(`window.api.readRecovery().then(r => r === null)`))
})
