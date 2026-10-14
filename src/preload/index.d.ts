import type { SpriteBuilderApi } from '../shared/types'

declare global {
  interface Window {
    api: SpriteBuilderApi
  }
}
