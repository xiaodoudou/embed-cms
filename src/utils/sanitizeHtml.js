import DOMPurify from 'dompurify'

// Only inline formatting survives: no scripts, event handlers, iframes, forms or links.
const SANITIZE_OPTIONS = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'mark', 'span', 'br', 'code', 'pre'],
  ALLOWED_ATTR: ['class', 'style']
}

/**
 * Sanitizes an HTML string before it is rendered with v-html.
 * @param {*} html - value to sanitize (coerced to string, null/undefined give '')
 * @returns {string} safe HTML
 */
export function sanitizeHtml (html) {
  return DOMPurify.sanitize(html == null ? '' : String(html), SANITIZE_OPTIONS)
}

/**
 * Escapes a plain string so it can be embedded in HTML markup.
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml (value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}
