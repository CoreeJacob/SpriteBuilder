import { byTip, check, test, type App } from './support/app'

/** The preview canvas's size on screen, and the side panel's width. */
const sizes = (app: App) =>
  app.js<{ preview: number; panel: number }>(`({ preview: Math.round(document.querySelector('.studio-preview canvas').getBoundingClientRect().width), panel: Math.round(document.querySelector('.studio-panel').getBoundingClientRect().width) })`)
const toggleBig = (app: App) => app.js(`${byTip('.preview-actions .icon-btn', '')}.click()`).then(() => app.settle())
const chip = (app: App, label: string) => app.js(`[...document.querySelectorAll('.preview-actions .chip')].find(c => c.textContent === '${label}').click()`).then(() => app.settle())

test('a bigger preview shows the whole sprite, at fit or actual size, and stays that way', async ({ app }) => {
  await app.newSprite(128)
  const small = await sizes(app)
  await check('the usual preview fits the narrow side panel', small.preview <= 236 && small.panel < 300, small)
  await check('size choices only appear in the big preview', !(await app.js(`!!document.querySelector('.preview-actions .chip')`)))

  await toggleBig(app)
  const big = await sizes(app)
  await check('the expand button widens the side panel', big.panel > small.panel + 200, big)
  const box = await app.js<{ w: number; h: number }>(`(() => { const r = document.querySelector('.studio-preview').getBoundingClientRect(); return { w: r.width, h: r.height } })()`)
  const best = Math.floor(Math.min((box.w - 4) / 128, (box.h - 4) / 128))
  await check('…and the preview fills it at the biggest whole-number zoom that fits', best >= 3 && big.preview === 128 * best, { big, box })

  await chip(app, '1×')
  await check('1× shows it at actual size, as in a game', (await sizes(app)).preview === 128, await sizes(app))
  await app.js(`document.querySelector('.preview-actions input[type=checkbox]').click()`)
  await app.settle()
  await check('tiled 3×3 at 1× is three sprites wide', (await sizes(app)).preview === 384, await sizes(app))
  await app.js(`document.querySelector('.preview-actions input[type=checkbox]').click()`)
  await chip(app, 'Fit')

  // Drawing on the canvas still works with the big preview open, and the preview keeps up.
  await app.regeo(128)
  await app.tool('b')
  await app.click(0, 0)
  const corner = await app.js<string>(`(() => { const c = document.querySelector('.studio-preview canvas'); const d = c.getContext('2d').getImageData(0, 0, 1, 1).data; return d[3] ? 'drawn' : 'empty' })()`)
  await check('drawing still works, and shows in the preview straight away', corner === 'drawn', corner)

  await app.relaunch()
  await app.newSprite(128)
  await check('the big preview is remembered next time', (await sizes(app)).panel === big.panel, await sizes(app))
  await toggleBig(app)
  await check('…and the shrink button puts it back', (await sizes(app)).panel === small.panel, await sizes(app))
})
