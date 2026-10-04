// imagemap: an image with areas laid over it (rectangles, circles, polygons). Each area links to an address, to a record, or holds a value.
const itemRef = { resource: 'reference_items', label: '{{name}}', title: 'Reference item' }

module.exports = {
  displayname: { enUS: 'Image maps', zhCN: '图片热区' },
  group: { enUS: 'Media', zhCN: '媒体' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    // The default: an area links to an address, with a title and where it opens
    { field: 'floorPlan', input: 'imagemap', label: 'Floor plan', localised: false, options: { maxCount: 1, hint: 'Draw areas on the picture and give each a title and an address' } },
    // An address, or a record picked from another resource
    { field: 'catalogue', input: 'imagemap', label: 'Catalogue page', localised: false, options: { maxCount: 1, references: [{ resource: 'reference_items', label: '{{name}}' }], hint: 'An area links to an address, or to a Reference item' } },
    // Records only, from one resource, with a name for them; the record opens where the person says
    { field: 'productMap', input: 'imagemap', label: 'Product map', localised: false, options: { maxCount: 1, links: 'record', openIn: true, references: [itemRef], hint: 'Records only: each area is a Reference item, and says where it opens' } },
    // Records from several resources: the person picks the resource, then the record
    {
      field: 'multiMap',
      input: 'imagemap',
      label: 'Several resources',
      localised: false,
      options: {
        maxCount: 1,
        links: ['url', 'record'],
        references: [itemRef, { resource: 'media_images', label: '{{name}}', title: { enUS: 'Image record', zhCN: '图片记录' } }],
        hint: 'An address, or a record of Reference items or of Images'
      }
    },
    // A value the person types, for the site to make of: no title, no address, no choice of where it opens
    { field: 'roomMap', input: 'imagemap', label: 'Rooms', localised: false, options: { maxCount: 1, links: 'value', labels: { value: 'Room number' }, hint: 'Each area holds a room number, typed in' } },
    // All three, with the words of the field
    {
      field: 'everything',
      input: 'imagemap',
      label: 'Everything',
      localised: false,
      options: {
        maxCount: 1,
        links: ['url', 'record', 'value'],
        openIn: true,
        labels: { url: 'Web page', record: 'Item', value: 'Code' },
        references: [itemRef],
        hint: 'An address, a record or a code, each area its own'
      }
    },
    // One map per language: the same picture can be mapped differently in each
    { field: 'localisedMap', input: 'imagemap', label: 'Map per locale', options: { maxCount: 1, hint: 'One picture and one map per locale' } },
    { field: 'readOnlyMap', input: 'imagemap', label: 'Read-only map', localised: false, options: { readonly: true, maxCount: 1, hint: 'Read-only: visible, not editable' } }
  ]
}
