// What visitors write in the support form (from a page, or from the form itself): the site is the only thing that creates them, an editor reads them in the admin and ticks them off.
module.exports = {
  displayname: { enUS: 'Messages' },
  locales: ['enUS'],
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true },
    { field: 'email', input: 'email', label: 'Email', localised: false, required: true },
    { field: 'text', input: 'text', label: 'Message', localised: false, required: true },
    { field: 'page', input: 'string', label: 'About the page', localised: false, options: { hint: 'The address of the page the visitor wrote from, when there is one' } },
    { field: 'handled', input: 'checkbox', label: 'Handled', localised: false }
  ]
}
