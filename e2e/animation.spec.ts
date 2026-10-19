import { existsSync } from 'node:fs'
import path from 'node:path'
import { byTip, check, test } from './support/app'

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
  await app.js(`${byTip('.layer-actions button', 'New layer')}.click()`)
  await app.wait(80)
  await app.js(`${byTip('.layer-actions button', 'New layer')}.click()`)
  await app.wait(80)
  const names = () => app.js<string[]>(`[...document.querySelectorAll('.layer-name')].map(e => e.textContent)`)
  const before = await names()
  await app.js(`(() => {
    const rows = document.querySelectorAll('.layer-row'); const from = rows[rows.length - 1]; const to = rows[0]
    const dt = new DataTransfer(); const r = to.getBoundingClientRect()
    from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
    to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: r.top + 3 }))
    to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: r.top + 3 }))
    from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }))
    return 1 })()`)
  await app.wait(100)
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
  await app.wait(100)
  await check('duplicate frame: 2 frames, copy has the pixel', (await frameCount()) === 2 && (await app.px(1, 1)) !== 'empty')
  await app.tool('e')
  await app.click(1, 1) // erase it on frame 2…
  await app.tool('b')
  await app.click(5, 5) // …and draw elsewhere
  await app.js(`${byTip('.timeline button', 'Show the previous')}.click()`)
  await app.wait(100)
  const onion = await app.px(1, 1)
  await check('onion skin: previous frame shows through, tinted red', onion !== 'empty' && parseInt(onion.slice(1, 3), 16) > 60, onion)
  await app.js(`${byTip('.timeline button', 'Show the previous')}.click()`)
  await app.wait(100)
  await check('onion skin off: ghost gone', (await app.px(1, 1)) === 'empty')
  await app.key(',', 'Comma')
  await check(', goes to the previous frame', (await counter()) === 'Frame 1 / 2')
  await check('frame 1 unchanged by frame-2 edits', (await app.px(1, 1)) !== 'empty' && (await app.px(5, 5)) === 'empty')

  // FPS for all frames: click into the box, type 12, click elsewhere (as a person would)
  const fpsBox = await app.centre(`document.querySelector('.timeline-field input')`)
  await app.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: fpsBox[0], y: fpsBox[1], button: 'left', clickCount: 3 })
  await app.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fpsBox[0], y: fpsBox[1], button: 'left', clickCount: 3 })
  await app.call('Input.insertText', { text: '12' })
  await app.wait(100)
  const elsewhere = await app.js<[number, number]>(`(() => { const r = document.querySelector('.frame-counter').getBoundingClientRect(); return [r.x + 5, r.y + 5] })()`)
  await app.clickAt(...elsewhere)
  const durations = await app.js<string[]>(`[...document.querySelectorAll('.frame-cell')].map(c => (c.getAttribute('title') || c.dataset.tip).match(/(\\d+) ms/)[1])`)
  await check('FPS 12 sets every frame to 83 ms', durations.join() === '83,83', durations.join())

  // Reorder frames by drag: move frame 1 after frame 2
  await app.js(`(() => {
    const cells = document.querySelectorAll('.frame-cell'); const dt = new DataTransfer(); const r = cells[1].getBoundingClientRect()
    cells[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
    cells[1].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.right - 3 }))
    cells[1].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.right - 3 }))
    return 1 })()`)
  await app.wait(100)
  await check('frame drag: moved frame is now frame 2 and selected', (await counter()) === 'Frame 2 / 2' && (await app.px(1, 1)) !== 'empty')

  // Add, then undo
  await app.js(`${byTip('.timeline button', 'New empty frame')}.click()`)
  await app.wait(100)
  await check('add frame: 3 frames', (await frameCount()) === 3)
  await app.undo()
  await check('undo add frame: back to 2', (await frameCount()) === 2)

  // Preview playback advances
  await app.js(`${byTip('.timeline button', 'Play the animation')}.click()`)
  const seen = new Set<string>()
  for (let i = 0; i < 6; i++) {
    seen.add(await app.js(`document.querySelector('.preview-frame').textContent`))
    await app.wait(60)
  }
  await app.js(`${byTip('.timeline button', 'Stop the preview')}.click()`)
  await check('preview plays through frames', seen.size >= 2, [...seen].join(' | '))

  // Sprite sheet into the library
  const info = await app.js<string>(`(async () => { const w = ms => new Promise(r => setTimeout(r, ms))
    ;[...document.querySelectorAll('.studio-bar .btn')].find(b => b.textContent.includes('Export')).click(); await w(100)
    ;[...document.querySelectorAll('.dropdown-item')].find(b => b.textContent.includes('Sprite sheet')).click(); await w(200)
    ;[...document.querySelectorAll('.sheet-dialog .chip')].find(c => c.textContent === '2×').click()
    const pad = [...document.querySelectorAll('.sheet-dialog .field')].find(f => f.textContent.includes('Padding')).querySelector('input')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(pad, '2'); pad.dispatchEvent(new Event('input', { bubbles: true })); await w(100)
    const info = document.querySelector('.sheet-dialog .muted').textContent
    ;[...document.querySelectorAll('.sheet-dialog .btn')].find(b => b.textContent === 'Add to Library').click(); await w(800)
    return info })()`)
  await check('sheet: 2 frames of 8×8 at 2× with 2px padding = 34×16', info.includes('34×16'), info)
  await check('sheet PNG and its JSON frame data saved in the library', ['png', 'json'].every((ext) => existsSync(path.join(app.dirs.library, `Untitled-sheet.${ext}`))))
})
