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

Phases 1–3 of the plan are done: foundation, Library MVP, Pixel Studio MVP.
Next up: shapes, selection, mirror drawing, layers, animation and sprite-sheet export (phase 4), then the Image Editor (phase 5).
