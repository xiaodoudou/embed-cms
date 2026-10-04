// rating, duration and money: numbers with a unit, a scale or a currency
module.exports = {
  displayname: { enUS: 'Quantities', zhCN: '数量' },
  group: { enUS: 'Numbers', zhCN: '数字' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    // rating: five stars, whole
    { field: 'stars', input: 'rating', label: 'Stars', localised: false, options: { hint: 'Five stars, click one; click it again to take the rating away' } },
    // half steps
    { field: 'hearts', input: 'rating', label: 'Hearts, with halves', localised: false, options: { icon: 'heart', half: true, hint: 'Hearts, in halves: click the left half of a heart for a half' } },
    // a scale of ten, another icon and colour
    { field: 'scale', input: 'rating', label: 'Scale of ten', localised: false, options: { max: 10, icon: 'circle', color: 'info', hint: 'Ten circles' } },
    { field: 'flames', input: 'rating', label: 'Flames', localised: false, options: { max: 3, icon: 'flame', hint: 'Three flames, for how hot' } },
    { field: 'requiredRating', input: 'rating', label: 'Required rating', localised: false, required: true, options: { clearable: false, hint: 'Required, and once given it can be changed but not taken away' } },
    { field: 'localisedRating', input: 'rating', label: 'Rating per locale', options: { hint: 'One rating per locale' } },
    { field: 'readOnlyRating', input: 'rating', label: 'Read-only rating', localised: false, options: { readonly: true, hint: 'Read-only: visible, not editable' } },
    { field: 'disabledRating', input: 'rating', label: 'Disabled rating', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } }
  ]
}
