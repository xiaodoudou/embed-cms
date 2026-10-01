// jsdom has no layout engine: the few browser APIs Vuetify and the components ask for are stubbed
class ResizeObserverStub {
  observe () {}
  unobserve () {}
  disconnect () {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver || ResizeObserverStub
globalThis.IntersectionObserver = globalThis.IntersectionObserver || ResizeObserverStub
if (!window.matchMedia) {
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener () {}, removeEventListener () {}, addListener () {}, removeListener () {}, onchange: null, dispatchEvent: () => false })
}
window.scrollTo = window.scrollTo || (() => {})
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {})
// Vuetify's overlays (dialogs, menus) position themselves against the visual viewport
if (!window.visualViewport) {
  const viewport = { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0, scale: 1, addEventListener () {}, removeEventListener () {} }
  window.visualViewport = viewport
  globalThis.visualViewport = viewport
}
// CodeMirror measures text with a Range; jsdom has no layout, so every measurement is an empty box
if (typeof Range !== 'undefined') {
  const box = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON () { return this } })
  Range.prototype.getBoundingClientRect = Range.prototype.getBoundingClientRect || box
  Range.prototype.getClientRects = Range.prototype.getClientRects || (() => ({ length: 0, item: () => null, [Symbol.iterator]: function * () {} }))
}
