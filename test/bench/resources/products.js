// Benchmark resource: several field types, localised fields, a unique key and image attachments.
module.exports = {
  displayname: 'Products',
  schema: [
    { field: 'sku', input: 'string', unique: true, required: true, localised: false },
    { field: 'name', input: 'string', localised: true },
    { field: 'description', input: 'text', localised: true },
    { field: 'price', input: 'double', localised: false },
    { field: 'stock', input: 'integer', localised: false },
    { field: 'active', input: 'checkbox', localised: false },
    { field: 'category', input: 'string', localised: false },
    { field: 'released', input: 'date', localised: false },
    { field: 'photo', input: 'image', localised: false, options: { maxCount: 3 } }
  ],
  locales: ['enUS', 'zhCN'],
  type: 'normal'
}
