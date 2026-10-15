# SpriteBuilder

A Mac desktop app for keeping a sprite library, drawing 8-bit pixel art, and (soon) editing images.

## Run it

```sh
npm install
npm run dev      # app with live reload
npm test         # unit tests
npm run dist     # build a .dmg into dist/
```

## Where things live

- **Library**: a normal folder, by default `~/Pictures/SpriteBuilder Library/` (change it at the bottom
  of the Library sidebar). Library folders are real folders, so a game engine can point straight at them.
- **Metadata** (tags, favourites, ratings, notes, measured sizes) is in `.spritebuilder/library.json`
  inside the library folder. Files moved or renamed in Finder lose their metadata. Moves done in the app keep it.
- **Pixel Studio sprites** are saved as `name.png` plus an editable `name.sprite.json` next to it.
- Deleting in the app moves files to the macOS Trash.

## Code map

- `src/main/` — Electron main process: window, `sprite://` file protocol, IPC, `library.ts` (all disk access)
- `src/preload/` — typed bridge exposed to the UI as `window.api`
- `src/shared/` — types and helpers shared by both sides
- `src/renderer/src/library/` — Library screen; `filter.ts` holds filter and sort logic
- `src/renderer/src/studio/` — Pixel Studio; `model.ts` is the sprite file format, `raster.ts` the pixel operations

## Status

All six phases of the plan are done:
- **Library:**
  - Folders with drag-and-drop, tags, filters and search, with sections per subfolder.
  - Right-click menus.
  - Backup and restore as a .zip (File menu, or ⋯ next to Change Folder).
- **Pixel Studio:**
  - Drawing tools, layers, animation with named tags, and canvas resize.
  - Saved and imported palettes, and GIF import.
  - GIF and sprite-sheet export.
  - Autosave with crash recovery.
- **Image Editor:** crop, resize, adjustments, colour tools and a sprite-sheet slicer.
- **Everywhere:**
  - A keyboard shortcuts sheet (press `?`).
  - A System / Dark / Light theme switch at the bottom of the left rail.

To install the app into /Applications after changing the code, run `npm run install-app`.

## Data files

- `<library>/.spritebuilder/library.json`: tags, notes and other per-image details.
- `<library>/.spritebuilder/palettes.json`: your saved palettes.
- `~/Library/Application Support/spritebuilder/recovery/`: the Pixel Studio autosave, used only after a crash.
