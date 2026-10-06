// cropimage: an image field with a crop tool, in a modal. The original is kept, the crop is stored with it and cut by the API.
module.exports = {
  displayname: { enUS: 'Crop images', zhCN: '裁剪图片' },
  group: { enUS: 'Media', zhCN: '媒体' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    // The usual ratios (free, original, 1:1, 4:3, 3:2, 16:9, 3:4, 2:3, 9:16) and a custom one
    { field: 'photo', input: 'cropimage', label: 'Photo', localised: false, options: { maxCount: 1, hint: 'Any shape: free, a usual ratio or your own' } },
    // A round picture, always square
    { field: 'avatar', input: 'cropimage', label: 'Avatar', localised: false, options: { maxCount: 1, aspectRatio: '1:1', shape: 'circle', output: { maxWidth: 256, format: 'png' }, hint: 'Round, square, at most 256 px' } },
    // A size the field fixes: the crop has this shape, and the result this size
    { field: 'banner', input: 'cropimage', label: 'Banner', localised: false, options: { width: 1200, height: 400, hint: 'Cut to 1200 x 400' } },
    // The ratios the field offers
    { field: 'social', input: 'cropimage', label: 'Social card', localised: false, options: { maxCount: 1, aspectRatios: ['1.91:1', '1:1', { ratio: '4:5', label: 'Portrait 4:5' }], hint: 'A choice of three shapes' } },
    // Several pictures, each with its own crop; the result is a smaller WebP
    { field: 'gallery', input: 'cropimage', label: 'Gallery', localised: false, options: { aspectRatios: ['free', '4:3', '16:9'], output: { maxWidth: 1600, format: 'webp', quality: 80 }, hint: 'Each picture has its own crop' } },
    { field: 'readOnlyCrop', input: 'cropimage', label: 'Read-only crop image', localised: false, options: { readonly: true, maxCount: 1, hint: 'Read-only: visible, not editable' } }
  ]
}
