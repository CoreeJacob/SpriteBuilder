export interface Palette {
  name: string
  colors: string[]
}

const hex = (s: string): string[] => s.trim().split(/\s+/).map((c) => `#${c.toLowerCase()}`)

export const PALETTES: Palette[] = [
  {
    name: 'PICO-8',
    colors: hex(`000000 1D2B53 7E2553 008751 AB5236 5F574F C2C3C7 FFF1E8
                 FF004D FFA300 FFEC27 00E436 29ADFF 83769C FF77A8 FFCCAA`)
  },
  {
    name: 'NES',
    colors: hex(`000000 7C7C7C 0000FC 0000BC 4428BC 940084 A80020 A81000 881400 503000 007800 006800 005800 004058
                 BCBCBC 0078F8 0058F8 6844FC D800CC E40058 F83800 E45C10 AC7C00 00B800 00A800 00A844 008888
                 F8F8F8 3CBCFC 6888FC 9878F8 F878F8 F85898 F87858 FCA044 F8B800 B8F818 58D854 58F898 00E8D8 787878
                 FCFCFC A4E4FC B8B8F8 D8B8F8 F8B8F8 F8A4C0 F0D0B0 FCE0A8 F8D878 D8F878 B8F8B8 B8F8D8 00FCFC F8D8F8`)
  },
  {
    name: 'Game Boy',
    colors: hex(`0F380F 306230 8BAC0F 9BBC0F`)
  },
  {
    name: 'Commodore 64',
    colors: hex(`000000 FFFFFF 68372B 70A4B2 6F3D86 588D43 352879 B8C76F
                 6F4F25 433900 9A6759 444444 6C6C6C 9AD284 6C5EB5 959595`)
  },
  {
    name: 'Endesga 32',
    colors: hex(`BE4A2F D77643 EAD4AA E4A672 B86F50 733E39 3E2731 A22633
                 E43B44 F77622 FEAE34 FEE761 63C74D 3E8948 265C42 193C3E
                 124E89 0099DB 2CE8F5 FFFFFF C0CBDC 8B9BB4 5A6988 3A4466
                 262B44 181425 FF0044 68386C B55088 F6757A E8B796 C28569`)
  }
]

export const DEFAULT_PALETTE = PALETTES[0]

// ---------- importing ----------

const hex6 = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`

/**
 * Reads a palette file: .hex (Lospec), .gpl (GIMP/Aseprite), .pal (JASC) or .txt
 * (Paint.NET). Anything else is searched for hex colours.
 */
export function parsePaletteFile(fileName: string, text: string): Palette {
  const stem = fileName.replace(/\.[^.]+$/, '')
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const colors: string[] = []
  let name = stem

  if (lines[0]?.startsWith('GIMP Palette')) {
    for (const line of lines.slice(1)) {
      const named = line.match(/^Name:\s*(.+)$/i)
      if (named) name = named[1].trim()
      const rgb = line.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/)
      if (rgb) colors.push(hex6(+rgb[1], +rgb[2], +rgb[3]))
    }
  } else if (lines[0] === 'JASC-PAL') {
    for (const line of lines.slice(3)) {
      const rgb = line.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/)
      if (rgb) colors.push(hex6(+rgb[1], +rgb[2], +rgb[3]))
    }
  } else {
    for (const line of lines) {
      if (line.startsWith(';')) continue // Paint.NET comments
      const argb = line.match(/^[0-9a-f]{2}([0-9a-f]{6})$/i) // Paint.NET writes AARRGGBB
      if (argb) {
        colors.push(`#${argb[1].toLowerCase()}`)
        continue
      }
      for (const m of line.matchAll(/#?\b([0-9a-f]{6})\b/gi)) colors.push(`#${m[1].toLowerCase()}`)
    }
  }
  const unique = [...new Set(colors)].slice(0, 256)
  if (!unique.length) throw new Error(`No colours found in ${fileName}`)
  return { name, colors: unique }
}

/** "https://lospec.com/palette-list/sweetie-16", "Sweetie 16" or "sweetie-16" → "sweetie-16". */
export function lospecSlug(input: string): string {
  const fromUrl = input.match(/palette-list\/([^/?#.]+)/i)
  return (fromUrl ? fromUrl[1] : input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
