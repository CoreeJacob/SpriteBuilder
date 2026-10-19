import { card, check, menuItem, test, W, type App } from './support/app'

/** Fills in the Save dialog and confirms it; returns the explanation it showed. */
const saveDialog = (app: App, name: string) =>
  app.js<string | undefined>(`(async () => { ${W} await w(250)
    const i = document.querySelector('.modal input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(name)}); i.dispatchEvent(new Event('input', { bubbles: true }))
    await w(100); const label = document.querySelector('.modal p')?.textContent; document.querySelector('.modal button[type=submit]').click(); await w(1000); return label })()`)
const fileBytes = (app: App, p: string) => app.js<number>(`(async () => (await (await fetch('sprite://library/${encodeURI(p)}?t=' + Date.now())).arrayBuffer()).byteLength)()`)
const studioButton = (app: App, text: string) => app.js(`[...document.querySelectorAll('.studio-bar .btn')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})).click()`)
const editorFlip = (app: App) =>
  app.js(`[...document.querySelectorAll('.editor-panel button')].find(b => (b.getAttribute('title') || b.dataset.tip || '').startsWith('Flip left')).click()`).then(() => app.wait(150))
const confirmsAsked = (app: App) => app.js<string[]>(`window.__confirms.slice()`)

test('Save and Save As update the right file', async ({ app }) => {
  // Record every "are you sure?" question (and say yes).
  await app.js(`window.__confirms = []; window.confirm = (m) => (window.__confirms.push(m), true); 1`)
  await app.importCopy('Tiles/grass.png', 'dupsrc.png')
  await app.showAll()

  // Right-click → Duplicate
  await app.clickAt(...(await app.centre(card('dupsrc.png'))), 'right')
  await app.js(`${menuItem('Duplicate')}.click()`)
  await app.wait(600)
  await check('duplicate created', (await app.files('dupsrc')).join() === 'dupsrc 2.png,dupsrc.png', await app.files('dupsrc'))
  const before = await fileBytes(app, 'dupsrc 2.png')

  // Open the duplicate in Pixel Studio and change it
  await app.showAll()
  await app.js(`${card('dupsrc 2.png')}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  await app.wait(800)
  await app.regeo(16)
  await app.tool('b')
  await app.js(`window.__confirms = []; 1`) // ignore any "discard?" question from opening it
  await app.js(`(() => { const sw = [...document.querySelectorAll('.studio-panel .swatch')]; sw[sw.length - 1].click(); return 1 })()`)
  await app.click(3, 3)

  // Save As, keeping the suggested name
  await studioButton(app, 'Save As…')
  const label = await saveDialog(app, 'dupsrc 2')
  await check('Save As explains that keeping the name updates the file', (label ?? '').includes('Keep the name to update “dupsrc 2.png”'), label)
  await check('no extra file: the duplicate itself was updated', (await app.files('dupsrc')).join() === 'dupsrc 2.png,dupsrc.png', await app.files('dupsrc'))
  await check('…and its contents changed', (await fileBytes(app, 'dupsrc 2.png')) !== before)
  await check('no "replace?" question for its own file', (await confirmsAsked(app)).length === 0, await confirmsAsked(app))
  await check('sprite is now clean', !(await app.js(`!!document.querySelector('.doc-name .dot')`)))

  // A new name makes a new file
  await studioButton(app, 'Save As…')
  await saveDialog(app, 'dupsrc variant')
  await check('a new name makes a new file', (await app.files('dupsrc')).includes('dupsrc variant.png'))

  // Another file's name asks before replacing it
  await studioButton(app, 'Save As…')
  await saveDialog(app, 'dupsrc')
  const asked = await confirmsAsked(app)
  await check('using another file’s name asks before replacing it', asked.length === 1 && asked[0].includes('dupsrc.png'), asked)
  await check('…and replaces it rather than making “dupsrc 3”', !(await app.files('dupsrc')).some((f) => f.includes('dupsrc 3')), await app.files('dupsrc'))

  // Image Editor: Save as Copy with the original's own name saves over it
  await app.js(`window.__confirms = []; 1`)
  await app.importCopy('Tiles/grass.png', 'edsrc.png')
  await app.showAll()
  await app.clickAt(...(await app.centre(card('edsrc.png'))), 'right')
  await app.js(`${menuItem('Edit Image')}.click()`)
  await app.wait(800)
  await editorFlip(app)
  await studioButton(app, 'Save as Copy')
  await saveDialog(app, 'edsrc')
  await check('Image Editor: same name saves over the file, no copy', (await app.files('edsrc')).join() === 'edsrc.png', await app.files('edsrc'))
  await editorFlip(app)
  await studioButton(app, 'Save as Copy')
  await saveDialog(app, 'dupsrc 2')
  await check('Image Editor won’t overwrite a Pixel Studio sprite', (await app.toasts()).includes('is a Pixel Studio sprite'), await app.toasts())
})
