import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron'
import { basenameRel, withSheetImage } from '@shared/paths'
import {
  IMAGE_EXTENSIONS,
  type ComputedMeta,
  type EditableMeta,
  type ImportedFile,
  type LibrarySnapshot,
  type MenuCommand,
  type SavedPalette,
  type SaveSpriteRequest
} from '@shared/types'
import { createBackup, restoreBackup } from './backup'
import { exists } from './files'
import { Library } from './library'
import { Recovery } from './recovery'

// Library files are served to the UI as sprite://library/<relative path>.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'sprite',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
  }
])

// Lets a test run use its own settings (and so its own library) instead of yours.
if (process.env['SPRITEBUILDER_USER_DATA']) app.setPath('userData', process.env['SPRITEBUILDER_USER_DATA'])

interface Settings {
  libraryRoot?: string
}

const settingsFile = (): string => path.join(app.getPath('userData'), 'settings.json')

async function loadSettings(): Promise<Settings> {
  try {
    return JSON.parse(await fs.readFile(settingsFile(), 'utf8'))
  } catch {
    return {}
  }
}

async function saveSettings(settings: Settings): Promise<void> {
  await fs.mkdir(path.dirname(settingsFile()), { recursive: true })
  await fs.writeFile(settingsFile(), JSON.stringify(settings, null, 2))
}

let mainWindow: BrowserWindow | null = null
let recovery: Recovery
let library: Library | null = null

const broadcast = (snapshot: LibrarySnapshot): void => {
  mainWindow?.webContents.send('library:changed', snapshot)
}

async function openLibrary(root: string): Promise<Library> {
  library?.close()
  library = await Library.open(root, broadcast)
  return library
}

function lib(): Library {
  if (!library) throw new Error('The library is not open yet')
  return library
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    title: 'SpriteBuilder',
    backgroundColor: '#14151a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // The UI sets onbeforeunload while a drawing has unsaved changes.
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: 'warning',
      buttons: ['Discard Changes', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'You have unsaved changes.',
      detail: 'If you leave now, those changes are lost.'
    })
    if (choice === 0) {
      // Discarding on purpose: don't offer to bring this work back next time.
      void recovery.clear()
      event.preventDefault()
    }
  })

  // Open external links in the browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function buildMenu(): void {
  const send = (command: MenuCommand) => () => mainWindow?.webContents.send('menu:command', command)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      {
        label: 'File',
        submenu: [
          { label: 'Back Up Library…', click: send('backup') },
          { label: 'Restore Library from Backup…', click: send('restore') },
          { type: 'separator' },
          { role: 'close' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
          { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: send('redo') },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: send('selectAll') },
          { type: 'separator' },
          // The keys are only shown here; each screen handles them itself, so typing a capital
          // letter in a text box never flips anything.
          { label: 'Flip Horizontally', accelerator: 'Shift+H', registerAccelerator: false, click: send('flipH') },
          { label: 'Flip Vertically', accelerator: 'Shift+V', registerAccelerator: false, click: send('flipV') },
          { label: 'Rotate 90° Right', accelerator: 'Shift+R', registerAccelerator: false, click: send('rotateCW') },
          { label: 'Rotate 90° Left', accelerator: 'Alt+Shift+R', registerAccelerator: false, click: send('rotateCCW') }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      { role: 'windowMenu' },
      {
        role: 'help',
        submenu: [{ label: 'Keyboard Shortcuts', accelerator: 'CmdOrCtrl+/', click: send('shortcuts') }]
      }
    ])
  )
}

