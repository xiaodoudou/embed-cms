import _ from 'lodash'
import DOMPurify from 'dompurify'
import { escapeHtml } from '@u/sanitizeHtml'

// The markdown field: a text written in Markdown, and what the admin does with it. This is a small renderer of its own (no library): it escapes everything first, writes
// only the tags it knows, lets a link or an image go only to a safe address, and the result goes through DOMPurify once more before it is shown. The formatting buttons
// of the editor are here too, as functions of the text and the selection, so that they are tested without a component.

// the most of a text that is rendered (a longer one is cut: it is a preview, not a publisher)
const MAX_RENDERED = 200000
// how deep quotes and lists go inside each other
const MAX_DEPTH = 6
const SCHEMES = ['http', 'https', 'mailto', 'tel']
// marks what is put aside while a line is read (a private use character: it is not in a text)
const MARK = String.fromCharCode(0xe000)
const PUT_BACK = new RegExp(`${MARK}(\\d+)${MARK}`, 'g')

const SANITIZE = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'hr', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input'],
  ALLOWED_ATTR: ['href', 'title', 'rel', 'target', 'src', 'alt', 'align', 'class', 'type', 'checked', 'disabled', 'start'],
  ALLOW_DATA_ATTR: false
}

/**
 * @param {*} url an address written in a text
 * @returns {boolean} it may be a link or a picture: http, https, mailto, tel, or one that has no scheme (a path, an anchor)
 */
export function isSafeUrl (url) {
  // what a browser ignores in a scheme (a tab, a line break, a space) is ignored here too: "java\nscript:" is a script
  const text = Array.from(_.toString(url)).filter(char => char.charCodeAt(0) > 32 && char.charCodeAt(0) !== 127).join('')
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(text)
  return text !== '' && (scheme ? _.includes(SCHEMES, _.toLower(scheme[1])) : true)
}

const decode = (text) => text.replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const external = (url) => /^[a-z][a-z0-9+.-]*:|^\/\//i.test(decode(url))

/**
 * @param {string} html text already escaped
 * @returns {string} with its bold, italic and strikethrough written as tags (an underscore inside a word is not a sign)
 */
function emphasis (html) {
  return html
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\w)__(?=\S)([\s\S]*?\S)__(?!\w)/g, '<strong>$1</strong>')
    .replace(/\*(?=\S)([^*]*?\S)\*/g, '<em>$1</em>')
    .replace(/(?<!\w)_(?=\S)([^_]*?\S)_(?!\w)/g, '<em>$1</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
}

/**
 * @param {string} text one line or paragraph of Markdown
 * @returns {string} HTML for it: code, backslash escapes, images, links, bold, italic and strikethrough; everything else is text, escaped
 */
