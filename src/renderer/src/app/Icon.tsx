// Small stroke icons (24×24 grid) drawn inline so the app needs no icon font.

const PATHS = {
  library: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  editor: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6',
  studio: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM16 10h4v4h-4zM10 16h4v4h-4z',
  folder: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z',
  folderPlus: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5zM12 10v6M9 13h6',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z',
  all: 'M4 6h16M4 12h16M4 18h16',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  import: 'M12 3v12M7 10l5 5 5-5M4 19h16',
  export: 'M12 15V3M7 8l5-5 5 5M4 19h16',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  pencil: 'M15 4l5 5L9 20H4v-5zM13 6l5 5',
  eraser: 'M8 20h12M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8.5z',
  fill: 'M5 11l7-7 7 7-7 7zM19 15s2 2.4 2 3.5a2 2 0 0 1-4 0c0-1.1 2-3.5 2-3.5zM3 21h12',
  eyedropper: 'M14 4l6 6M17 7l-9.5 9.5L4 20l3.5-3.5M11 6l7 7',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  save: 'M5 4h11l4 4v12H5zM8 4v5h8V4M8 20v-6h8v6',
  swap: 'M7 4L4 7l3 3M4 7h12M17 14l3 3-3 3M20 17H8',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  reveal: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  filter: 'M4 5h16l-6 8v6l-4 2v-8z',
  chevron: 'M9 6l6 6-6 6',
  tile: 'M4 4h16v16H4zM9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16',
  zoomIn: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20M10.5 8v5M8 10.5h5',
  zoomOut: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20M8 10.5h5',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5',
  rename: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  line: 'M5 19L19 5',
  rect: 'M4 6h16v12H4z',
  shapeFilled: 'M5 7h14v10H5z',
  ellipse: 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z',
  select: 'M4 7V4h3M10 4h4M17 4h3v3M20 10v4M20 17v3h-3M14 20h-4M7 20H4v-3M4 14v-4',
  mirrorX: 'M12 3v18M9 7L4 12l5 5zM15 7l5 5-5 5z',
  mirrorY: 'M3 12h18M7 9l5-5 5 5zM7 15l5 5 5-5z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  merge: 'M12 4v10M8 10l4 4 4-4M5 19h14',
  play: 'M7 5l12 7-12 7z',
  stop: 'M7 7h10v10H7z',
  prevFrame: 'M6 5v14M19 5l-10 7 10 7z',
  nextFrame: 'M18 5v14M5 5l10 7-10 7z',
  resize: 'M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6',
  tag: 'M3 12V4h8l9 9-8 8zM7.5 8.5h.01',
  archive: 'M4 5h16v4H4zM5 9v10h14V9M10 13h4',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  themeAuto: 'M12 21a9 9 0 1 0 0-18v18zM12 3a9 9 0 0 1 0 18',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  flipH: 'M12 3v18M4 7v10l5-5zM20 7v10l-5-5z',
  flipV: 'M3 12h18M7 4h10l-5 5zM7 20h10l-5-5z',
  rotateCW: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M20 4v5h-5',
  rotateCCW: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4 4v5h5',
  expand: 'M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7',
  collapse: 'M4 14h6v6M10 14l-7 7M20 10h-6V4M14 10l7-7',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5h.01',
  onion: 'M9 6a6 6 0 1 0 0 12M15 6a6 6 0 1 1 0 12M12 7.5a6 6 0 0 1 0 9'
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16, filled = false }: { name: IconName; size?: number; filled?: boolean }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
