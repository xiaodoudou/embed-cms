// One line per paragraph and per list item in the Markdown of the project: an editor wraps a long line for the reader, and a
// diff shows a sentence that changed as one changed line. Used by `npm run docs:reflow` and by test/frontend/docsStyle.test.js.
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+\S/
const FENCE = /^\s*(```|~~~)/

const isBlock = (line) => /^\s*(#{1,6}\s|\||<|---+\s*$|===+\s*$)/.test(line)
const isHardBreak = (line) => / {2}$/.test(line) || /\\$/.test(line)

/** The text with every paragraph and list item on one line (code fences, tables, headings and HTML are left alone) */
function reflow (text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const out = []
  let buffer = null
  let fence = null
  const flush = () => {
    if (buffer !== null) {
      out.push(buffer)
      buffer = null
    }
  }
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const fenceMatch = FENCE.exec(line)
    if (fence) {
      out.push(line)
      if (fenceMatch && fenceMatch[1] === fence) {
        fence = null
      }
      continue
    }
    if (fenceMatch) {
      flush()
      fence = fenceMatch[1]
      out.push(line)
      continue
    }
    if (line.trim() === '' || isBlock(line)) {
      flush()
      out.push(line)
      continue
    }
    if (LIST_ITEM.test(line)) {
      flush()
      buffer = line
      continue
    }
    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      const inner = quote[1]
      if (buffer !== null && buffer.startsWith('>') && inner.trim() !== '' && !isHardBreak(buffer) && !LIST_ITEM.test(inner) && !isBlock(inner) && !FENCE.test(inner)) {
        buffer += ' ' + inner.trim()
      } else {
        flush()
        buffer = inner.trim() === '' ? null : line
        if (buffer === null) {
          out.push(line)
        }
      }
      continue
    }
    if (buffer !== null && !buffer.startsWith('>') && !isHardBreak(buffer)) {
      buffer += ' ' + line.trim()
    } else {
      flush()
      buffer = line
    }
  }
  flush()
  return out.join('\n').replace(/\n/g, eol)
}

/** The Markdown files that follow the rule: the root pages and everything under docs/ */
function markdownFiles () {
  const files = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md'].map((name) => path.join(ROOT, name)).filter((file) => fs.existsSync(file))
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name.endsWith('.md')) {
        files.push(full)
      }
    }
  }
  walk(path.join(ROOT, 'docs'))
  return files
}

if (require.main === module) {
  let changed = 0
  for (const file of markdownFiles()) {
    const before = fs.readFileSync(file, 'utf8')
    const after = reflow(before)
    if (after !== before) {
      fs.writeFileSync(file, after)
      changed++
      console.log('reflowed', path.relative(ROOT, file))
    }
  }
  console.log(`${changed} file(s) changed`)
}

module.exports = { reflow, markdownFiles }
