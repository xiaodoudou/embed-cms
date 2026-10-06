// The versions of a product. The one that is `current` is where /<product>/latest/ goes; an archived version is shown with a banner that points to the current one; a version that is
// not published is not shown to anyone (it is the draft of the next one). None of it is open over /api: the site reads the CMS in its own process (see platform.js).
module.exports = {
  displayname: { enUS: 'Versions' },
  locales: ['enUS'],
  schema: [
    { field: 'key', input: 'string', label: 'Key', localised: false, required: true, unique: true, options: { hint: '<product>/<version>, for example tidewater/3.0: how the content file and the editors name it' } },
    { field: 'product', input: 'select', label: 'Product', localised: false, source: 'products', required: true },
    { field: 'slug', input: 'string', label: 'Version', localised: false, required: true, options: { hint: 'The address of the version: /<product>/<version>/ (not "latest")' } },
    { field: 'order', input: 'integer', label: 'Position', localised: false, options: { hint: 'In the version switcher; smaller numbers come first' } },
    { field: 'current', input: 'checkbox', label: 'Current', localised: false, options: { hint: 'One a product: where /latest/ goes' } },
    { field: 'archived', input: 'checkbox', label: 'Archived', localised: false, options: { hint: 'Still online, with a banner that says it is old' } },
    { field: 'published', input: 'checkbox', label: 'Published', localised: false }
  ]
}
