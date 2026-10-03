// Records over REST (Basic authentication) that some pictures need: a duplicate to refuse, the items the selects list, records
// with attachments to open, a JSON document. `seed` answers the ids the specs open.
const fs = require('fs')

const AUTH = (user, password) => ({ Authorization: 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64') })

// A machine that drops the first packet to a fresh local port (see docs/contributing/TESTING.md) fails the first connection
async function fetchRetry (url, options, attempts = 8) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, { ...options, signal: AbortSignal.timeout(6000) })
    } catch (error) {
      if (attempt >= attempts) throw error
    }
  }
}

async function seed (base, user, password, files) {
  const auth = AUTH(user, password)
  const send = async (url, options) => {
    const res = await fetchRetry(`${base}/api/${url}`, { ...options, headers: { ...auth, ...(options.headers || {}) } })
    if (res.status >= 300) throw new Error(`${options.method} ${url} answered ${res.status} ${await res.text()}`)
    return res.json()
  }
  const post = (resource, body) => send(resource, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const attach = async (resource, id, field, file) => {
    const form = new FormData()
    form.append(field, new Blob([fs.readFileSync(files[file])]), file)
    return send(`${resource}/${id}/attachments`, { method: 'POST', body: form })
  }
  const ids = {}

  await post('text_strings', { name: { enUS: 'First', zhCN: '第一' }, uniqueCode: 'A1' })
  await post('numbers', { name: 'First', requiredNumber: 1, boundedInteger: 10, uniqueNumber: 42 })

  // the records the selects and multiselects list (the label of the zhCN list is the Chinese name)
  const items = [['Alpha', '阿尔法'], ['Beta', '贝塔'], ['Gamma', '伽玛'], ['Delta', '德尔塔']]
  for (const [en, zh] of items) {
    await post('reference_items', { name: { enUS: en, zhCN: zh }, description: { enUS: `${en} item` }, active: true })
  }

  // a JSON document, with a different document per locale
  const data = await post('structured_data', {
    name: 'Data',
    json: { title: 'Hello', tags: ['a', 'b'], nested: { count: 3, ok: true, none: null } },
    localisedJson: { enUS: { greeting: 'Hello' }, zhCN: { greeting: '你好' } }
  })
  ids.json = data._id

  // saved attachments: the read-only and disabled fields cannot be filled in the admin
  const file = await post('media_files', { name: 'Documents' })
  await attach('media_files', file._id, 'readOnlyFile', 'note.txt')
  await attach('media_files', file._id, 'disabledFile', 'manual.pdf')
  ids.files = file._id
  const image = await post('media_images', { name: 'Pictures' })
  await attach('media_images', image._id, 'readOnlyImage', 'icon.svg')
  await attach('media_images', image._id, 'disabledImage', 'icon.svg')
  await attach('media_images', image._id, 'gallery', 'icon.svg')
  await attach('media_images', image._id, 'gallery', 'man.jpg')
  ids.images = image._id

  // the list and the table of the screenshots of the interface: nine formatted strings (the newest first in the list) and a
  // table of fifty-six records
  const formats = ['Press office', 'Showroom', 'Warehouse', 'Accounting', 'Workshop', 'Delivery partner', 'Photographer', 'Printer', 'Contact card']
  for (const name of formats) {
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '-')
    const card = name === 'Contact card'
    await post('text_formats', {
      name,
      email: card ? 'hello@example.com' : `${slug}@example.com`,
      requiredEmail: card ? 'team@example.com' : `${slug}-team@example.com`,
      url: card ? 'https://example.com' : `https://example.com/${slug}`,
      ...(card ? {} : { requiredUrl: `https://example.com/${slug}/about` })
    })
    await new Promise((resolve) => setTimeout(resolve, 60))
  }
  const names = ['Nordic Chair', 'Classic Cabinet', 'Oak Mirror', 'Compact Bench', 'Modular Sofa', 'Velvet Stool', 'Industrial Desk', 'Walnut Table', 'Rattan Shelf', 'Linen Lamp']
  const nouns = ['chair', 'cabinet', 'mirror', 'bench', 'sofa', 'stool', 'desk', 'table', 'shelf', 'lamp']
  const woods = ['oak', 'walnut', 'ash']
  const statuses = ['published', 'published', 'draft', 'archived']
  const tags = [['new'], ['oak', 'seating'], ['sale'], ['lighting'], ['storage', 'oak'], [], ['fabric']]
  for (let n = 1; n <= 56; n++) {
    const index = n % 10
    await post('table_view', {
      name: `${names[index]} ${n}`,
      title: { enUS: `${names[index]} ${n} in ${woods[n % 3]}`, zhCN: `${names[index]} ${n}` },
      summary: { enUS: `A ${nouns[index]} from the ${n % 2 === 0 ? 'autumn' : 'spring'} collection, made to last.` },
      status: statuses[n % 4],
      tags: tags[n % 7],
      price: 40 + n * 7,
      stock: (n * 13) % 50,
      featured: n % 3 === 0
    })
  }
  // a record with tiles for the pictures of the dynamic layout: 2 by 2, 3 by 3 and a mixed row
  const tiles = (type, titles) => titles.map((title) => ({ _type: type, title, text: 'A short text under the title.' }))
  const grid = await post('structured_grid', {
    name: 'Home page',
    twoByTwo: tiles('tile_half', ['News', 'Events', 'Shop', 'About']),
    threeByThree: tiles('tile_third', ['Spring', 'Summer', 'Autumn', 'Winter', 'North', 'East', 'South', 'West', 'Centre']),
    fourByTwo: tiles('tile_quarter', ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']),
    mixed: [...tiles('tile_half', ['Wide']), ...tiles('tile_quarter', ['Small', 'Small']), ...tiles('tile_third', ['Third', 'Third', 'Third'])]
  })
  ids.grid = grid._id
  // a record for the picture of the form layout
  const layout = await post('structured_layout', {
    name: 'Ana Moreau',
    firstName: 'Ana',
    lastName: 'Moreau',
    email: 'ana.moreau@example.com',
    phone: '+33 1 23 45 67 89',
    street: 'Rue des Lilas',
    number: '12',
    city: 'Lyon',
    postcode: '69003',
    country: 'France',
    notes: 'Prefers to be contacted by email.',
    reference: 'CUST-0042'
  })
  ids.layout = layout._id
  return ids
}

module.exports = { seed }
