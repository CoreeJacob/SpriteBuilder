// Launches SpriteBuilder on a fresh library and drives it the way a person would:
// real mouse and keyboard events through the DevTools protocol, plus DOM and pixel checks.
//
// Waiting: prefer `until` (poll for the thing that should happen) and `settle` (let React and
// the canvas catch up after an input) over fixed sleeps, so tests are quick and don't depend
// on how busy the Mac is.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { _electron as electron, expect, test as base, type CDPSession, type ElectronApplication, type Page } from '@playwright/test'
import type { MenuCommand } from '../../src/shared/types'
import { grass, seedLibrary } from './seed'

const ROOT = path.resolve(__dirname, '../..')

export interface Dirs {
  /** The library folder the app opens. */
  library: string
  /** Electron's user data (settings, autosave), kept apart from the real app's. */
  userData: string
  /** Somewhere outside the library, standing in for Finder, Downloads, etc. */
  outside: string
}

type MouseType = 'mousePressed' | 'mouseMoved' | 'mouseReleased'
type Point = [number, number]
type Screen = 'Library' | 'Pixel Studio' | 'Image Editor'

/** Modifier bits for the DevTools protocol. */
export const ALT = 1
export const META = 4
export const SHIFT = 8

// ---------- DOM lookups (JavaScript snippets run in the page) ----------

export const byText = (sel: string, text: string): string =>
  `[...document.querySelectorAll('${sel}')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)}))`
export const byTip = (sel: string, tip: string): string =>
  `[...document.querySelectorAll('${sel}')].find(b => (b.getAttribute('title') || b.dataset.tip || '').startsWith(${JSON.stringify(tip)}))`
export const card = (name: string): string =>
  `[...document.querySelectorAll('.card')].find(c => c.querySelector('.card-name')?.textContent === ${JSON.stringify(name)})`
export const menuItem = (label: string): string =>
  `[...document.querySelectorAll('.menu-item')].find(b => b.querySelector('.menu-label').textContent.trim() === ${JSON.stringify(label)})`
export const sidebar = (label: string): string =>
  `[...document.querySelectorAll('.sidebar-entry')].find(e => e.querySelector('.entry-label')?.textContent === ${JSON.stringify(label)})`
/** A `w(ms)` sleep for use inside page snippets. */
const W = 'const w = ms => new Promise(r => setTimeout(r, ms));'
/** Sets a React-controlled input's value inside a page snippet, as if typed. */
const typeInto = (input: string, value: string): string =>
  `{ const i = ${input}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })) }`

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** One named check. Failures are recorded and the test carries on, so one run reports every problem. */
export async function check(name: string, ok: unknown, detail: unknown = ''): Promise<void> {
  await test.step(name, async () => {
    expect.soft(ok, detail === '' ? name : `${name} — got: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`).toBeTruthy()
  })
}

export class App {
  private constructor(
    public electron: ElectronApplication,
    public page: Page,
    private cdp: CDPSession,
    readonly dirs: Dirs
  ) {}

  static async launch(dirs: Dirs): Promise<App> {
    const env = { ...process.env, SPRITEBUILDER_USER_DATA: dirs.userData } as Record<string, string>
    delete env.ELECTRON_RUN_AS_NODE // set when run from some tools; it would start Electron as plain Node
    const app = await electron.launch({ args: [ROOT], cwd: ROOT, env })
    const page = await app.firstWindow()
    await page.waitForSelector('.rail-btn')
    await page.waitForFunction(`!document.querySelector('.loading')`)
    const cdp = await page.context().newCDPSession(page)
    const result = new App(app, page, cdp, dirs)
    // No test waits on a confirm() box; accept them all unless a test says otherwise.
    await result.js(`window.confirm = () => true; 1`)
    return result
  }

  /** Kills the app without warning (like a crash or power cut) and starts it again on the same library. */
  async crashAndRelaunch(): Promise<void> {
    this.electron.process().kill('SIGKILL')
    await new Promise((r) => this.electron.process().once('exit', r))
    const fresh = await App.launch(this.dirs)
    this.electron = fresh.electron
    this.page = fresh.page
    this.cdp = fresh.cdp
  }

