// Minimal types for the parts of gifenc this app uses.
declare module 'gifenc' {
  export type Palette = number[][]
  export interface FrameOptions {
    palette?: Palette
    delay?: number
    transparent?: boolean
    transparentIndex?: number
    repeat?: number
    dispose?: number
  }
  export interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: FrameOptions): void
    finish(): void
    bytes(): Uint8Array
  }
  export function GIFEncoder(): Encoder
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: string; oneBitAlpha?: boolean | number }): Palette
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: string): Uint8Array
}
