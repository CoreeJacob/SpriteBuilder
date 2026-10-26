import { check, SHIFT, test, type App } from './support/app'

/** The Adjust section's row for one setting: its slider and its number box. */
const row = (label: string) => `[...document.querySelectorAll('.adjust-row')].find(r => r.textContent.startsWith('${label}'))`
const values = (app: App, label: string) =>
  app.js<{ slider: string; box: string }>(`(() => { const r = ${row(label)}; return { slider: r.querySelector('.slider').value, box: r.querySelector('.adjust-input').value } })()`)
const box = (label: string) => `${row(label)}.querySelector('.adjust-input')`
/** A pixel of the editor's (previewed) image. */
const pixel = (app: App) => app.js<string>(`(() => { const d = document.querySelector('.editor-canvas').getContext('2d').getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]].join() })()`)

test('Image Editor adjustments take typed numbers as well as the slider', async ({ app }) => {
  await app.openInEditor('walk-sheet.png') // white background
  const white = await pixel(app)

  await app.setInput(box('Contrast'), '13')
  await check('typing 13 sets contrast to exactly 13, and the slider follows', JSON.stringify(await values(app, 'Contrast')) === JSON.stringify({ slider: '13', box: '13' }), await values(app, 'Contrast'))

  await app.setInput(box('Brightness'), '-40')
  await check('the preview changes as you type (brightness −40 darkens the white)', (await pixel(app)) !== white, await pixel(app))

  await app.js(`${box('Hue')}.focus()`)
  await app.setInput(box('Hue'), '500')
  await app.js(`${box('Hue')}.blur()`)
  await app.settle()
  await check('a number past the end is kept in range (hue stops at 180)', (await values(app, 'Hue')).box === '180', await values(app, 'Hue'))

  await app.js(`${box('Saturation')}.focus()`)
  await app.key('ArrowUp', 'ArrowUp')
  await check('↑ steps by 1', (await values(app, 'Saturation')).box === '1', await values(app, 'Saturation'))
  await app.key('ArrowUp', 'ArrowUp', SHIFT)
  await check('⇧↑ steps by 10', (await values(app, 'Saturation')).box === '11' && (await values(app, 'Saturation')).slider === '11', await values(app, 'Saturation'))

  await app.js(`${box('Contrast')}.focus()`)
  await app.setInput(box('Contrast'), '77')
  await app.key('Escape', 'Escape')
  await check('Esc puts back the value from before typing', JSON.stringify(await values(app, 'Contrast')) === JSON.stringify({ slider: '13', box: '13' }), await values(app, 'Contrast'))

  await app.setInput(`${row('Contrast')}.querySelector('.slider')`, '-25')
  await check('moving the slider updates the box', (await values(app, 'Contrast')).box === '-25', await values(app, 'Contrast'))

  await app.js(`${box('Brightness')}.focus()`)
  await app.setInput(box('Brightness'), '')
  await app.js(`${box('Brightness')}.blur()`)
  await app.settle()
  await check('clearing the box and clicking away keeps the value it had', (await values(app, 'Brightness')).box === '-40', await values(app, 'Brightness'))
})
