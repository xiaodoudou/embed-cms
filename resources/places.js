// geopoint: a place on Earth, a latitude and a longitude, with a map (OpenStreetMap by default, see the `maps` option in docs/reference/CONFIG.md) to pick it on.
module.exports = {
  displayname: { enUS: 'Places', zhCN: '地点' },
  group: { enUS: 'Place', zhCN: '地点' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    // The default: two boxes, and a button that opens a map to pick on
    { field: 'location', input: 'geopoint', label: 'Location', localised: false, options: { hint: 'A latitude and a longitude; a pair pasted in a box fills both' } },
    { field: 'requiredLocation', input: 'geopoint', label: 'Required location', localised: false, required: true, options: { hint: 'Required: both numbers' } },
    // The decimals kept: 3 is about 100 metres
    { field: 'roughLocation', input: 'geopoint', label: 'Rough location', localised: false, options: { precision: 3, hint: 'Three decimals, about a hundred metres' } },
    // Where the map looks when there is no point yet (the middle of Shanghai, zoomed on the city)
    { field: 'shanghai', input: 'geopoint', label: 'Starts in Shanghai', localised: false, options: { center: { lat: 31.2304, lng: 121.4737 }, zoom: 11, hint: 'The map opens on Shanghai' } },
    { field: 'readOnlyLocation', input: 'geopoint', label: 'Read-only location', localised: false, options: { readonly: true, hint: 'Read-only: visible, not editable' } },
    { field: 'disabledLocation', input: 'geopoint', label: 'Disabled location', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } }
  ]
}
