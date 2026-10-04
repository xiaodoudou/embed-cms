// rating, duration and money: numbers with a scale, a unit or a currency
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
    { field: 'disabledRating', input: 'rating', label: 'Disabled rating', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } },

    // duration: kept in seconds, typed in hours and minutes by default
    { field: 'duration', input: 'duration', label: 'Duration', localised: false, options: { hint: 'Write 1:30, 1h 30m or 90 (minutes); kept as a number of seconds' } },
    { field: 'preciseDuration', input: 'duration', label: 'Precise duration', localised: false, options: { units: ['hours', 'minutes', 'seconds'], hint: 'Hours, minutes and seconds: 1:30:05' } },
    { field: 'longDuration', input: 'duration', label: 'Long duration', localised: false, options: { units: ['days', 'hours'], hint: 'Days and hours: 2d 3h' } },
    { field: 'minutesOnly', input: 'duration', label: 'Minutes only', localised: false, options: { units: ['minutes'], min: 5 * 60, max: 8 * 3600, hint: 'Minutes only, from 5 minutes to 8 hours' } },
    { field: 'requiredDuration', input: 'duration', label: 'Required duration', localised: false, required: true, options: { hint: 'Required. A length of zero is a length' } },
    { field: 'localisedDuration', input: 'duration', label: 'Duration per locale', options: { hint: 'One duration per locale' } },
    { field: 'readOnlyDuration', input: 'duration', label: 'Read-only duration', localised: false, options: { readonly: true, hint: 'Read-only: visible, not editable' } },
    { field: 'disabledDuration', input: 'duration', label: 'Disabled duration', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } },

    // money: an amount and its currency
    { field: 'price', input: 'money', label: 'Price', localised: false, options: { hint: 'An amount, with a currency from the common ones' } },
    { field: 'euroPrice', input: 'money', label: 'Price in euros', localised: false, options: { currency: 'EUR', hint: 'One currency, written beside the amount' } },
    { field: 'mixedPrice', input: 'money', label: 'Price in several currencies', localised: false, options: { currencies: ['USD', 'JPY', 'KWD'], hint: 'Dollars have 2 decimals, yen none, dinars 3: the amount takes those of the currency chosen' } },
    { field: 'limitedPrice', input: 'money', label: 'Limited price', localised: false, options: { currency: 'USD', min: 5, max: 500, hint: 'From 5 to 500 dollars' } },
    { field: 'requiredPrice', input: 'money', label: 'Required price', localised: false, required: true, options: { currency: 'USD', hint: 'Required. An amount of zero is an amount' } },
    { field: 'localisedPrice', input: 'money', label: 'Price per locale', options: { currencies: ['USD', 'CNY'], hint: 'One price per locale' } },
    { field: 'readOnlyPrice', input: 'money', label: 'Read-only price', localised: false, options: { currency: 'EUR', readonly: true, hint: 'Read-only: visible, not editable' } },
    { field: 'disabledPrice', input: 'money', label: 'Disabled price', localised: false, options: { currency: 'EUR', disabled: true, hint: 'Disabled: greyed out and not focusable' } }
  ]
}