function inline (source) {
  // (the character that marks what is put aside is not text: one that was written is dropped)
  const text = source.split(MARK).join('')
  const kept = []
  // what must not be read as Markdown any more (the inside of code, an escaped character) is put aside and put back at the end
  const keep = (html) => `${MARK}${kept.push(html) - 1}${MARK}`
  let out = text
    .replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (match, ticks, code) => keep(`<code>${escapeHtml(_.trim(code))}</code>`))
    .replace(/\\([\\`*_{}[\]()#+\-.!~|>])/g, (match, char) => keep(escapeHtml(char)))
  out = escapeHtml(out)
  const title = (value) => value ? ` title="${value}"` : ''
  out = out
    .replace(/!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+&quot;(.*?)&quot;)?\)/g,(match, alt, url, caption) => isSafeUrl(decode(url)) ? keep(`<img src="${url}" alt="${alt}"${title(caption)}>`) : alt)
    .replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+&quot;(.*?)&quot;)?\)/g,(match, label, url, caption) => isSafeUrl(decode(url)) ? keep(`<a href="${url}"${title(caption)}${external(url) ? ' rel="noopener noreferrer" target="_blank"' : ''}>${emphasis(label)}</a>`) : label)
    .replace(/&lt;((?:https?:\/\/|mailto:)[^\s&]*(?:&amp;[^\s&]*)*)&gt;/g, (match, url) => keep(`<a href="${url}" rel="noopener noreferrer" target="_blank">${url}</a>`))
  out = emphasis(out).replace(/(?: {2,}|\\)\n/g, '<br>\n')
  // what was put aside may hold something put aside (a link around code): put back until nothing is left
  for (let pass = 0; pass < 3 && out.includes(MARK); pass++) {
    out = out.replace(PUT_BACK, (match, index) => kept[Number(index)])
  }
  return out
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const QUOTE = /^ {0,3}>\s?(.*)$/
const ITEM = /^( *)([-*+]|\d{1,9}[.)])\s+(.*)$/
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

const startsBlock = (line) => FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line)
const cells = (line) => {
  const row = _.trim(line).replace(/^\|/, '').replace(/\|$/, '')
  return _.map(row.split(/(?<!\\)\|/), cell => _.trim(cell.replace(/\\\|/g, '|')))
}
const align = (spec) => /^:-+:$/.test(spec) ? 'center' : /-:$/.test(spec) ? 'right' : /^:-/.test(spec) ? 'left' : ''

/**
 * @param {string[]} lines
 * @param {number} depth how deep inside quotes and lists it is
 * @returns {string} the HTML of the blocks of the lines
 */
function blocks (lines, depth) {
  const html = []
  let at = 0
  while (at < lines.length) {
    const line = lines[at]
    if (_.trim(line) === '') {
      at++
      continue
    }
    const fence = FENCE.exec(line)
    if (fence) {
      const code = []
      at++
      // it ends at a line of the same sign, at least as long (or at the end of the text)
      const closes = (text) => {
        const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(text)
        return !!close && close[1][0] === fence[1][0] && close[1].length >= fence[1].length
      }
      while (at < lines.length && !closes(lines[at])) {
        code.push(lines[at++])
      }
      at++
      html.push(`<pre><code${/^[\w-]+$/.test(fence[2]) && fence[2] ? ` class="language-${fence[2]}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      html.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`)
      at++
      continue
    }
    if (RULE.test(line)) {
      html.push('<hr>')
      at++
      continue
    }
    if (QUOTE.test(line) && depth < MAX_DEPTH) {
      const inside = []
      while (at < lines.length && QUOTE.test(lines[at])) {
        inside.push(QUOTE.exec(lines[at++])[1])
      }
      html.push(`<blockquote>${blocks(inside, depth + 1)}</blockquote>`)
      continue
    }
    if (ITEM.test(line) && depth < MAX_DEPTH) {
      const base = ITEM.exec(line)
      const ordered = /\d/.test(base[2])
      const items = []
      while (at < lines.length) {
        const item = ITEM.exec(lines[at])
        if (!item || item[1].length > base[1].length + 1 || /\d/.test(item[2]) !== ordered) {
          break
        }
        const first = item[3]
        const rest = []
        at++
        // what is under the item: a line indented more than its marker, and the blank lines between those
        while (at < lines.length) {
          const under = lines[at]
          const sibling = ITEM.exec(under)
          if (_.trim(under) === '') {
            // a blank line belongs to the item when what follows is indented under it
            if (!/^ {2,}\S/.test(lines[at + 1] || '')) {
              break
            }
          } else if (!/^ {2,}\S/.test(under) || (sibling && sibling[1].length <= base[1].length + 1)) {
            break
          }
          rest.push(under.replace(/^ {1,4}/, ''))
          at++
        }
        items.push({ first, rest, start: ordered ? Number(item[2].replace(/\D/g, '')) : 1 })
      }
      const li = items.map(({ first, rest }) => {
        const task = /^\[([ xX])\]\s+(.*)$/.exec(first)
        const text = task ? task[2] : first
        const box = task ? `<input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'}> ` : ''
        return `<li>${box}${inline(text)}${rest.length ? blocks(rest, depth + 1) : ''}</li>`
      }).join('')
      const first = items[0].start
      html.push(ordered ? `<ol${first !== 1 ? ` start="${first}"` : ''}>${li}</ol>` : `<ul>${li}</ul>`)
      continue
    }
    if (line.includes('|') && at + 1 < lines.length && lines[at + 1].includes('-') && TABLE_SEPARATOR.test(lines[at + 1]) && cells(line).length === cells(lines[at + 1]).length) {
      const aligns = _.map(cells(lines[at + 1]), align)
      const cell = (tag, value, index) => `<${tag}${aligns[index] ? ` align="${aligns[index]}"` : ''}>${inline(value)}</${tag}>`
      const head = cells(line).map((value, index) => cell('th', value, index)).join('')
      const body = []
      at += 2
      while (at < lines.length && _.trim(lines[at]) !== '' && !startsBlock(lines[at])) {
        body.push(`<tr>${aligns.map((a, index) => cell('td', cells(lines[at])[index] || '', index)).join('')}</tr>`)
        at++
      }
      html.push(`<table><thead><tr>${head}</tr></thead>${body.length ? `<tbody>${body.join('')}</tbody>` : ''}</table>`)
      continue
    }
    // a paragraph: lines up to a blank one or the start of another block; a line of = or - under it makes it a heading
    const paragraph = [line]
    at++
    while (at < lines.length && _.trim(lines[at]) !== '' && !startsBlock(lines[at]) && !(lines[at].includes('|') && lines[at + 1] && TABLE_SEPARATOR.test(lines[at + 1]) && lines[at + 1].includes('-'))) {
      if (/^ {0,3}(=+|-+)\s*$/.test(lines[at])) {
        break
      }
      paragraph.push(lines[at++])
    }
    const underline = at < lines.length ? /^ {0,3}(=+|-+)\s*$/.exec(lines[at]) : null
    if (underline) {
      const level = underline[1][0] === '=' ? 1 : 2
      html.push(`<h${level}>${inline(paragraph.map(_.trim).join(' '))}</h${level}>`)
      at++
    } else {
      html.push(`<p>${inline(paragraph.map(_.trimStart).join('\n'))}</p>`)
    }
  }
  return html.join('')
}

