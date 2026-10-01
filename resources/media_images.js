// image: single, multiple, restricted and per locale
module.exports = {
  displayname: { enUS: 'Images', zhCN: '图片' },
  group: { enUS: 'Media', zhCN: '媒体' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    // Any number of images
    { field: 'gallery', input: 'image', label: 'Gallery', localised: false, options: { hint: 'Any number of images' } },
    // Exactly one image
    { field: 'cover', input: 'image', label: 'Cover image', localised: false, required: true, options: { maxCount: 1, hint: 'Required. A single image' } },
    // Restricted formats, with a hint
    { field: 'icon', input: 'image', label: 'Icon', localised: false, options: { accept: '.png,.svg', maxCount: 1, hint: 'One PNG or SVG, recommended 128 x 128' } },
    // Size limit per file, in bytes
    { field: 'photo', input: 'image', label: 'Photos (size limited)', localised: false, options: { limit: 2 * 1024 * 1024, hint: 'At most 2 MB per file' } },
    // One image per locale
    { field: 'localisedBanner', input: 'image', label: 'Banner per locale', options: { maxCount: 1, hint: 'One image per locale' } },
    { field: 'readOnlyImage', input: 'image', label: 'Read-only image', localised: false, options: { readonly: true, maxCount: 1, hint: 'Read-only: visible, not editable' } },
    { field: 'disabledImage', input: 'image', label: 'Disabled image', localised: false, options: { disabled: true, maxCount: 1, hint: 'Disabled: greyed out, no uploads' } }
  ]
}
