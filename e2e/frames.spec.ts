import { check, test, type App } from './support/app'

const cells = (app: App) => app.js<number>(`document.querySelectorAll('.frame-cell').length`)
const counter = (app: App) => app.js<string>(`document.querySelector('.frame-counter').textContent`)
const frame = (i: number) => `document.querySelectorAll('.frame-cell')[${i}]`

test('right-clicking frames: duplicate, add, move, timing and delete', async ({ app }) => {
  await app.newSprite(8)
  await app.tool('b')
  await app.click(1, 1) // frame 1 has a pixel
  await app.addFrame() // frame 2 is empty

  await app.rightClick(frame(0))
  await check('right-clicking a frame selects it', (await counter(app)) === 'Frame 1 / 2', await counter(app))
  const menu = await app.menuLabels()
  const expected = ['Duplicate Frame', 'New Empty Frame Before', 'New Empty Frame After', 'Move Left (off)', 'Move Right', 'Frame Duration…', 'Delete Frame']
  await check('the frame menu has the frame actions (Move Left is off for the first frame)', expected.every((l) => menu.includes(l)), menu)

  await app.pickMenu('Duplicate Frame')
  await check('Duplicate Frame copies it, right after', (await cells(app)) === 3 && (await counter(app)) === 'Frame 2 / 3' && (await app.px(1, 1)) !== 'empty')

  await app.rightClick(frame(0))
  await app.pickMenu('New Empty Frame Before')
  await check('New Empty Frame Before adds an empty first frame', (await cells(app)) === 4 && (await counter(app)) === 'Frame 1 / 4' && (await app.px(1, 1)) === 'empty')

  await app.rightClick(frame(0))
  await app.pickMenu('Move Right')
  await check('Move Right swaps it with the next frame', (await counter(app)) === 'Frame 2 / 4')
  await app.js(`${frame(0)}.click()`)
  await app.settle()
  await check('…so the drawn frame is now first', (await app.px(1, 1)) !== 'empty')

  await app.rightClick(frame(0))
  await app.pickMenu('Frame Duration…')
  await app.answer('250')
  const timing = await app.js<string>(`(${frame(0)}.getAttribute('title') || ${frame(0)}.dataset.tip)`)
  await check('Frame Duration… sets that frame’s timing', timing.includes('250 ms'), timing)

  await app.rightClick(frame(3))
  await app.pickMenu('Delete Frame')
  await check('Delete Frame removes it', (await cells(app)) === 3)
  await app.undo()
  await check('…and undo brings it back', (await cells(app)) === 4)

  // With several frames shift-selected, right-clicking one of them acts on them all
  await app.js(`${frame(1)}.click()`)
  await app.js(`${frame(2)}.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))`)
  await app.settle()
  await app.rightClick(frame(1))
  const several = await app.menuLabels()
  await check('for a selection it offers to name and delete the whole run', several.includes('Name Frames 2–3…') && several.includes('Delete Frames 2–3') && several.includes('Duplicate Frame (off)'), several)
  await app.pickMenu('Name Frames 2–3…')
  await app.answer('blink')
  await check('naming them adds a tag over those frames', (await app.js<string>(`document.querySelector('.tag-bar')?.textContent ?? ''`)).includes('blink'))
  await app.js(`${frame(1)}.click()`)
  await app.js(`${frame(2)}.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))`)
  await app.settle()
  await app.rightClick(frame(2))
  await app.pickMenu('Delete Frames 2–3')
  await check('Delete Frames removes the whole run at once', (await cells(app)) === 2)
  await app.undo()
  await check('…and one undo brings both back', (await cells(app)) === 4)

  // Right-clicking a frame outside the selection selects just that frame
  await app.js(`${frame(1)}.click()`)
  await app.js(`${frame(2)}.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))`)
  await app.settle()
  await app.rightClick(frame(3))
  await check('right-clicking outside the selection selects just that frame', (await counter(app)) === 'Frame 4 / 4' && (await app.js(`document.querySelectorAll('.frame-cell.in-range').length`)) === 0)
  await app.key('Escape', 'Escape')
})
