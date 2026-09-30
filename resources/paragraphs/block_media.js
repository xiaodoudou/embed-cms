// Paragraph type: image and file with a caption
module.exports = {
  displayname: { enUS: 'Media block', zhCN: '媒体块' },
  schema: [
    { field: 'image', input: 'image', label: 'Image', localised: false, required: true, options: { maxCount: 1, hint: 'Required. A single image' } },
    { field: 'caption', input: 'string', label: 'Caption', options: { hint: 'Shown under the image. One value per locale' } },
    { field: 'download', input: 'file', label: 'Download', localised: false, options: { maxCount: 1, hint: 'Optional file offered with the image' } },
    { field: 'link', input: 'url', label: 'Link', localised: false, options: { hint: 'Optional address the image points to' } }
  ]
}
