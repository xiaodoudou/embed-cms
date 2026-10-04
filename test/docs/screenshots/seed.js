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
  // `extra` are the other parts of the upload: the crop (cropOptions) and the areas of an image map (imageMap) go as JSON
  const attach = async (resource, id, field, file, extra = {}) => {
    const form = new FormData()
    form.append(field, new Blob([fs.readFileSync(files[file])]), file)
    for (const [key, value] of Object.entries(extra)) form.append(key, JSON.stringify(value))
    return send(`${resource}/${id}/attachments`, { method: 'POST', body: form })
  }
  const ids = {}

  await post('text_strings', { name: { enUS: 'First', zhCN: '第一' }, uniqueCode: 'A1' })
  await post('numbers', { name: 'First', requiredNumber: 1, boundedInteger: 10, uniqueNumber: 42 })

  // the records the selects and multiselects list (the label of the zhCN list is the Chinese name)
  const items = [['Alpha', '阿尔法'], ['Beta', '贝塔'], ['Gamma', '伽玛'], ['Delta', '德尔塔']]
  const itemIds = []
  for (const [en, zh] of items) {
    const item = await post('reference_items', { name: { enUS: en, zhCN: zh }, description: { enUS: `${en} item` }, active: true })
    itemIds.push(item._id)
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

  // pictures that already have a crop (man.jpg is 360 x 240): a square, a round one and a banner
  const cropped = await post('media_crop', { name: 'Cropped pictures' })
  await attach('media_crop', cropped._id, 'photo', 'man.jpg', { cropOptions: { left: 70, top: 10, width: 220, height: 220, ratio: '1:1' } })
  await attach('media_crop', cropped._id, 'avatar', 'man.jpg', { cropOptions: { left: 20, top: 0, width: 240, height: 240, shape: 'circle', output: { maxWidth: 256, format: 'png' }, ratio: '1:1' } })
  await attach('media_crop', cropped._id, 'banner', 'man.jpg', { cropOptions: { left: 0, top: 60, width: 360, height: 120, output: { width: 1200, height: 400 } } })
  ids.cropped = cropped._id

  // maps with areas on the same picture: an address, a record, records of one resource, values, and all three
  const areas = {
    kitchen: { id: 'kitchen', shape: 'rect', coords: [0.6, 0.5, 0.9, 0.88], title: 'Kitchen', href: '/kitchen', target: '_self' },
    lamp: { id: 'lamp', shape: 'circle', coords: [0.333, 0.458, 0.14], title: 'Lamp', href: 'https://example.com/lamp', target: '_blank' },
    door: { id: 'door', shape: 'poly', coords: [0.17, 0.7, 0.53, 0.7, 0.53, 1, 0.17, 1], title: 'Door', href: '/door', target: '_self' }
  }
  const record = (id, shape, coords, ref) => ({ id, shape, coords, ref, target: '_self' })
  const room = (id, shape, coords, value) => ({ id, shape, coords, value, target: '_self' })
  const maps = await post('media_map', { name: 'Floor plans' })
  await attach('media_map', maps._id, 'floorPlan', 'man.jpg', { imageMap: { areas: [areas.kitchen, areas.lamp, areas.door] } })
  await attach('media_map', maps._id, 'catalogue', 'man.jpg', { imageMap: { areas: [areas.kitchen, record('lamp', 'circle', [0.333, 0.458, 0.14], { resource: 'reference_items', id: itemIds[0] })] } })
  await attach('media_map', maps._id, 'productMap', 'man.jpg', {
    imageMap: { areas: [record('lamp', 'circle', [0.333, 0.458, 0.14], { resource: 'reference_items', id: itemIds[1] }), record('shelf', 'rect', [0.6, 0.5, 0.9, 0.88], { resource: 'reference_items', id: itemIds[2] })] }
  })
  await attach('media_map', maps._id, 'roomMap', 'man.jpg', { imageMap: { areas: [room('lamp', 'circle', [0.333, 0.458, 0.14], 'room-12'), room('door', 'poly', [0.17, 0.7, 0.53, 0.7, 0.53, 1, 0.17, 1], 'room-14')] } })
  await attach('media_map', maps._id, 'everything', 'man.jpg', {
    imageMap: { areas: [areas.kitchen, record('lamp', 'circle', [0.333, 0.458, 0.14], { resource: 'reference_items', id: itemIds[0] }), room('door', 'poly', [0.17, 0.7, 0.53, 0.7, 0.53, 1, 0.17, 1], 'door-7')] }
  })
  ids.maps = maps._id

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
