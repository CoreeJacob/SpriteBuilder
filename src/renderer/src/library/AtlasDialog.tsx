import { useEffect, useMemo, useState } from 'react'
import { basenameRel, dirnameRel, isValidName, joinRel, stripExt } from '@shared/paths'
import type { AtlasOptions, AtlasRecipe } from '@shared/types'
import { PixelPreview } from '@/app/PixelPreview'
import { attempt, useApp } from '@/app/store'
import { pixelsToPng } from '@/lib/canvas'
import { atlasJson, buildAtlas, DEFAULT_ATLAS_OPTIONS } from './atlas'
import { collectAtlasInput, type AtlasInput } from './atlasSources'

const MAX_SIZES = [256, 512, 1024, 2048, 4096]
const PADDINGS = [0, 1, 2, 4, 8]
const PREVIEW_W = 560
const PREVIEW_H = 280

/**
 * Packs every image in a folder into one atlas PNG plus JSON. The settings are remembered, so
 * packing the folder again (after adding sprites, say) is "Repack" with nothing to fill in.
 */
export function AtlasDialog({ folder, onClose }: { folder: string; onClose: () => void }) {
  const library = useApp((s) => s.library)!
  const [atlases, setAtlases] = useState<Record<string, AtlasRecipe> | null>(null)
  const [options, setOptions] = useState<AtlasOptions>(DEFAULT_ATLAS_OPTIONS)
  const [name, setName] = useState(`${basenameRel(folder) || 'Library'}-atlas`)
  // Saved next to the folder rather than inside it, by default.
  const [outFolder, setOutFolder] = useState(dirnameRel(folder))
  const [input, setInput] = useState<AtlasInput | null>(null)
  const [busy, setBusy] = useState(false)
  const recipe = atlases?.[folder] ?? null
  const where = folder || 'Library'

  // Start from this folder's last atlas, if it has one.
  useEffect(() => {
    void window.api.getAtlases().then((all) => {
      setAtlases(all)
      const previous = all[folder]
      if (!previous) return
      setOptions({ ...DEFAULT_ATLAS_OPTIONS, ...previous.options })
      setName(stripExt(basenameRel(previous.output)))
      setOutFolder(dirnameRel(previous.output))
    })
  }, [folder])

  useEffect(() => {
    if (!atlases) return
    let current = true
    setInput(null)
    const skip = Object.values(atlases).map((r) => r.output)
    void collectAtlasInput(library.items, folder, options.includeSubfolders, skip).then((found) => current && setInput(found))
    return () => {
      current = false
    }
  }, [atlases, library.items, folder, options.includeSubfolders])

  const atlas = useMemo(() => (input?.sprites.length ? buildAtlas(input.sprites, options) : null), [input, options])
  const set = (patch: Partial<AtlasOptions>): void => setOptions((o) => ({ ...o, ...patch }))
  const output = joinRel(outFolder, `${name.trim()}.png`)
  const filled = atlas ? Math.round((atlas.frames.reduce((a, f) => a + f.frame.w * f.frame.h, 0) / (atlas.width * atlas.height)) * 100) : 0

  const save = async (): Promise<void> => {
    if (!atlas || !input) return
    const app = useApp.getState()
    const replacing = output !== recipe?.output && library.items.some((i) => i.path === output)
    if (replacing && !window.confirm(`“${output}” already exists. Replace it?`)) return
    setBusy(true)
    try {
      const png = await pixelsToPng(atlas.pixels, atlas.width, atlas.height)
      const json = atlasJson(atlas, `${name.trim()}.png`, input.tags)
      const saved = await attempt(() => window.api.saveAtlas(folder, { output, options }, png, json))
      if (!saved) return
      app.select([saved])
      app.notify(`Packed ${atlas.frames.length} sprite${atlas.frames.length === 1 ? '' : 's'} into ${basenameRel(saved)} (${atlas.width}×${atlas.height}) and its .json`)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const problem = !input
    ? null
    : !input.sprites.length
      ? `There are no images in “${where}”${options.includeSubfolders ? '' : ' (try including subfolders)'}.`
      : !atlas
        ? `These don’t fit in ${options.maxSize}×${options.maxSize}. Try a bigger size or less padding.`
        : null

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal atlas-dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2>{recipe ? 'Repack' : 'Pack'} “{where}” into an Atlas</h2>
        <p className="muted small">
          One image holding every sprite, plus a .json file that says where each one is (the same format as sprite sheets, which game engines read).
          {recipe && ' These are the settings it was packed with last time.'}
        </p>

        <div className="sheet-preview checker atlas-preview">
          {atlas ? <PixelPreview pixels={atlas.pixels} width={atlas.width} height={atlas.height} maxW={PREVIEW_W} maxH={PREVIEW_H} /> : <span className="muted">{input ? '' : 'Reading images…'}</span>}
        </div>
        <p className="muted small atlas-stats">
          {atlas && input
            ? `${atlas.frames.length} sprite${atlas.frames.length === 1 ? '' : 's'} from ${input.images} image${input.images === 1 ? '' : 's'} · ${atlas.width}×${atlas.height} px · ${filled}% filled`
            : ' '}
          {input?.skipped.length ? ` · skipped ${input.skipped.join(', ')}` : ''}
        </p>
        {problem && <p className="error small">{problem}</p>}

        <div className="sheet-options">
          <div className="field">
            <span>Largest size</span>
            <div className="filter-options">
              {MAX_SIZES.map((n) => (
                <button key={n} className={`chip ${options.maxSize === n ? 'on' : ''}`} onClick={() => set({ maxSize: n })}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Gap between sprites</span>
            <div className="filter-options">
              {PADDINGS.map((n) => (
                <button key={n} className={`chip ${options.padding === n ? 'on' : ''}`} onClick={() => set({ padding: n })}>
                  {n}px
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="atlas-checks">
          <label className="check">
            <input type="checkbox" checked={options.trim} onChange={(e) => set({ trim: e.target.checked })} />
            Trim empty edges (the .json keeps each sprite’s full size)
          </label>
          <label className="check">
            <input type="checkbox" checked={options.powerOfTwo} onChange={(e) => set({ powerOfTwo: e.target.checked })} />
            Power-of-two size (64, 128, 256…), for engines that need it
          </label>
          <label className="check">
            <input type="checkbox" checked={options.includeSubfolders} onChange={(e) => set({ includeSubfolders: e.target.checked })} />
            Include subfolders
          </label>
        </div>

        <div className="resize-grid atlas-output">
          <label className="field">
            <span>Save as</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>In</span>
            <select className="select" value={outFolder} onChange={(e) => setOutFolder(e.target.value)}>
              <option value="">Library</option>
              {library.folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !atlas || !isValidName(name)} onClick={() => void save()}>
            {recipe && recipe.output === output ? 'Repack' : 'Pack'}
          </button>
        </div>
      </div>
    </div>
  )
}
