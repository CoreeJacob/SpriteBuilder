// The user's own palettes, stored with the library (see Library.listPalettes).

import { create } from 'zustand'
import { attempt } from '@/app/store'
import type { Palette } from './palettes'

interface SavedPalettesState {
  list: Palette[]
  load(): Promise<void>
  save(palette: Palette): Promise<boolean>
  remove(name: string): Promise<void>
}

export const useSavedPalettes = create<SavedPalettesState>((set) => ({
  list: [],
  load: async () => set({ list: (await window.api.listPalettes().catch(() => [])) ?? [] }),
  save: async (palette) => {
    const list = await attempt(() => window.api.savePalette(palette))
    if (list) set({ list })
    return Boolean(list)
  },
  remove: async (name) => {
    const list = await attempt(() => window.api.deletePalette(name))
    if (list) set({ list })
  }
}))
