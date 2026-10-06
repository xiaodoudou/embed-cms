// How the files of `files/` were made: a diagram is boxes and arrows on a plain ground (a JPEG), a PDF is one page written by hand, so that the example needs no drawing tool and no PDF
// library. Run it to make them again: `node make-files.js`. The site does not need it: `content.json` points to the files that are already there.
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

// the pages that have a diagram: the colour of its boxes and how many there are (the name is the key of the page, the slashes made dashes)
const DIAGRAMS = {
  'tidewater-3.0-install': { color: '#17627f', boxes: 3 },
  'tidewater-3.0-single-sign-on': { color: '#5a4fb0', boxes: 4 },
  'lighthouse-1.0-overview': { color: '#2f7d4f', boxes: 5 }
}

// the pages that have a PDF version
const PDFS = {
  'tidewater-3.0-first-sync': ['Your first sync', 'Tidewater 3.0'],
  'tidewater-3.0-configuration': ['Configuration reference', 'Tidewater 3.0'],
  'tidewater-3.0-single-sign-on': ['Single sign-on setup', 'Tidewater 3.0, for members'],
  'lighthouse-1.0-api-keys': ['API keys', 'Lighthouse Enterprise 1.0']
}

/**
 * @param {string} color the colour of the boxes
 * @param {number} boxes how many boxes, joined by arrows
 * @returns {string} an SVG of 1200 by 675 pixels
 */
function diagramSvg (color, boxes) {
  const width = 1000 / boxes
  const parts = []
  for (let index = 0; index < boxes; index++) {
    const x = 100 + index * width
    parts.push(`<rect x="${x + 10}" y="260" width="${width - 60}" height="150" rx="14" fill="${color}" fill-opacity="${0.35 + 0.65 * (index + 1) / boxes}"/>`)
    if (index < boxes - 1) {
      parts.push(`<path d="M${x + width - 44} 335 h34 m-12 -12 l12 12 l-12 12" stroke="#5a6872" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#eef3f6"/>${parts.join('')}</svg>`
}

/**
 * @param {Array<string>} lines the text of the page
 * @returns {Buffer} a PDF of one page, written by hand (the offsets of the table of objects are counted)
 */
function pdf (lines) {
  const escape = (text) => text.replace(/[\\()]/g, '\\$&')
  const content = `BT /F1 20 Tf 40 520 Td 26 TL ${lines.map((line, index) => `${index ? 'T* ' : ''}(${escape(line)}) Tj`).join(' ')} ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let out = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out))
    out += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = Buffer.byteLength(out)
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out)
}

async function main () {
  const files = path.join(__dirname, 'files')
  for (const dir of ['diagrams', 'pdf']) {
    fs.mkdirSync(path.join(files, dir), { recursive: true })
  }
  for (const [slug, { color, boxes }] of Object.entries(DIAGRAMS)) {
    await sharp(Buffer.from(diagramSvg(color, boxes))).jpeg({ quality: 84 }).toFile(path.join(files, 'diagrams', `${slug}.jpg`))
  }
  for (const [slug, [title, line]] of Object.entries(PDFS)) {
    fs.writeFileSync(path.join(files, 'pdf', `${slug}.pdf`), pdf([title, line, '', 'The PDF version of the page.']))
  }
  console.log(`${Object.keys(DIAGRAMS).length} diagrams and ${Object.keys(PDFS).length} PDFs made in ${files}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
