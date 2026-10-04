// date, time, datetime and daterange
module.exports = {
  displayname: { enUS: 'Dates and times', zhCN: '日期和时间' },
  group: { enUS: 'Date and time', zhCN: '日期和时间' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    // Date only
    { field: 'date', input: 'date', label: 'Date', localised: false, options: { hint: 'Calendar date, YYYY-MM-DD' } },
    { field: 'requiredDate', input: 'date', label: 'Required date', localised: false, required: true, options: { hint: 'Required' } },
    { field: 'localisedDate', input: 'date', label: 'Date per locale', options: { hint: 'One date per locale' } },
    // Time only
    { field: 'time', input: 'time', label: 'Time', localised: false, options: { hint: 'Time of day, HH:mm:ss' } },
    { field: 'requiredTime', input: 'time', label: 'Required time', localised: false, required: true, options: { hint: 'Required' } },
    // Date and time
    { field: 'datetime', input: 'datetime', label: 'Date and time', localised: false, options: { hint: 'Date and time of day, YYYY-MM-DD HH:mm:ss' } },
    { field: 'requiredDatetime', input: 'datetime', label: 'Required date and time', localised: false, required: true, options: { hint: 'Required. Shown in local time' } },
    { field: 'readOnlyDatetime', input: 'datetime', label: 'Read-only date and time', localised: false, options: { readonly: true, hint: 'Read-only: visible and copyable, not editable' } },
    { field: 'disabledDate', input: 'date', label: 'Disabled date', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } },

    // A start and an end on one calendar
    { field: 'range', input: 'daterange', label: 'Date range', localised: false, options: { hint: 'A start and an end on one calendar; the last day is in the range' } },
    { field: 'requiredRange', input: 'daterange', label: 'Required date range', localised: false, required: true, options: { hint: 'Required: both days' } },
    { field: 'timeRange', input: 'daterange', label: 'Date range with a time', localised: false, options: { time: true, hint: 'Each end has a time' } },
    { field: 'limitedRange', input: 'daterange', label: 'Limited date range', localised: false, options: { minDate: 'today', minDays: 2, maxDays: 14, hint: 'From today on, two to fourteen days' } },
    { field: 'localisedRange', input: 'daterange', label: 'Date range per locale', options: { hint: 'One range per locale' } },
    { field: 'readOnlyRange', input: 'daterange', label: 'Read-only date range', localised: false, options: { readonly: true, hint: 'Read-only: visible, not editable' } },
    { field: 'disabledRange', input: 'daterange', label: 'Disabled date range', localised: false, options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } }
  ]
}
