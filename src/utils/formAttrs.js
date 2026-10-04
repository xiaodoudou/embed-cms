const CONTROLS = 'input, select, textarea'

/**
 * Gives a name to the form controls of a widget that has neither an id nor a name (the boxes of a date picker or of a colour
 * picker, the text area of a code editor, the display box of a file input: libraries that make their own inputs). Browsers flag
 * a control without either, and a name is what an autofill or an accessibility tool tells it by.
 * @param {HTMLElement|null} root the element of the field
 * @param {string} base the model of the field, the start of every name given
 * @returns {number} how many controls were named
 */
export function nameUnnamedInputs (root, base) {
  if (!root || !root.querySelectorAll) {
    return 0
  }
  let named = 0
  root.querySelectorAll(CONTROLS).forEach((control, index) => {
    if (control.id || control.getAttribute('name')) {
      return
    }
    const hint = (control.getAttribute('aria-label') || control.type || control.tagName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    control.setAttribute('name', `${base || 'field'}-${hint || 'input'}-${index}`)
    named++
  })
  return named
}
