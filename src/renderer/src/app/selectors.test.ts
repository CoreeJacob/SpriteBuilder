import { describe, expect, it } from 'vitest'
import { selectFolders } from './store'

describe('store selectors', () => {
  it('return the same empty list every time before the library loads (no render loops)', () => {
    expect(selectFolders({ library: null })).toBe(selectFolders({ library: null }))
  })
})
