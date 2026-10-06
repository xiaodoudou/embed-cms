// The pages of a version, in groups (the headings of the menu on the left). A page is public, or for members when it is marked, even in a public product; for a member it is the whole of it
// (the text, the diagram and the PDF), for anyone else a title and a summary. None of it is open over /api: the site decides, for each request, what a visitor may have.
module.exports = {
  displayname: { enUS: 'Pages' },
  locales: ['enUS'],
  schema: [
    { field: 'key', input: 'string', label: 'Key', localised: false, required: true, unique: true, options: { hint: '<product>/<version>/<slug>, for example tidewater/3.0/install' } },
    { field: 'version', input: 'select', label: 'Version', localised: false, source: 'versions', required: true },
    { field: 'slug', input: 'string', label: 'Slug', localised: false, required: true, options: { hint: 'The address of the page: /<product>/<version>/<slug>' } },
    { field: 'group', input: 'string', label: 'Group', localised: false, options: { hint: 'The heading of the menu the page is under' } },
    { field: 'order', input: 'integer', label: 'Position', localised: false, options: { hint: 'In the menu of the version, from top to bottom; the first one is where the version opens. A group is where its first page is' } },
    { field: 'title', input: 'string', label: 'Title', required: true },
    { field: 'summary', input: 'text', label: 'Summary', options: { hint: 'Shown to everyone, with the title, even for a page for members' } },
    { field: 'body', input: 'wysiwyg', label: 'Text' },
    { field: 'diagram', input: 'image', label: 'Diagram', localised: false, options: { maxCount: 1 } },
    { field: 'download', input: 'file', label: 'PDF version', localised: false, options: { maxCount: 1 } },
    { field: 'membersOnly', input: 'checkbox', label: 'Members only', localised: false, options: { hint: 'The text, the diagram and the PDF are for signed-in members' } },
    { field: 'published', input: 'checkbox', label: 'Published', localised: false }
  ]
}
