// How the pictures of `files/` were made: a gradient with a pale shape on it, as a JPEG, so that the example needs no photographs. Run it to make them again (`node make-pictures.js`);
// the site does not need it: `content.json` points to the files that are already there.
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const COVERS = {
  'slow-mornings-in-lisbon': ['#3b3fa8', '#e86f8c'],
  'the-case-for-the-long-lunch': ['#f3b46b', '#e86f8c'],
  'what-a-small-server-can-do': ['#58a6d8', '#3b3fa8'],
  'a-street-market-after-rain': ['#2f8f6b', '#58a6d8'],
  'bread-patiently': ['#c9d86f', '#f3b46b'],
  'writing-documentation-people-read': ['#3b3fa8', '#2f8f6b'],
  'ink-paper-and-the-last-print-shop': ['#2a2e3b', '#9aa2ff'],
  'night-trains-across-the-north': ['#12141b', '#58a6d8'],
  'fermentation-for-beginners': ['#e86f8c', '#c9d86f'],
  'keeping-content-and-code-apart': ['#58a6d8', '#c9d86f'],
  'letters-from-a-tea-house': ['#2f8f6b', '#f3b46b'],
  'three-days-on-the-coast-path': ['#3b3fa8', '#58a6d8'],
  'an-unfinished-idea': ['#646b7d', '#e4e6ee']
}

const PHOTOS = {
  'mei-lin': ['#e86f8c', '#f3b46b'],
  'tom-becker': ['#3b3fa8', '#58a6d8'],
  'aiko-tanaka': ['#2f8f6b', '#c9d86f']
}

/**
 * @param {Array<string>} colors two colours
 * @param {number} width
 * @param {number} height
 * @param {boolean} [round] a head and shoulders (a photo of a person) rather than a picture
 * @returns {Promise<Buffer>} a JPEG
 */
function picture (colors, width, height, round = false) {
  const shape = round
    ? `<circle cx="${width / 2}" cy="${height * 0.38}" r="${width * 0.2}" fill="#fff" fill-opacity=".55"/><ellipse cx="${width / 2}" cy="${height * 0.95}" rx="${width * 0.36}" ry="${height * 0.34}" fill="#fff" fill-opacity=".55"/>`
    : `<circle cx="${width * 0.78}" cy="${height * 0.3}" r="${height * 0.2}" fill="#fff" fill-opacity=".28"/><rect x="${width * 0.08}" y="${height * 0.62}" width="${width * 0.5}" height="${height * 0.05}" rx="${height * 0.025}" fill="#fff" fill-opacity=".35"/><rect x="${width * 0.08}" y="${height * 0.72}" width="${width * 0.34}" height="${height * 0.05}" rx="${height * 0.025}" fill="#fff" fill-opacity=".25"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/>${shape}</svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer()
}

async function main () {
  fs.mkdirSync(path.join(__dirname, 'files', 'articles'), { recursive: true })
  fs.mkdirSync(path.join(__dirname, 'files', 'authors'), { recursive: true })
  for (const [slug, colors] of Object.entries(COVERS)) {
    fs.writeFileSync(path.join(__dirname, 'files', 'articles', `${slug}.jpg`), await picture(colors, 1280, 853))
  }
  for (const [slug, colors] of Object.entries(PHOTOS)) {
    fs.writeFileSync(path.join(__dirname, 'files', 'authors', `${slug}.jpg`), await picture(colors, 320, 320, true))
  }
  console.log(`${Object.keys(COVERS).length} covers and ${Object.keys(PHOTOS).length} photos made in files/`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
