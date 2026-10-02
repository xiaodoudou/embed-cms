// The files the pictures upload, made on the fly in a temporary folder so the repository holds none of them: a photo (man.jpg,
// about 34 KB), an icon (icon.svg, 193 bytes), tiny text and PDF files, and two files over the size limits of the catalogue.
const fs = require('fs')
const os = require('os')
const path = require('path')

const dir = path.join(os.tmpdir(), 'embed-cms-shots-files')

/** Pads `text` with spaces before its last character until it is `size` bytes long */
const padded = (text, size) => text.slice(0, -1) + ' '.repeat(Math.max(0, size - Buffer.byteLength(text))) + text.slice(-1)

/** A JPEG that looks like a picture (soft shapes and a little noise) of about `target` bytes */
async function photo (target) {
  const sharp = require('sharp')
  const width = 360
  const height = 240
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4d9b0"/><stop offset="1" stop-color="#8fb4d9"/></linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#g)"/>
    <circle cx="120" cy="110" r="52" fill="#e8b48a"/><rect x="60" y="160" width="130" height="80" rx="30" fill="#5a7fb5"/>
    <rect x="215" y="120" width="110" height="90" rx="8" fill="#f3f3f3" stroke="#555" stroke-width="3"/>
  </svg>`
  const noise = Buffer.alloc(width * height * 3)
  let seed = 7
  for (let i = 0; i < noise.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    noise[i] = (seed >> 16) & 0xff
  }
  const base = await sharp(Buffer.from(svg)).raw().toBuffer()
  const mixed = Buffer.alloc(base.length)
  const channels = base.length / (width * height)
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++) {
      mixed[i * channels + c] = Math.min(255, Math.max(0, base[i * channels + c] + ((noise[i * 3 + c] - 128) >> 4)))
    }
  }
  let best = null
  for (let quality = 100; quality >= 40; quality -= 1) {
    const buffer = await sharp(mixed, { raw: { width, height, channels } }).removeAlpha().jpeg({ quality }).toBuffer()
    best = buffer
    if (buffer.length <= target) break
  }
  return best
}

/** A JPEG of random pixels bigger than `bytes`, which no limit of the catalogue lets through */
async function heavyJpeg (bytes) {
  const sharp = require('sharp')
  const width = 1800
  const height = 1200
  const raw = Buffer.alloc(width * height * 3)
  let seed = 11
  for (let i = 0; i < raw.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    raw[i] = (seed >> 16) & 0xff
  }
  let buffer = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).toBuffer()
  while (buffer.length < bytes) buffer = Buffer.concat([buffer, Buffer.alloc(bytes - buffer.length + 1)])
  return buffer
}

/** Writes the files and answers their paths by name */
async function makeFixtures () {
  fs.mkdirSync(dir, { recursive: true })
  const files = {
    'man.jpg': await photo(34580),
    'icon.svg': padded('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="24" fill="#3f51b5"/><circle cx="64" cy="64" r="28" fill="#fff"/></svg>', 193),
    'note.txt': 'Notes for review\n',
    'manual.pdf': padded('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 45),
    'manual.docx': 'PK docx',
    'sound.mp3': 'ID3 sound',
    'clip.mp4': 'ftyp clip',
    'big.txt': Buffer.alloc(6 * 1024 * 1024, 'a'),
    'big.jpg': await heavyJpeg(3 * 1024 * 1024)
  }
  const paths = {}
  for (const [name, content] of Object.entries(files)) {
    paths[name] = path.join(dir, name)
    fs.writeFileSync(paths[name], content)
  }
  return paths
}

module.exports = { makeFixtures }
