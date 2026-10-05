import _ from 'lodash'
import TranslateService from '@s/TranslateService'

// The radio and segmented fields: one value chosen from a short list that is all in view, as a column of radio buttons or as a row of joined buttons. The choices (a list of values,
// with the labels and the descriptions the field gives them) and the rules are here, apart from the widget, so that they are tested without a component.

/**
 * @param {*} text a text of the field: a string, or one string per locale
 * @param {string} [locale] the language the field is read in; the one of the admin when it is not given
 * @returns {string|undefined} the text in that language, else the first one there is; nothing for what is not a text
 */
function textIn (text, locale) {
  if (_.isString(text)) {
    return text
  }
  if (_.isPlainObject(text)) {
    const found = _.get(text, locale || TranslateService.locale, _.first(_.values(text)))
    return _.isString(found) ? found : undefined
  }
  return undefined
}

/**
 * @param {Object} schema the field
 * @returns {Array<{value: string|number, label: string, description: string|undefined}>} the choices, in the order of `source`: a value that is a string or a number, or
 *   `{ value, text }`; its label comes from `options.labels` (a string, or one per language), else from its `text`, else it is the value itself; its description from
 *   `options.descriptions`. A value that is listed twice is listed once, and what is not a value is left out.
 */
export function choiceItems (schema) {
  const read = key => _.get(schema, ['options', key], _.get(schema, key))
  const labels = read('labels') || {}
  const descriptions = read('descriptions') || {}
  const locale = _.get(schema, 'locale')
  const items = []
  // (the form is given the list of a field as `values`, where the declaration has it as `source`)
  const list = _.find([schema.source, schema.values], _.isArray) || []
  _.each(list, (entry) => {
    const value = _.isPlainObject(entry) ? entry.value : entry
    if (!(_.isString(value) && value !== '') && !_.isFinite(value)) {
      return
    }
    if (_.some(items, { value })) {
      return
    }
    items.push({
      value,
      label: textIn(labels[value], locale) || (_.isPlainObject(entry) && _.isString(entry.text) && entry.text) || String(value),
      description: textIn(descriptions[value], locale)
    })
  })
  return items
}

/**
 * @param {Object} schema the field
 * @returns {{items: Array<Object>, clearable: boolean, inline: boolean}} what the field says: its choices, whether the choice can be taken away (by default when the field is not
 *   required, never when it is), and whether the radio buttons stand in a row instead of a column
 */
export function choiceOptions (schema) {
  const read = key => _.get(schema, ['options', key], _.get(schema, key))
  return {
    items: choiceItems(schema),
    clearable: !_.get(schema, 'required', false) && read('clearable') !== false,
    inline: read('inline') === true
  }
}

/**
 * @param {Object} schema the field
 * @param {*} value what the record holds
 * @returns {string|null} what is wrong with it: missing when required, or not one of the choices; null when it is fine
 */
export function validateChoice (schema, value) {
  const t = (key, params) => TranslateService.get(key, params)
  if (_.isNil(value) || value === '') {
    return _.get(schema, 'required', false) ? t('TL_FIELD_IS_REQUIRED') : null
  }
  return _.some(choiceItems(schema), { value }) ? null : t('TL_CHOICE_UNKNOWN', { value: String(value) })
}
