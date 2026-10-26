import { describe, expect, it } from 'vitest'
import { mapLimited } from './async'

describe('mapLimited', () => {
  it('keeps results in order and never runs more than the limit at once', async () => {
    let running = 0
    let most = 0
    const results = await mapLimited([5, 1, 4, 2, 3], 2, async (n) => {
      most = Math.max(most, ++running)
      await new Promise((r) => setTimeout(r, n * 3)) // finishes out of order
      running--
      return n * 10
    })
    expect(results).toEqual([50, 10, 40, 20, 30])
    expect(most).toBe(2)
  })
})
