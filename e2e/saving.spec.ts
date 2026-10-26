import { byTip, card, check, test, type App } from './support/app'

const fileBytes = (app: App, p: string) => app.js<number>(`(async () => (await (await fetch('sprite://library/${encodeURI(p)}?t=' + Date.now())).arrayBuffer()).byteLength)()`)
const studioButton = (app: App, text: string) => app.js(`[...document.querySelectorAll('.studio-bar .btn')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})).click()`)
const editorFlip = (app: App) => app.js(`${byTip('.editor-panel button', 'Flip left')}.click()`).then(() => app.settle())
const confirmsAsked = (app: App) => app.js<string[]>(`window.__confirms.slice()`)
/** Waits until the open document has been saved: no "unsaved" dot, and (in the Studio) this name. */
const savedAs = (app: App, name?: string) =>
  app.untilJs<boolean>(`(() => { const d = document.querySelector('.doc-name'); return !!d && !d.querySelector('.dot') ${name ? `&& d.textContent === ${JSON.stringify(name)}` : ''} })()`)

test('Save and Save As update the right file', async ({ app }) => {
  // Record every "are you sure?" question (and say yes).
  await app.js(`window.__confirms = []; window.confirm = (m) => (window.__confirms.push(m), true); 1`)
  await app.importCopy('Tiles/grass.png', 'dupsrc.png')
  await app.showAll('dupsrc.png')

  // Right-click → Duplicate
  await app.rightClick(card('dupsrc.png'))
  await app.pickMenu('Duplicate')
  await app.waitForItem('dupsrc 2.png')
  await check('duplicate created', (await app.files('dupsrc')).join() === 'dupsrc 2.png,dupsrc.png', await app.files('dupsrc'))
  const before = await fileBytes(app, 'dupsrc 2.png')

  // Open the duplicate in Pixel Studio and change it
  await app.showAll('dupsrc 2.png')
  await app.dblclick(card('dupsrc 2.png'))
  await app.untilJs(`document.querySelector('.doc-name')?.textContent === 'dupsrc 2'`)
  await app.settle()
  await app.regeo(16)
  await app.tool('b')
  await app.js(`window.__confirms = []; 1`) // ignore any "discard?" question from opening it
  await app.js(`(() => { const sw = [...document.querySelectorAll('.studio-panel .swatch')]; sw[sw.length - 1].click(); return 1 })()`)
  await app.click(3, 3)

  // Save As, keeping the suggested name
  await studioButton(app, 'Save As…')
  const label = await app.answer('dupsrc 2')
  await check('Save As explains that keeping the name updates the file', (label ?? '').includes('Keep the name to update “dupsrc 2.png”'), label)
  await check('sprite is now clean', await savedAs(app, 'dupsrc 2'))
  await check('no extra file: the duplicate itself was updated', (await app.files('dupsrc')).join() === 'dupsrc 2.png,dupsrc.png', await app.files('dupsrc'))
  await check('…and its contents changed', (await fileBytes(app, 'dupsrc 2.png')) !== before)
  await check('no "replace?" question for its own file', (await confirmsAsked(app)).length === 0, await confirmsAsked(app))

  // A new name makes a new file
  await studioButton(app, 'Save As…')
  await app.answer('dupsrc variant')
  await check('a new name makes a new file', await app.waitForItem('dupsrc variant.png'))

  // Another file's name asks before replacing it
  await studioButton(app, 'Save As…')
  await app.answer('dupsrc')
  await savedAs(app, 'dupsrc')
  const asked = await confirmsAsked(app)
  await check('using another file’s name asks before replacing it', asked.length === 1 && asked[0].includes('dupsrc.png'), asked)
  await check('…and replaces it rather than making “dupsrc 3”', !(await app.files('dupsrc')).some((f) => f.includes('dupsrc 3')), await app.files('dupsrc'))

  // Image Editor: Save as Copy with the original's own name saves over it
  await app.js(`window.__confirms = []; 1`)
  await app.importCopy('Tiles/grass.png', 'edsrc.png')
  await app.showAll('edsrc.png')
  await app.rightClick(card('edsrc.png'))
  await app.pickMenu('Edit Image')
  await app.untilJs(`!!document.querySelector('.editor-canvas')`)
  await editorFlip(app)
  await studioButton(app, 'Save as Copy')
  await app.answer('edsrc')
  await savedAs(app)
  await check('Image Editor: same name saves over the file, no copy', (await app.files('edsrc')).join() === 'edsrc.png', await app.files('edsrc'))
  await editorFlip(app)
  await studioButton(app, 'Save as Copy')
  await app.answer('dupsrc 2')
  const refusal = await app.toast('is a Pixel Studio sprite')
  await check('Image Editor won’t overwrite a Pixel Studio sprite', refusal.includes('is a Pixel Studio sprite'), refusal)
})