/**
 * @param {*} text Markdown
 * @returns {string} safe HTML to show with v-html: only the tags the renderer writes, links and pictures only to http, https, mailto, tel or a path, an external link opening
 *   in a new tab without giving the page to it; empty for no text
 */
export function renderMarkdown (text) {
  const source = _.toString(text).replace(/\r\n?/g, '\n').slice(0, MAX_RENDERED)
  if (_.trim(source) === '') {
    return ''
  }
  return DOMPurify.sanitize(blocks(source.split('\n'), 0), SANITIZE)
}

/**
 * @param {*} text Markdown
 * @returns {string} what it says, without the signs: for a table cell, a search or a title (`**Bold** and [a link](https://x)` is `Bold and a link`)
 */
export function markdownToPlain (text) {
  return _.trim(_.toString(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter(line => !FENCE.test(line) && !RULE.test(line) && !(TABLE_SEPARATOR.test(line) && line.includes('-') && line.includes('|')))
    .map(line => line
      .replace(HEADING, '$2')
      .replace(/^ {0,3}>\s?/, '')
      .replace(/^\s*([-*+]|\d{1,9}[.)])\s+(\[[ xX]\]\s+)?/, '')
      .replace(/\|/g, ' '))
    .join(' ')
    // an escaped sign is put aside, so that it is not taken for the end of a pair
    .replace(/\\([\\`*_{}[\]()#+\-.!~|>])/g, (match, char) => `${MARK}${char.charCodeAt(0)}${MARK}`)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(`+)([\s\S]*?[^`])\1/g, '$2')
    .replace(/(\*\*|__|~~)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(?<!\w)([*_])(?=\S)([^*_]*?\S)\1(?!\w)/g, '$2')
    .replace(PUT_BACK, (match, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' '))
}

// ---- the formatting buttons of the editor ----------------------------------------------------------------------------------------------------------------------

export const TOOLS = ['bold', 'italic', 'strike', 'heading', 'quote', 'ul', 'ol', 'code', 'link']

/**
 * @param {string|boolean|Array<string>} wanted `options.toolbar`: the buttons to show; nothing, or true, for all of them; false for none
 * @returns {string[]} the buttons, in the order of the toolbar
 */
export function toolbarOf (wanted) {
  if (wanted === false) {
    return []
  }
  return _.isArray(wanted) ? _.filter(TOOLS, tool => _.includes(wanted, tool)) : TOOLS
}

const wrap = (value, start, end, marker, placeholder) => {
  const selected = value.slice(start, end)
  const before = value.slice(start - marker.length, start)
  const after = value.slice(end, end + marker.length)
  if (before === marker && after === marker) {
    // already wrapped: take the signs away
    return { value: value.slice(0, start - marker.length) + selected + value.slice(end + marker.length), start: start - marker.length, end: end - marker.length }
  }
  if (selected.length > marker.length * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(marker.length, -marker.length)
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length }
  }
  const text = selected || placeholder
  return { value: value.slice(0, start) + marker + text + marker + value.slice(end), start: start + marker.length, end: start + marker.length + text.length }
}

// the lines the selection touches: where they start and end in the text
const linesAt = (value, start, end) => {
  const from = value.lastIndexOf('\n', start - 1) + 1
  const to = value.indexOf('\n', end)
  return { from, to: to === -1 ? value.length : to }
}

const onLines = (value, start, end, change) => {
  const { from, to } = linesAt(value, start, end)
  const lines = value.slice(from, to).split('\n')
  const changed = change(lines).join('\n')
  return { value: value.slice(0, from) + changed + value.slice(to), start: from, end: from + changed.length }
}

/**
 * What a button of the editor does to the text.
 * @param {string} tool one of TOOLS
 * @param {string} value the text
 * @param {number} start where the selection starts
 * @param {number} end where it ends
 * @returns {{value: string, start: number, end: number}} the text and the selection after it; the same text for a tool it does not know
 */
export function formatSelection (tool, value, start, end) {
  switch (tool) {
    case 'bold': return wrap(value, start, end, '**', 'bold')
    case 'italic': return wrap(value, start, end, '_', 'italic')
    case 'strike': return wrap(value, start, end, '~~', 'strikethrough')
    case 'code': {
      const selected = value.slice(start, end)
      if (selected.includes('\n')) {
        const fenced = `\`\`\`\n${selected}\n\`\`\``
        return { value: value.slice(0, start) + fenced + value.slice(end), start, end: start + fenced.length }
      }
      return wrap(value, start, end, '`', 'code')
    }
    case 'heading':
      // ## then ### then #### then none, on every line of the selection (the first line says where the cycle is)
      return onLines(value, start, end, (lines) => {
        const level = (/^(#{1,6})\s/.exec(lines[0]) || ['', ''])[1].length
        const next = level === 0 ? 2 : level >= 4 ? 0 : level + 1
        return _.map(lines, line => `${next ? `${'#'.repeat(next)} ` : ''}${line.replace(/^#{1,6}\s+/, '')}`)
      })
    case 'quote':
      return onLines(value, start, end, lines => _.every(lines, line => /^>\s?/.test(line)) ? _.map(lines, line => line.replace(/^>\s?/, '')) : _.map(lines, line => `> ${line}`))
    case 'ul':
      return onLines(value, start, end, lines => _.every(lines, line => /^[-*+]\s/.test(line)) ? _.map(lines, line => line.replace(/^[-*+]\s/, '')) : _.map(lines, line => `- ${line.replace(/^(?:[-*+]|\d+[.)])\s/, '')}`))
    case 'ol':
      return onLines(value, start, end, lines => _.every(lines, line => /^\d+[.)]\s/.test(line)) ? _.map(lines, line => line.replace(/^\d+[.)]\s/, '')) : _.map(lines, (line, index) => `${index + 1}. ${line.replace(/^(?:[-*+]|\d+[.)])\s/, '')}`))
    case 'link': {
      const selected = value.slice(start, end)
      if (/^(https?:\/\/|mailto:)\S+$/.test(selected)) {
        // an address is selected: it is the link, and the text is to be written
        const link = `[link](${selected})`
        return { value: value.slice(0, start) + link + value.slice(end), start: start + 1, end: start + 5 }
      }
      const text = selected || 'link'
      const link = `[${text}](https://)`
      // the address is what is to be written next: it is selected
      return { value: value.slice(0, start) + link + value.slice(end), start: start + text.length + 3, end: start + text.length + 11 }
    }
    default:
      return { value, start, end }
  }
}

/**
 * What Enter does at the end of a line of a list: the next item starts (`- `, `2. `), and an item with nothing in it ends the list.
 * @param {string} value
 * @param {number} at where the caret is
 * @returns {{value: string, start: number}|null} the text and the caret after it; nothing when the caret is not at the end of a line of a list
 */
export function continueList (value, at) {
  const from = value.lastIndexOf('\n', at - 1) + 1
  const to = value.indexOf('\n', at)
  const lineEnd = to === -1 ? value.length : to
  if (at !== lineEnd) {
    return null
  }
  const item = /^(\s*)([-*+]|(\d{1,9})([.)]))\s+(\[[ xX]\]\s+)?(.*)$/.exec(value.slice(from, lineEnd))
  if (!item) {
    return null
  }
  if (item[6] === '') {
    return { value: value.slice(0, from) + value.slice(lineEnd), start: from }
  }
  const marker = item[3] ? `${Number(item[3]) + 1}${item[4]}` : item[2]
  const next = `\n${item[1]}${marker} ${item[5] ? '[ ] ' : ''}`
  return { value: value.slice(0, at) + next + value.slice(at), start: at + next.length }
}
