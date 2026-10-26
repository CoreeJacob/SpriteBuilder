import { existsSync } from 'node:fs'
import path from 'node:path'
import { byText, byTip, check, test } from './support/app'

test('GIFs decode with exact colours and timings', async ({ app }) => {
  const gif = await app.js(`(async () => {
    const bytes = await (await fetch('sprite://library/gif-check.gif')).arrayBuffer()
    const dec = new ImageDecoder({ data: bytes, type: 'image/gif' }); await dec.tracks.ready
    const f2 = await dec.decode({ frameIndex: 2 })
    const f0 = await dec.decode({ frameIndex: 0 })
    const c = new OffscreenCanvas(32, 32); const x = c.getContext('2d'); x.drawImage(f0.image, 0, 0)
    return { frames: dec.tracks.selectedTrack.frameCount, w: f0.image.displayWidth, h: f0.image.displayHeight, lastMs: f2.image.duration / 1000, corner: Array.from(x.getImageData(1, 1, 1, 1).data) }
  })()`)
  await check('3 frames', gif.frames === 3, gif)
  await check('32×32', gif.w === 32 && gif.h === 32)
  await check('per-frame duration kept (300 ms)', gif.lastMs === 300)
  await check('exact colour (red corner pixel)', gif.corner.join() === '255,0,0,255')
})

test('layers and frames: drag to reorder, onion skin, FPS, preview, sprite sheet', async ({ app }) => {
  await app.newSprite(8)

  // Layers: drag the bottom row onto the top half of the top row
  for (let i = 0; i < 2; i++) {
    await app.js(`${byTip('.layer-actions button', 'New layer')}.click()`)
    await app.settle()
  }
  const names = () => app.layerNames()
  const before = await names()
  await app.dragDrop(`[...document.querySelectorAll('.layer-row')].at(-1)`, `document.querySelector('.layer-row')`, { at: { clientY: 'top + 3' } })
  await app.settle()
  const after = await names()
  await check('layer drag: bottom layer moved to the top', after[0] === before[2] && after[1] === before[0], `${before} → ${after}`)
  await app.undo()
  await check('layer drag: undo restores the order', (await names()).join() === before.join())

  // Frames
  const frameCount = () => app.js<number>(`document.querySelectorAll('.frame-cell').length`)
  const counter = () => app.js<string>(`document.querySelector('.frame-counter').textContent`)
  await app.tool('b')
  await app.click(1, 1) // frame 1: pixel at (1,1)
  await app.js(`${byTip('.timeline button', 'Duplicate this frame')}.click()`)
  await app.settle()
  await check('duplicate frame: 2 frames, copy has the pixel', (await frameCount()) === 2 && (await app.px(1, 1)) !== 'empty')
  await app.tool('e')
  await app.click(1, 1) // erase it on frame 2…
  await app.tool('b')
  await app.click(5, 5) // …and draw elsewhere
  await app.js(`${byTip('.timeline button', 'Show the previous')}.click()`)
  await app.settle()
  const onion = await app.px(1, 1)
  await check('onion skin: previous frame shows through, tinted red', onion !== 'empty' && parseInt(onion.slice(1, 3), 16) > 60, onion)
  await app.js(`${byTip('.timeline button', 'Show the previous')}.click()`)
  await app.settle()
  await check('onion skin off: ghost gone', (await app.px(1, 1)) === 'empty')
  await app.key(',', 'Comma')
  await check(', goes to the previous frame', (await counter()) === 'Frame 1 / 2')
  await check('frame 1 unchanged by frame-2 edits', (await app.px(1, 1)) !== 'empty' && (await app.px(5, 5)) === 'empty')

  // FPS for all frames: click into the box, type 12, click elsewhere (as a person would)
  const fpsBox = await app.centre(`document.querySelector('.timeline-field input')`)
  await app.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: fpsBox[0], y: fpsBox[1], button: 'left', clickCount: 3 })
  await app.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fpsBox[0], y: fpsBox[1], button: 'left', clickCount: 3 })
  await app.call('Input.insertText', { text: '12' })
  await app.settle()
  const elsewhere = await app.js<[number, number]>(`(() => { const r = document.querySelector('.frame-counter').getBoundingClientRect(); return [r.x + 5, r.y + 5] })()`)
  await app.clickAt(...elsewhere)
  const durations = await app.js<string[]>(`[...document.querySelectorAll('.frame-cell')].map(c => (c.getAttribute('title') || c.dataset.tip).match(/(\\d+) ms/)[1])`)
  await check('FPS 12 sets every frame to 83 ms', durations.join() === '83,83', durations.join())

  // Reorder frames by drag: move frame 1 after frame 2
  await app.dragDrop(`document.querySelectorAll('.frame-cell')[0]`, `document.querySelectorAll('.frame-cell')[1]`, { at: { clientX: 'right - 3' } })
  await app.settle()
  await check('frame drag: moved frame is now frame 2 and selected', (await counter()) === 'Frame 2 / 2' && (await app.px(1, 1)) !== 'empty')

  // Add, then undo
  await app.addFrame()
  await check('add frame: 3 frames', (await frameCount()) === 3)
  await app.undo()
  await check('undo add frame: back to 2', (await frameCount()) === 2)

  // Preview playback advances
  await app.js(`${byTip('.timeline button', 'Play the animation')}.click()`)
  const seen = new Set<string>()
  await app.until(async () => seen.add(await app.js(`document.querySelector('.preview-frame').textContent`)).size >= 2, 2000)
  await app.js(`${byTip('.timeline button', 'Stop the preview')}.click()`)
  await check('preview plays through frames', seen.size >= 2, [...seen].join(' | '))

  // Sprite sheet into the library
  await app.openSheetDialog()
  await app.js(`${byText('.sheet-dialog .chip', '2×')}.click()`)
  await app.setInput(`[...document.querySelectorAll('.sheet-dialog .field')].find(f => f.textContent.includes('Padding')).querySelector('input')`, '2')
  const info = await app.js<string>(`document.querySelector('.sheet-dialog .muted').textContent`)
  await check('sheet: 2 frames of 8×8 at 2× with 2px padding = 34×16', info.includes('34×16'), info)
  await app.js(`${byText('.sheet-dialog .btn', 'Add to Library')}.click()`)
  const saved = await app.until(() => ['png', 'json'].every((ext) => existsSync(path.join(app.dirs.library, `Untitled-sheet.${ext}`))))
  await check('sheet PNG and its JSON frame data saved in the library', saved)
})
