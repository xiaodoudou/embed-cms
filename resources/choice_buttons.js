// radio and segmented: one value from a short list that is all in view, as radio buttons or as joined buttons
const priority = {
  low: { enUS: 'Low', zhCN: '低' },
  medium: { enUS: 'Medium', zhCN: '中' },
  high: { enUS: 'High', zhCN: '高' }
}

module.exports = {
  displayname: { enUS: 'Radios and segments', zhCN: '单选按钮和分段按钮' },
  group: { enUS: 'Choice', zhCN: '选择' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    // Segmented: a row of joined buttons, the chosen one filled
    { field: 'status', input: 'segmented', label: 'Status', localised: false, source: ['draft', 'review', 'published'], options: { hint: 'One value from a short list; pressing the chosen one again takes it away' } },
    { field: 'requiredStatus', input: 'segmented', label: 'Required status', localised: false, required: true, source: ['draft', 'review', 'published'], options: { hint: 'Required: once chosen it can be changed but not taken away' } },
    // Readable labels, one per language
    { field: 'priority', input: 'segmented', label: 'Priority', localised: false, source: ['low', 'medium', 'high'], options: { labels: priority, hint: 'Stored as low, medium or high; shown with a label per language' } },
    // Values that are numbers stay numbers
    { field: 'columns', input: 'segmented', label: 'Columns', localised: false, source: [1, 2, 3, 4], options: { hint: 'The values are numbers' } },
    { field: 'localisedAlign', input: 'segmented', label: 'Alignment per locale', source: ['left', 'centre', 'right'], options: { hint: 'One value per locale' } },
    { field: 'fixedSize', input: 'segmented', label: 'Size that stays', localised: false, source: ['S', 'M', 'L'], options: { clearable: false, hint: 'clearable: false, the choice can be changed but not taken away' } },
    { field: 'readOnlySegment', input: 'segmented', label: 'Read-only segments', localised: false, source: ['draft', 'review', 'published'], options: { readonly: true, hint: 'Read-only: visible, not editable' } },
    { field: 'disabledSegment', input: 'segmented', label: 'Disabled segments', localised: false, source: ['draft', 'review', 'published'], options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } },
    // Radio: a column of radio buttons
    { field: 'plan', input: 'radio', label: 'Plan', localised: false, source: ['free', 'team', 'business'], options: { hint: 'One value from a list; each choice can have a line of help' } },
    {
      field: 'planWithHelp',
      input: 'radio',
      label: 'Plan with a line of help',
      localised: false,
      source: ['free', 'team', 'business'],
      options: {
        labels: { free: 'Free', team: 'Team', business: 'Business' },
        descriptions: {
          free: { enUS: 'One person, three projects', zhCN: '一人，三个项目' },
          team: { enUS: 'Up to ten people, unlimited projects', zhCN: '最多十人，项目不限' },
          business: { enUS: 'Single sign-on, audit log, priority support', zhCN: '单点登录、审计日志、优先支持' }
        },
        hint: 'Each choice has a line under its label'
      }
    },
    { field: 'requiredPlan', input: 'radio', label: 'Required plan', localised: false, required: true, source: ['free', 'team', 'business'], options: { hint: 'Required' } },
    { field: 'inlineChoice', input: 'radio', label: 'Choices in a row', localised: false, source: ['yes', 'no', 'maybe'], options: { inline: true, labels: { yes: { enUS: 'Yes', zhCN: '是' }, no: { enUS: 'No', zhCN: '否' }, maybe: { enUS: 'Maybe', zhCN: '也许' } }, hint: 'inline: true' } },
    { field: 'readOnlyRadio', input: 'radio', label: 'Read-only radio', localised: false, source: ['free', 'team', 'business'], options: { readonly: true, hint: 'Read-only: visible, not editable' } },
    { field: 'disabledRadio', input: 'radio', label: 'Disabled radio', localised: false, source: ['free', 'team', 'business'], options: { disabled: true, hint: 'Disabled: greyed out and not focusable' } }
  ]
}
