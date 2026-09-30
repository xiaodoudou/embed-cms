import { describe, it, expect } from 'vitest'
import { sanitizeHtml, escapeHtml } from '@u/sanitizeHtml'

describe('sanitizeHtml', () => {
  it('keeps inline formatting', () => {
    expect(sanitizeHtml('<strong>bold</strong> and <em>em</em>')).toBe('<strong>bold</strong> and <em>em</em>')
    expect(sanitizeHtml('<span class="x" style="color:red">t</span>')).toContain('<span')
  })
  it('removes script tags and their content', () => {
    expect(sanitizeHtml('a<script>alert(1)</script>b')).toBe('ab')
  })
  it('removes event handler attributes', () => {
    const out = sanitizeHtml('<img src=x onerror=alert(1)>')
    expect(out).not.toMatch(/onerror/i)
    expect(out).not.toMatch(/<img/i)
    expect(sanitizeHtml('<span onclick="alert(1)">x</span>')).toBe('<span>x</span>')
  })
  it('removes links, iframes, forms and styles tags', () => {
    for (const html of ['<a href="javascript:alert(1)">x</a>', '<iframe src="//evil"></iframe>', '<form action="//evil"><input></form>', '<style>*{display:none}</style>', '<svg onload=alert(1)>', '<math><mi xlink:href="javascript:alert(1)">x</mi></math>']) {
      const out = sanitizeHtml(html)
      expect(out, html).not.toMatch(/<(a|iframe|form|input|style|svg|math)\b/i)
      expect(out, html).not.toMatch(/javascript:|onload/i)
    }
  })
  it('turns null and undefined into an empty string and coerces other values', () => {
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml(undefined)).toBe('')
    expect(sanitizeHtml(12)).toBe('12')
  })
  it('neutralises broken and nested markup', () => {
    const out = sanitizeHtml('<b><script>alert(1)</script></b><<script>script>alert(2)</script>')
    expect(out).not.toMatch(/<script/i)
  })
})

describe('escapeHtml', () => {
  it('escapes every special character', () => {
    expect(escapeHtml('<a href="x" title=\'y\'>&</a>')).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
  })
  it('escapes ampersands first so entities are not double decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
  it('handles null, undefined and numbers', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(7)).toBe('7')
  })
  it('round trips through the DOM as plain text', () => {
    const el = document.createElement('div')
    el.innerHTML = escapeHtml('<img src=x onerror=alert(1)>')
    expect(el.querySelector('img')).toBeNull()
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>')
  })
})
