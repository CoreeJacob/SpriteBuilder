/** True while a text box, number box or dropdown has focus, so single-key shortcuts should stay out of the way. */
export function isTyping(): boolean {
  const el = document.activeElement
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
}