function registerProtocol(): void {
  protocol.handle('sprite', async (request) => {
    const rel = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '')
    try {
      const response = await net.fetch(pathToFileURL(lib().abs(rel)).toString())
      // Allow canvas pixel reads (getImageData) on library images.
      const headers = new Headers(response.headers)
      headers.set('Access-Control-Allow-Origin', '*')
      headers.set('Cache-Control', 'no-cache')
      return new Response(response.body, { status: response.status, headers })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function registerIpc(): void {
  const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void => {
    ipcMain.handle(channel, (_event, ...args) => fn(...(args as A)))
  }

  handle('library:get', () => lib().getSnapshot())

  handle('library:backup', async () => {
    const stamp = new Date().toISOString().slice(0, 10)
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Back Up Library',
      defaultPath: `SpriteBuilder Library ${stamp}.zip`,
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }]
    })
    if (result.canceled || !result.filePath) return null
    const backup = await createBackup(lib().root)
    await fs.writeFile(result.filePath, backup.zip)
    return { path: result.filePath, files: backup.files, bytes: backup.bytes }
  })

  handle('library:restore', async () => {
    const pick = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose a Library Backup',
      properties: ['openFile'],
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }]
    })
    if (pick.canceled || !pick.filePaths[0]) return null
    const zipPath = pick.filePaths[0]
    const where = await dialog.showOpenDialog(mainWindow!, {
      title: 'Where Should the Restored Library Go?',
      message: 'A new folder is made here for the restored library. Your current library is not changed.',
      buttonLabel: 'Restore Here',
      properties: ['openDirectory', 'createDirectory']
    })
    if (where.canceled || !where.filePaths[0]) return null
    // Always restore into a brand-new folder named after the backup.
    const base = path.basename(zipPath, path.extname(zipPath))
    let folder = path.join(where.filePaths[0], base)
    for (let n = 2; await exists(folder); n++) folder = path.join(where.filePaths[0], `${base} ${n}`)
    const restored = await restoreBackup(new Uint8Array(await fs.readFile(zipPath)), folder)
    const opened = await openLibrary(folder)
    await saveSettings({ ...(await loadSettings()), libraryRoot: opened.root })
    return { snapshot: opened.getSnapshot(), folder, files: restored.files }
  })

  handle('library:chooseRoot', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose Library Folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const opened = await openLibrary(result.filePaths[0])
    await saveSettings({ ...(await loadSettings()), libraryRoot: opened.root })
    return opened.getSnapshot()
  })

  handle('folder:create', (parent: string, name: string) => lib().createFolder(parent, name))
  handle('folder:rename', (folder: string, name: string) => lib().renameFolder(folder, name))
  handle('folder:move', (folder: string, dest: string) => lib().moveFolder(folder, dest))
  handle('folder:delete', (folder: string) => lib().deleteFolder(folder))

  handle('items:importFiles', async (dest: string, paths?: string[]) => {
    if (!paths) {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: 'Import Images',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Images', extensions: [...IMAGE_EXTENSIONS] }]
      })
      if (result.canceled) return []
      paths = result.filePaths
    }
    return lib().importFiles(dest, paths)
  })
  handle('items:importData', (dest: string, files: ImportedFile[]) => lib().importData(dest, files))
  handle('items:move', (paths: string[], dest: string) => lib().moveItems(paths, dest))
  handle('items:rename', (p: string, name: string) => lib().renameItem(p, name))
  handle('items:duplicate', (p: string) => lib().duplicateItem(p))
  handle('items:delete', (paths: string[]) => lib().deleteItems(paths))
  handle('items:updateMeta', (paths: string[], patch: Partial<EditableMeta>) => lib().updateMeta(paths, patch))
  handle('items:editTags', (paths: string[], add: string[], remove: string[]) => lib().editTags(paths, add, remove))
  handle('items:setComputed', (entries: ComputedMeta[]) => lib().setComputedMeta(entries))
  handle('items:replace', (p: string, data: Uint8Array) => lib().replaceItem(p, data))
  handle('items:reveal', (p: string) => shell.showItemInFolder(lib().abs(p)))
  handle('items:export', async (p: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, { defaultPath: basenameRel(p) })
    if (result.canceled || !result.filePath) return null
    await fs.copyFile(lib().abs(p), result.filePath)
    return result.filePath
  })

  handle('recovery:write', (content: string) => recovery.write(content))
  handle('recovery:read', () => recovery.read())
  handle('recovery:clear', () => recovery.clear())
  handle('palettes:list', () => lib().listPalettes())
  handle('palettes:save', (palette: SavedPalette) => lib().savePalette(palette))
  handle('palettes:delete', (name: string) => lib().deletePalette(name))
  handle('palettes:lospec', async (slug: string) => {
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('That doesn’t look like a Lospec palette name')
    const response = await net.fetch(`https://lospec.com/palette-list/${slug}.json`)
    if (!response.ok) throw new Error(`Lospec has no palette called “${slug}”`)
    const data = (await response.json()) as { name?: string; colors?: string[] }
    const colors = (data.colors ?? []).filter((c) => /^[0-9a-f]{6}$/i.test(c)).map((c) => `#${c.toLowerCase()}`)
    if (!colors.length) throw new Error('That palette has no colours')
    return { name: data.name || slug, colors }
  })
  handle('sprite:readProject', (p: string) => lib().readProject(p))
  handle('sprite:save', (request: SaveSpriteRequest) => lib().saveSprite(request))
  const saveAs = async (defaultName: string, filter: { name: string; extensions: string[] }): Promise<string | null> => {
    const result = await dialog.showSaveDialog(mainWindow!, { defaultPath: defaultName, filters: [filter] })
    return result.canceled || !result.filePath ? null : result.filePath
  }

  handle('sprite:exportPng', async (defaultName: string, data: Uint8Array) => {
    const file = await saveAs(defaultName, { name: 'PNG Image', extensions: ['png'] })
    if (file) await fs.writeFile(file, data)
    return file
  })
  handle('sprite:exportGif', async (defaultName: string, data: Uint8Array) => {
    const file = await saveAs(defaultName, { name: 'Animated GIF', extensions: ['gif'] })
    if (file) await fs.writeFile(file, data)
    return file
  })
  handle('sprite:exportSheet', async (defaultName: string, png: Uint8Array, json: string | null) => {
    const file = await saveAs(defaultName, { name: 'PNG Sprite Sheet', extensions: ['png'] })
    if (!file) return null
    await fs.writeFile(file, png)
    // The frame data goes next to the image with the same name, as engines expect.
    if (json !== null) await fs.writeFile(file.replace(/\.png$/i, '') + '.json', withSheetImage(json, path.basename(file)), 'utf8')
    return file
  })
  handle('sprite:saveSheetToLibrary', (folder: string, name: string, png: Uint8Array, json: string | null) =>
    lib().saveSheet(folder, name, png, json)
  )
}

app.whenReady().then(async () => {
  recovery = new Recovery(path.join(app.getPath('userData'), 'recovery'))
  const settings = await loadSettings()
  const root = settings.libraryRoot ?? path.join(app.getPath('pictures'), 'SpriteBuilder Library')
  try {
    await openLibrary(root)
  } catch (err) {
    // The saved folder may have been removed or renamed; fall back to the default.
    console.error('Could not open library at', root, err)
    await openLibrary(path.join(app.getPath('pictures'), 'SpriteBuilder Library'))
  }
  await saveSettings({ ...settings, libraryRoot: lib().root })

  registerProtocol()
  registerIpc()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => library?.close())
