import type { TurnCommand } from '@shared/types'

/**
 * ⇧H / ⇧V flip and ⇧R / ⌥⇧R turn, in the Studio and the Image Editor. Key codes are used
 * because ⌥ changes the letter a key types.
 */
export function turnFromKey(e: KeyboardEvent): TurnCommand | null {
  if (!e.shiftKey || e.metaKey || e.ctrlKey) return null
  if (e.code === 'KeyH') return 'flipH'
  if (e.code === 'KeyV') return 'flipV'
  if (e.code === 'KeyR') return e.altKey ? 'rotateCCW' : 'rotateCW'
  return null
}

/** True while a text box, number box or dropdown has focus, so single-key shortcuts should stay out of the way. */
export function isTyping(): boolean {
  const el = document.activeElement
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
}
