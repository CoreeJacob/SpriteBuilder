// Launches SpriteBuilder on a fresh library and drives it the way a person would:
// real mouse and keyboard events through the DevTools protocol, plus DOM and pixel checks.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { _electron as electron, expect, test as base, type CDPSession, type ElectronApplication, type Page } from '@playwright/test'
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

/** Modifier bits for the DevTools protocol. */
export const ALT = 1
export const CTRL = 2
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
export const W = 'const w = ms => new Promise(r => setTimeout(r, ms));'

export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

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

  wait = wait

  // ---------- mouse and keyboard ----------

  mouse(type: MouseType, [x, y]: Point, extra: Record<string, unknown> = {}): Promise<unknown> {
    return this.call('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra })
  }

  /** A click at window coordinates, with a hover first (menus and tooltips react to it). */
  async clickAt(x: number, y: number, button: 'left' | 'right' = 'left', modifiers = 0): Promise<void> {
    await this.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    for (const type of ['mousePressed', 'mouseReleased']) await this.call('Input.dispatchMouseEvent', { type, x, y, button, clickCount: 1, modifiers })
    await wait(150)
  }

  async hover(x: number, y: number): Promise<void> {
    await this.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await wait(150)
  }

  /** The centre of the element a snippet finds, in window coordinates. */
  centre(expr: string): Promise<Point> {
    return this.js(`(() => { const r = (${expr}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
  }

  async key(key: string, code: string, modifiers = 0): Promise<void> {
    const windowsVirtualKeyCode = key.length === 1 ? key.toUpperCase().charCodeAt(0) : key === 'Escape' ? 27 : key === 'Enter' ? 13 : undefined
    await this.call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, windowsVirtualKeyCode })
    await this.call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers })
    await wait(80)
  }

  /** Picks a Pixel Studio tool by its shortcut letter. */
  tool(letter: string): Promise<void> {
    return this.key(letter, 'Key' + letter.toUpperCase())
  }

  // ---------- Pixel Studio canvas ----------

  private geo = { left: 0, top: 0, zoom: 1 }

  /** Re-reads where the sprite canvas is on screen; call after it changes size or moves. */
  async regeo(size: number): Promise<void> {
    this.geo = await this.js(
      `(() => { const r = document.querySelector('.pixel-canvas').getBoundingClientRect(); return { left: r.left, top: r.top, zoom: r.width / ${size} } })()`
    )
  }

  /** The window position of a sprite pixel's centre. */
  cell(x: number, y: number): Point {
    return [this.geo.left + (x + 0.5) * this.geo.zoom, this.geo.top + (y + 0.5) * this.geo.zoom]
  }

  async dragCells(from: Point, to: Point, modifiers = 0): Promise<void> {
    await this.mouse('mousePressed', this.cell(...from), { modifiers })
    await this.mouse('mouseMoved', this.cell(((from[0] + to[0]) / 2) | 0, ((from[1] + to[1]) / 2) | 0), { modifiers })
    await this.mouse('mouseMoved', this.cell(...to), { modifiers })
    await this.mouse('mouseReleased', this.cell(...to), { modifiers })
    await wait(80)
  }

  click(x: number, y: number, modifiers = 0): Promise<void> {
    return this.dragCells([x, y], [x, y], modifiers)
  }

  /** The colour shown at a sprite pixel, like '#ff0000', or 'empty'. */
  px(x: number, y: number): Promise<string> {
    const { zoom } = this.geo
    return this.js(
      `(() => { const c = document.querySelector('.pixel-canvas'); const d = devicePixelRatio; const r = c.getContext('2d').getImageData(Math.round((${(x + 0.5) * zoom}) * d), Math.round((${(y + 0.5) * zoom}) * d), 1, 1).data; return r[3] === 0 ? 'empty' : '#' + [r[0], r[1], r[2]].map(v => v.toString(16).padStart(2, '0')).join('') })()`
    )
  }

  /** Starts a new square sprite in Pixel Studio. */
  async newSprite(size: number): Promise<void> {
    await this.js(`window.confirm = () => true; document.activeElement?.blur(); 1`)
    await this.js(`(async () => { ${W} ;[...document.querySelectorAll('.rail-btn')][1].click(); await w(300)
      const n = ${byText('.studio-bar .btn', 'New')}; if (n) { n.click(); await w(200) }
      ;[...document.querySelectorAll('.preset')].find(p => p.textContent === '${size}×${size}').click(); await w(120)
      ;[...document.querySelectorAll('.btn')].find(b => b.textContent === 'Create').click(); return 1 })()`)
    await wait(300)
    await this.regeo(size)
  }

  /** Undo and Redo through the toolbar buttons: ⌘Z belongs to the app menu, which these events don't reach. */
  async undo(): Promise<void> {
    await this.js(`${byTip('.studio-bar button', 'Undo')}.click()`)
    await wait(150)
  }

  async redo(): Promise<void> {
    await this.js(`${byTip('.studio-bar button', 'Redo')}.click()`)
    await wait(150)
  }

  docInfo(): Promise<string | undefined> {
    return this.js(`document.querySelector('.canvas-info dd')?.textContent`)
  }

  // ---------- forms and dialogs ----------

  /** Types into the open prompt's text box and confirms it. */
  async answer(text: string): Promise<void> {
    await wait(200)
    await this.js(`(async () => { const i = document.querySelector('.modal input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 80)); document.querySelector('.modal button[type=submit]').click(); return 1 })()`)
    await wait(600)
  }

  /** Sets a React-controlled input's value as if typed. */
  async setInput(selector: string, value: string): Promise<void> {
    await this.js(`(async () => { const i = ${selector}; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 80)); return 1 })()`)
  }

  toasts(): Promise<string> {
    return this.js(`[...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')`)
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

  /** Library paths whose file name starts with `prefix`, sorted. */
  async files(prefix: string): Promise<string[]> {
    return (await this.library()).items.filter((i) => i.name.startsWith(prefix)).map((i) => i.path).sort()
  }

  /** Copies a library image to a new name in the library root (through the app, like an import). */
  async importCopy(from: string, name: string): Promise<void> {
    await this.js(`(async () => { ${W} await window.api.importData('', [{ name: ${JSON.stringify(name)}, data: new Uint8Array(await (await fetch('sprite://library/${from}')).arrayBuffer()) }]); await w(500); return 1 })()`)
  }

  /** The Library tab, showing All Images as a grid. */
  async showAll(): Promise<void> {
    await this.js(`(async () => { ${W} ;[...document.querySelectorAll('.rail-btn')][0].click(); await w(300); ${sidebar('All Images')}.click(); await w(300); document.querySelector('[title="Grid view"], [data-tip="Grid view"]')?.click(); await w(200); return 1 })()`)
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

export { expect }