  async close(): Promise<void> {
    if (this.electron.process().exitCode !== null || this.electron.process().signalCode !== null) return
    // Skip the "unsaved changes" question on the way out.
    await this.page.evaluate(`window.onbeforeunload = null`).catch(() => {})
    await this.electron.close().catch(() => this.electron.process().kill('SIGKILL'))
  }

  // ---------- low level ----------

  call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return this.cdp.send(method as 'Runtime.evaluate', params as never)
  }

  /** Runs a JavaScript expression in the page (promises are awaited) and returns its value. */
  async js<T = any>(expr: string): Promise<T> {
    const r = (await this.call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })) as {
      result: { value: T }
      exceptionDetails?: { text: string; exception?: { description?: string } }
    }
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }

  /** Runs a function in the Electron main process, e.g. to stand in for a native dialog. */
  main<A>(fn: (electron: typeof import('electron'), arg: A) => unknown, arg: A): Promise<unknown> {
    return this.electron.evaluate(fn as never, arg)
  }

  /** Sends a command from the app's menu bar (the same message a menu click sends). */
  menuCommand(command: MenuCommand): Promise<void> {
    return this.main(({ BrowserWindow }, c) => BrowserWindow.getAllWindows()[0].webContents.send('menu:command', c), command).then(() => this.settle())
  }

  wait = wait

  /**
   * Polls until `probe` gives something truthy (or the time runs out) and returns its last value,
   * so the check that follows can report what it saw.
   */
  async until<T>(probe: () => Promise<T> | T, timeout = 5000): Promise<T> {
    const end = Date.now() + timeout
    for (;;) {
      const value = await probe()
      if (value || Date.now() > end) return value
      await wait(40)
    }
  }

  /** `until` for a page expression. */
  untilJs<T = any>(expr: string, timeout?: number): Promise<T> {
    return this.until(() => this.js<T>(expr), timeout)
  }

  /**
   * Lets the page finish reacting to an input: waits for a frame, then until the page has no work
   * left (React's updates and the canvas redraw run first, however busy the Mac is), then a frame.
   */
  settle(): Promise<void> {
    return this.js(`new Promise(r => requestAnimationFrame(() => requestIdleCallback(() => requestAnimationFrame(() => r(1)), { timeout: 1000 })))`)
  }

  // ---------- mouse and keyboard ----------

  mouse(type: MouseType, [x, y]: Point, extra: Record<string, unknown> = {}): Promise<unknown> {
    return this.call('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra })
  }

  /** A click at window coordinates, with a hover first (menus and tooltips react to it). */
  async clickAt(x: number, y: number, button: 'left' | 'right' = 'left', modifiers = 0): Promise<void> {
    await this.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    for (const type of ['mousePressed', 'mouseReleased']) await this.call('Input.dispatchMouseEvent', { type, x, y, button, clickCount: 1, modifiers })
    await this.settle()
  }

  async hover(x: number, y: number): Promise<void> {
    await this.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await this.settle()
  }

  /** The centre of the element a snippet finds, in window coordinates. */
  centre(expr: string): Promise<Point> {
    return this.js(`(() => { const r = (${expr}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
  }

  async rightClick(expr: string): Promise<void> {
    const [x, y] = await this.centre(expr)
    await this.clickAt(x, y, 'right')
  }

  async dblclick(expr: string): Promise<void> {
    await this.js(`${expr}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
    await this.settle()
  }

  /**
   * An in-app drag from one element to another (layers, frames, folders). Returns whether the
   * target accepted it. `at` places the pointer, e.g. `{ clientY: 'top + 3' }`.
   */
  dragDrop(from: string, to: string, { at = {}, drop = true }: { at?: { clientX?: string; clientY?: string }; drop?: boolean } = {}): Promise<boolean> {
    const point = Object.entries(at).map(([k, v]) => `${k}: r.${v}`).join(', ')
    return this.js<boolean>(`(() => { const from = ${from}; const to = ${to}; const dt = new DataTransfer(); const r = to.getBoundingClientRect()
      from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
      const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, ${point} }); to.dispatchEvent(over)
      if (${drop}) to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, ${point} }))
      from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); return over.defaultPrevented })()`)
  }

  async key(key: string, code: string, modifiers = 0): Promise<void> {
    const windowsVirtualKeyCode = key.length === 1 ? key.toUpperCase().charCodeAt(0) : key === 'Escape' ? 27 : key === 'Enter' ? 13 : undefined
    await this.call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, windowsVirtualKeyCode })
    await this.call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers })
    await this.settle()
  }

  /** Picks a Pixel Studio tool by its shortcut letter. */
  tool(letter: string): Promise<void> {
    return this.key(letter, 'Key' + letter.toUpperCase())
  }

  // ---------- screens and menus ----------

  /** Switches screen with the sidebar on the left. */
  async goTo(screen: Screen): Promise<void> {
    await this.js(`${byTip('.rail-btn', screen)}.click()`)
    await this.untilJs(`document.querySelector('.rail-btn.active')?.getAttribute('title') === ${JSON.stringify(screen)}`)
    await this.settle()
  }

  /** Closes an open dropdown menu by clicking beside it. */
  async closeMenu(): Promise<void> {
    await this.js(`document.querySelector('.menu-scrim')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); 1`)
    await this.settle()
    // When the menu's backdrop disappears under the (still) mouse, Chromium sends a made-up mouse
    // move shortly after to refresh hover effects, sometimes with an out-of-date position. Let it
    // pass before the next drag, or it lands in the middle of that drag as a stray step.
    await this.wait(150)
    await this.settle()
  }

  // ---------- Pixel Studio ----------

  private geo = { left: 0, top: 0, zoom: 1 }
  /** The sprite's size in pixels, from the last regeo(); actions re-measure the canvas with it. */
  private size = 16

  /**
   * Re-reads where the sprite canvas is on screen; call after it changes size or moves.
   * Waits until it has stopped moving (it settles into place a moment after it appears).
   */
  async regeo(size: number): Promise<void> {
    this.size = size
    this.geo = await this.untilJs(`(async () => {
      const box = () => { const r = document.querySelector('.pixel-canvas')?.getBoundingClientRect(); return r ? [r.left, r.top, r.width].join() : '' }
      const first = box()
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      const r = document.querySelector('.pixel-canvas')?.getBoundingClientRect()
      return r && r.width === ${size} * Math.round(r.width / ${size}) && box() === first ? { left: r.left, top: r.top, zoom: r.width / ${size} } : null })()`)
  }

  /** The window position of a sprite pixel's centre. */
  cell(x: number, y: number): Point {
    return [this.geo.left + (x + 0.5) * this.geo.zoom, this.geo.top + (y + 0.5) * this.geo.zoom]
  }

  /** The window position of the corner between pixels at (x, y) — where selection handles sit. */
  corner(x: number, y: number): Point {
    return [this.geo.left + x * this.geo.zoom, this.geo.top + y * this.geo.zoom]
  }

  /** Presses at one window point, moves through the others and lets go there. Measure the points just before. */
  async drag(points: Point[], modifiers = 0): Promise<void> {
    await this.mouse('mouseMoved', points[0], { buttons: 0 })
    await this.mouse('mousePressed', points[0], { modifiers })
    for (const p of points.slice(1)) await this.mouse('mouseMoved', p, { modifiers })
    await this.mouse('mouseReleased', points.at(-1)!, { modifiers })
    await this.settle()
  }

  /** Re-reads the canvas position before an action (the layout around it can shift a little). */
  async remeasure(): Promise<void> {
    this.geo = await this.js(
      `(() => { const r = document.querySelector('.pixel-canvas').getBoundingClientRect(); return { left: r.left, top: r.top, zoom: r.width / ${this.size} } })()`
    )
  }

  async dragCells(from: Point, to: Point, modifiers = 0): Promise<void> {
    await this.remeasure()
    await this.mouse('mousePressed', this.cell(...from), { modifiers })
    await this.mouse('mouseMoved', this.cell(((from[0] + to[0]) / 2) | 0, ((from[1] + to[1]) / 2) | 0), { modifiers })
    await this.mouse('mouseMoved', this.cell(...to), { modifiers })
    // Say where the pointer is once more just before letting go, in case a made-up hover move
    // with an old position slipped in (see closeMenu); shapes and selections use the last position.
    await this.settle()
    await this.mouse('mouseMoved', this.cell(...to), { modifiers })
    await this.mouse('mouseReleased', this.cell(...to), { modifiers })
    await this.settle()
  }

  click(x: number, y: number, modifiers = 0): Promise<void> {
    return this.dragCells([x, y], [x, y], modifiers)
  }

  /** The colour shown at a sprite pixel, like '#ff0000', or 'empty'. */
  px(x: number, y: number): Promise<string> {
    return this.js(
      `(() => { const c = document.querySelector('.pixel-canvas'); const z = c.getBoundingClientRect().width / ${this.size}; const d = devicePixelRatio; const r = c.getContext('2d').getImageData(Math.round((${x + 0.5}) * z * d), Math.round((${y + 0.5}) * z * d), 1, 1).data; return r[3] === 0 ? 'empty' : '#' + [r[0], r[1], r[2]].map(v => v.toString(16).padStart(2, '0')).join('') })()`
    )
  }

  /** Starts a new square sprite in Pixel Studio. */
  async newSprite(size: number): Promise<void> {
    await this.js(`window.confirm = () => true; document.activeElement?.blur(); 1`)
    await this.goTo('Pixel Studio')
    await this.js(`${byText('.studio-bar .btn', 'New')}?.click(); 1`)
    await this.untilJs(`!!document.querySelector('.preset')`)
    await this.js(`[...document.querySelectorAll('.preset')].find(p => p.textContent === '${size}×${size}').click()`)
    await this.settle()
    await this.js(`[...document.querySelectorAll('.btn')].find(b => b.textContent === 'Create').click()`)
    await this.untilJs(`!document.querySelector('.preset') && document.querySelector('.canvas-info dd')?.textContent === '${size}×${size}'`)
    await this.settle()
    await this.regeo(size)
  }

  /** Undo and Redo through the toolbar buttons: ⌘Z belongs to the app menu, which these events don't reach. */
  async undo(): Promise<void> {
    await this.js(`${byTip('.studio-bar button', 'Undo')}.click()`)
    await this.settle()
  }

  async redo(): Promise<void> {
    await this.js(`${byTip('.studio-bar button', 'Redo')}.click()`)
    await this.settle()
  }

  async addFrame(): Promise<void> {
    await this.js(`${byTip('.timeline button', 'New empty frame')}.click()`)
    await this.settle()
  }

  /** Export ▸ Sprite sheet… */
  async openSheetDialog(): Promise<void> {
    await this.js(`${byText('.studio-bar .btn', 'Export')}.click()`)
    await this.settle()
    await this.js(`${byText('.dropdown-item', 'Sprite sheet')}.click()`)
    await this.untilJs(`!!document.querySelector('.sheet-dialog')`)
  }

  /** Sets the front (drawing) colour. */
  async setColour(hex: string): Promise<void> {
    await this.js(`(() => { const i = document.querySelector('.swatch-big.primary input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(hex)}); i.dispatchEvent(new Event('input', { bubbles: true })); return 1 })()`)
    await this.settle()
  }

  docInfo(): Promise<string | undefined> {
    return this.js(`document.querySelector('.canvas-info dd')?.textContent`)
  }

  // ---------- Image Editor ----------

  /** Opens a library image from the Image Editor's picker. */
  async openInEditor(file: string): Promise<void> {
    await this.goTo('Image Editor')
    await this.js(`${byText('.studio-bar .btn', 'Open')}?.click(); 1`)
    await this.untilJs(`!!${byTip('.picker-grid .card', file)}`)
    await this.js(`${byTip('.picker-grid .card', file)}.click()`)
    await this.untilJs(`(document.querySelector('.doc-name')?.textContent ?? '').startsWith(${JSON.stringify(file)})`)
    await this.settle()
  }

  /** The Image Editor's size readout, like '32×8 px'. */
  editorSize(): Promise<string> {
    return this.js(`document.querySelector('.editor-status span').textContent.trim()`)
  }

  // ---------- forms and dialogs ----------

  /** Fills in the open prompt (name, and optionally folder and new-folder name), confirms it, and waits for it to close. */
  async answer(text: string, { folder, newFolder }: { folder?: string; newFolder?: string } = {}): Promise<string | undefined> {
    await this.untilJs(`!!document.querySelector('.modal input')`)
    const label = await this.js<string | undefined>(`(async () => { ${W}
      ${folder === undefined ? '' : `const s = document.querySelector('.modal select'); s.value = ${folder === 'new' ? 's.options[s.options.length - 1].value' : JSON.stringify(folder)}; s.dispatchEvent(new Event('change', { bubbles: true })); await w(50)`}
      ${typeInto(`document.querySelectorAll('.modal input')[0]`, text)}
      ${newFolder === undefined ? '' : typeInto(`document.querySelectorAll('.modal input')[1]`, newFolder)}
      await w(50); const label = document.querySelector('.modal p')?.textContent
      document.querySelector('.modal button[type=submit]').click(); return label })()`)
    await this.untilJs(`!document.querySelector('.modal input')`)
    await this.settle()
    return label
  }

  /** Sets a React-controlled input's value as if typed. */
  async setInput(selector: string, value: string): Promise<void> {
    await this.js(`(() => { ${typeInto(selector, value)}; return 1 })()`)
    await this.settle()
  }

  toasts(): Promise<string> {
    return this.js(`[...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')`)
  }

  /** Waits for a message containing `text` and returns all the messages shown. */
  async toast(text: string): Promise<string> {
    await this.until(async () => (await this.toasts()).includes(text))
    return this.toasts()
  }

  /** Makes the next native Save dialogs answer with these paths, in order. */
  async answerSaveDialogs(...files: string[]): Promise<void> {
    await this.main(({ dialog }, answers) => {
      dialog.showSaveDialog = (async () => {
        const filePath = answers.shift()
        return filePath ? { canceled: false, filePath } : { canceled: true, filePath: '' }
      }) as typeof dialog.showSaveDialog
    }, files)
  }

  /** Makes the next native Open dialogs answer with these paths, in order. */
  async answerOpenDialogs(...picks: string[]): Promise<void> {
    await this.main(({ dialog }, answers) => {
      dialog.showOpenDialog = (async () => {
        const pick = answers.shift()
        return pick ? { canceled: false, filePaths: [pick] } : { canceled: true, filePaths: [] }
      }) as typeof dialog.showOpenDialog
    }, picks)
  }

  // ---------- library ----------

  library(): Promise<{ root: string; folders: string[]; items: Array<{ path: string; name: string; folder: string; tags: string[]; favorite: boolean; width: number; height: number }> }> {
    return this.js(`window.api.getLibrary()`)
  }

  async has(p: string): Promise<boolean> {
    return (await this.library()).items.some((i) => i.path === p)
  }

  /** Waits for a library path to appear (or, with `present: false`, to go) and says whether it did. */
  async waitForItem(p: string, present = true): Promise<boolean> {
    return this.until(async () => (await this.has(p)) === present)
  }

  /** Library paths whose file name starts with `prefix`, sorted. */
  async files(prefix: string): Promise<string[]> {
    return (await this.library()).items.filter((i) => i.name.startsWith(prefix)).map((i) => i.path).sort()
  }

  /** Copies a library image to a new name in the library root (through the app, like an import). */
  async importCopy(from: string, name: string): Promise<void> {
    // The import finishes once the file is in the library, so no extra waiting is needed.
    await this.js(`(async () => { await window.api.importData('', [{ name: ${JSON.stringify(name)}, data: new Uint8Array(await (await fetch('sprite://library/${from}')).arrayBuffer()) }]); return 1 })()`)
  }

  /** The Library tab, showing All Images as a grid (and, if given, waits for that image's card). */
  async showAll(file?: string): Promise<void> {
    await this.goTo('Library')
    await this.js(`${sidebar('All Images')}.click()`)
    await this.untilJs(`document.querySelector('.lib-header h1')?.textContent === 'All Images'`)
    await this.js(`document.querySelector('[title="Grid view"], [data-tip="Grid view"]')?.click(); 1`)
    await this.untilJs(file ? `!!${card(file)}` : `!!document.querySelector('.card')`)
    await this.settle()
  }
}

/** Every test gets its own app on its own freshly made library, so tests never affect each other. */
export const test = base.extend<{ app: App }>({
  app: async ({}, use, testInfo) => {
    const base = testInfo.outputPath('run')
    const dirs: Dirs = { library: path.join(base, 'library'), userData: path.join(base, 'userdata'), outside: path.join(base, 'outside') }
    await seedLibrary(dirs.library)
    await mkdir(dirs.userData, { recursive: true })
    await mkdir(dirs.outside, { recursive: true })
    await writeFile(path.join(dirs.userData, 'settings.json'), JSON.stringify({ libraryRoot: dirs.library }))
    await writeFile(path.join(dirs.outside, 'from-finder.png'), grass())
    const app = await App.launch(dirs)
    await use(app)
    await app.close()
  }
})
